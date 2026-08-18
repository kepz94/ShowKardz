import { describe, it, expect } from 'vitest';
import { normalizeNumber, isValidNumber, findByNumber, isDuplicate } from './numbers';
import type { Card } from '../types';

const card = (number: string, over: Partial<Card> = {}): Card => ({
  id: 'id-' + number, number, name: 'Player', stackId: 's1', status: 'available',
  createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z', ...over,
});

describe('normalizeNumber', () => {
  it('strips surrounding whitespace', () => {
    expect(normalizeNumber('  0455 ')).toBe('0455');
  });

  it('preserves leading zeros, because the sticker has them', () => {
    expect(normalizeNumber('0455')).toBe('0455');
  });

  it('drops any character that is not a digit', () => {
    expect(normalizeNumber('04-55')).toBe('0455');
  });
});

describe('isValidNumber', () => {
  it('accepts a run of digits', () => {
    expect(isValidNumber('0455')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isValidNumber('')).toBe(false);
  });

  it('rejects anything with no digits at all', () => {
    expect(isValidNumber('abc')).toBe(false);
  });
});

describe('findByNumber', () => {
  it('finds a card by its sticker number', () => {
    expect(findByNumber([card('0455'), card('0456')], '0456')?.id).toBe('id-0456');
  });

  it('matches regardless of how the number was typed', () => {
    expect(findByNumber([card('0455')], ' 04-55 ')?.id).toBe('id-0455');
  });

  it('returns undefined for a number that is not in the case', () => {
    expect(findByNumber([card('0455')], '9999')).toBeUndefined();
  });
});

describe('isDuplicate', () => {
  it('blocks a number already in use', () => {
    expect(isDuplicate([card('0455')], '0455')).toBe(true);
  });

  it('allows a number that is free', () => {
    expect(isDuplicate([card('0455')], '0456')).toBe(false);
  });

  it('still blocks when the existing card is already sold, because the record persists', () => {
    expect(isDuplicate([card('0455', { status: 'sold' })], '0455')).toBe(true);
  });

  it('does not count the card being edited as its own duplicate', () => {
    expect(isDuplicate([card('0455')], '0455', 'id-0455')).toBe(false);
  });
});
