/**
 * Firestore rules, tested against the real rules engine in the emulator.
 *
 * These rules are the ONLY gate on the data: the Firebase config is public, so
 * anyone can call the API directly and nothing here may assume the app behaves
 * well. That makes "I read them and they look right" an unacceptable standard —
 * every allow and every deny below is an actual request.
 *
 * Run with: npm run test:rules   (needs Java; not part of the deploy gate)
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

const ME = 'kepu';
const SOMEONE_ELSE = 'stranger';

const card = (over: Record<string, unknown> = {}) => ({
  id: 'c1', number: '0455', name: 'Anthony Edwards', stackId: 's1', status: 'available',
  priceCents: 5000, createdAt: '2026-08-18T12:00:00.000Z', updatedAt: '2026-08-18T12:00:00.000Z',
  ...over,
});

const receipt = (over: Record<string, unknown> = {}) => ({
  id: 'r1', amountCents: 4000, category: 'table', note: 'Saturday table',
  createdAt: '2026-08-18T12:00:00.000Z', updatedAt: '2026-08-18T12:00:00.000Z', ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'showkardz-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const mine = () => env.authenticatedContext(ME).firestore();
const theirs = () => env.authenticatedContext(SOMEONE_ELSE).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('ownership', () => {
  it('lets me write my own card', async () => {
    await assertSucceeds(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card()));
  });

  it('lets me read my own card back', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ME, 'cards', 'c1'), card());
    });
    await assertSucceeds(getDoc(doc(mine(), 'users', ME, 'cards', 'c1')));
  });

  it('stops another signed-in user reading my records', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ME, 'cards', 'c1'), card());
    });
    await assertFails(getDoc(doc(theirs(), 'users', ME, 'cards', 'c1')));
  });

  it('stops another signed-in user writing into my records', async () => {
    await assertFails(setDoc(doc(theirs(), 'users', ME, 'cards', 'c1'), card()));
  });

  it('stops another user listing my whole collection', async () => {
    await assertFails(getDocs(collection(theirs(), 'users', ME, 'cards')));
  });

  it('shuts out anyone not signed in', async () => {
    await assertFails(getDoc(doc(anon(), 'users', ME, 'cards', 'c1')));
    await assertFails(setDoc(doc(anon(), 'users', ME, 'cards', 'c1'), card()));
  });
});

describe('deletion', () => {
  it('refuses a hard delete, because records are tombstoned', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ME, 'receipts', 'r1'), receipt());
    });
    await assertFails(deleteDoc(doc(mine(), 'users', ME, 'receipts', 'r1')));
  });

  it('allows the tombstone itself, which is an ordinary write', async () => {
    await assertSucceeds(setDoc(
      doc(mine(), 'users', ME, 'receipts', 'r1'),
      receipt({ deletedAt: '2026-08-18T13:00:00.000Z', updatedAt: '2026-08-18T13:00:00.000Z' }),
    ));
  });
});

describe('validation — the client is not trusted', () => {
  it('rejects a card whose document id does not match its record id', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card({ id: 'somethingelse' })));
  });

  it('rejects a card with no sticker number', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card({ number: '' })));
  });

  it('rejects a card status the app does not have', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card({ status: 'stolen' })));
  });

  it('rejects a negative price', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card({ priceCents: -1 })));
  });

  it('rejects a price that is not a whole number of cents', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), card({ priceCents: 50.5 })));
  });

  it('rejects an oversized name', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'),
      card({ name: 'x'.repeat(201) })));
  });

  it('rejects a zero-amount expense', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'receipts', 'r1'),
      receipt({ amountCents: 0 })));
  });

  it('rejects an expense category the app does not have', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'receipts', 'r1'),
      receipt({ category: 'bribes' })));
  });

  it('accepts a card with no price yet, which is how intake files them', async () => {
    const { priceCents, ...unpriced } = card({ status: 'unpriced' });
    void priceCents;
    await assertSucceeds(setDoc(doc(mine(), 'users', ME, 'cards', 'c1'), unpriced));
  });
});

describe('collection allowlist', () => {
  it('refuses a collection the app does not use', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'secrets', 'x1'), { id: 'x1' }));
  });
});

describe('shows', () => {
  const show = (over: Record<string, unknown> = {}) => ({
    id: 'sh1', name: 'Riverside Hall B', date: '2026-09-05',
    phase: 'prep', packedStackIds: [], createdAt: '2026-08-19T00:00:00.000Z', ...over,
  });

  it('accepts a show, because a new collection is DENIED until it is allowlisted', async () => {
    await assertSucceeds(setDoc(doc(mine(), 'users', ME, 'shows', 'sh1'), show()));
  });

  it('rejects a phase no screen knows how to render', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'shows', 'sh1'), show({ phase: 'halftime' })));
  });

  it('rejects a nameless show', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'shows', 'sh1'), show({ name: '' })));
  });

  it('rejects a packing list that is not a list', async () => {
    await assertFails(setDoc(doc(mine(), 'users', ME, 'shows', 'sh1'), show({ packedStackIds: 'g1' })));
  });

  it('refuses another account\u2019s show', async () => {
    await assertFails(setDoc(doc(mine(), 'users', 'someone-else', 'shows', 'sh1'), show()));
  });
});
