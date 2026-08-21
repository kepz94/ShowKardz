#!/usr/bin/env node
/**
 * The UI audit: build the app the way it ships, walk every screen on a phone
 * viewport, and fail if anything is malformed.
 *
 *   npm run audit:ui              build, then check every scene
 *   npm run audit:ui -- --keep    reuse the last audit build (fast re-runs)
 *   npm run audit:ui -- --self-test   prove each check fails when broken
 *
 * Exit codes are three-way on purpose:
 *   0  every scene clean
 *   1  the app has a problem — the output names the element and the numbers
 *   2  the audit could not run (no browser, build failed, preview died).
 *      A run that could not look at anything must never read as a pass.
 *
 * WHY A BUILD AND NOT `vite dev`: the dev server serves unminified modules with
 * different font loading and no service worker. The bug this exists to catch —
 * a webfont that never arrives, so everything silently falls back to Georgia —
 * only shows up in the built output.
 *
 * WHY A DUMMY VISION KEY: with no key, visionConfigured() is false and Scan
 * refuses to read, so the read sheet — the screen that hid 24px buttons for
 * weeks — never renders. The key is never used: the audit intercepts the
 * request and answers with a real captured response committed to the repo.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { IN_PAGE_AUDIT, failuresFor } from './checks.mjs';
import { SCENES } from './scenes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = 'dist-audit';          // never the real dist — a run must not overwrite a deploy
const FIRST_PORT = Number(process.env.AUDIT_PORT || 4321);

/* iPhone 14/15 in portrait. The narrowest phone still in real use is 375px; the
   layout is checked at 390 because that is what the owner carries. */
const VIEWPORT = { width: 390, height: 844 };

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const SELF_TEST = args.includes('--self-test');

const VISION_FIXTURE = readFileSync(
  path.join(ROOT, 'src/lib/__real-vision-response.json'), 'utf8');

const die = (msg) => { console.error(`\naudit: ${msg}`); process.exit(2); };

function run(cmd, cmdArgs, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    p.on('exit', resolve);
    p.on('error', () => resolve(1));
  });
}

const canConnect = (port) => new Promise((resolve) => {
  const s = createConnection({ port, host: 'localhost' })
    .on('connect', () => { s.end(); resolve(true); })
    .on('error', () => resolve(false));
});

async function waitForServer(port, ms = 30000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await canConnect(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Chromium, wherever this machine keeps it. */
async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    // Some images ship the binary outside Playwright's own layout.
    if (existsSync('/opt/pw-browsers/chromium')) {
      try { return await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
      catch { /* fall through to the message below */ }
    }
    die(`no Chromium to run in. Install one with:\n  npx playwright install chromium\n\n${e.message}`);
  }
}

/**
 * One scene, start to finish: a fresh page with its own seeded store.
 *
 * The seed goes in through addInitScript, NOT by writing localStorage and
 * reloading. The app flushes its state on pagehide, so a reload lets the old
 * empty page overwrite the seed on its way out — the seed appears to work and
 * then silently isn't there.
 */
async function inspect(browser, scene) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    // The service worker is same-origin and would serve a previous run's build.
    serviceWorkers: 'block',
  });

  await context.addInitScript(({ seed }) => {
    localStorage.setItem('showkardz.db.v1', JSON.stringify(seed));
  }, { seed: scene.seed });

  // Vision never gets called for real: the fixture is a response captured off
  // an actual card, so the read sheet renders the text lengths it renders live.
  await context.route('**/vision.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: VISION_FIXTURE }));

  const page = await context.newPage();
  const crashes = [];
  page.on('pageerror', (e) => crashes.push(`${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') crashes.push(m.text()); });

  const failures = [];
  try {
    await page.goto(BASE + scene.hash, { waitUntil: 'load' });
    await page.waitForSelector('.app', { timeout: 15000 });
    if (scene.drive) await scene.drive(page);
    // Measuring before the webfonts land measures the fallback face, and the
    // fallback is narrower than Caprasimo — every width would read as fitting.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);

    const report = await page.evaluate(IN_PAGE_AUDIT);
    failures.push(...failuresFor(scene.name, report));
  } catch (e) {
    failures.push(`${scene.name}: could not reach this screen — ${e.message.split('\n')[0]}`);
  }

  for (const c of crashes) failures.push(`${scene.name}: console error — ${c.slice(0, 160)}`);
  await context.close();
  return failures;
}

/**
 * Proof the checks can fail.
 *
 * A green suite is worth nothing until each assertion has been watched failing.
 * Every breakage below is injected into a real, otherwise-clean screen, and the
 * matching failure has to come back. If one stops firing, the check has gone
 * dead and this run says so.
 */
const BREAKAGES = [
  {
    name: 'text cut off',
    expect: /text cut off/,
    inject: () => {
      const d = document.createElement('div');
      d.className = 'audit-break';
      d.style.cssText = 'width:60px;white-space:nowrap;overflow:hidden';
      d.textContent = 'a name far too long for sixty pixels of box';
      document.body.appendChild(d);
    },
  },
  {
    name: 'past the viewport',
    expect: /extends to \d+px past/,
    inject: () => {
      const d = document.createElement('div');
      d.className = 'audit-break';
      d.style.cssText = 'position:absolute;top:0;left:300px;width:400px;height:20px';
      d.textContent = 'over the edge';
      document.body.appendChild(d);
    },
  },
  {
    name: 'tap target under 44px',
    expect: /tap target .* under 44/,
    inject: () => {
      const b = document.createElement('button');
      b.className = 'audit-break';
      b.style.cssText = 'height:22px;padding:0;font-size:11px';
      b.textContent = 'tiny';
      document.body.appendChild(b);
    },
  },
  {
    name: 'control that makes iOS zoom',
    expect: /makes iOS zoom/,
    inject: () => {
      const i = document.createElement('input');
      i.id = 'audit-break-input';
      i.style.cssText = 'font-size:13px';
      document.body.appendChild(i);
    },
  },
  {
    name: 'sideways scroll',
    expect: /scrolls sideways/,
    inject: () => {
      // overflow-x:clip on html/body is what stops the page scrolling sideways,
      // so a wide child alone proves nothing — the breakage has to remove the
      // guard as well, which is exactly the regression being watched for.
      document.documentElement.style.overflowX = 'visible';
      document.body.style.overflowX = 'visible';
      const app = document.querySelector('.app');
      if (app) app.style.overflowX = 'visible';
      const d = document.createElement('div');
      d.className = 'audit-break';
      d.style.cssText = 'width:900px;height:8px;background:red';
      document.body.appendChild(d);
    },
  },
  {
    name: 'weight off the system',
    expect: /font-weight 300 is outside/,
    inject: () => {
      const d = document.createElement('div');
      d.className = 'audit-break';
      d.style.cssText = 'font-weight:300';
      d.textContent = 'light';
      document.body.appendChild(d);
    },
  },
  {
    name: 'size off the scale',
    expect: /font-size 9px is outside/,
    inject: () => {
      const d = document.createElement('div');
      d.className = 'audit-break';
      d.style.cssText = 'font-size:9px';
      d.textContent = 'tiny type';
      document.body.appendChild(d);
    },
  },
];

async function selfTest(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' });
  const scene = SCENES.find((s) => s.name === 'collection');
  await context.addInitScript(({ seed }) => {
    localStorage.setItem('showkardz.db.v1', JSON.stringify(seed));
  }, { seed: scene.seed });
  const page = await context.newPage();
  await page.goto(BASE + scene.hash, { waitUntil: 'load' });
  await page.waitForSelector('.app');
  await page.evaluate(() => document.fonts.ready);

  const dead = [];
  for (const b of BREAKAGES) {
    await page.evaluate(b.inject);
    await page.waitForTimeout(60);
    const report = await page.evaluate(IN_PAGE_AUDIT);
    const caught = failuresFor('self-test', report).some((f) => b.expect.test(f));
    console.log(`  ${caught ? '✓ caught' : '✗ MISSED'}  ${b.name}`);
    if (!caught) dead.push(b.name);
    // Undo, so each breakage is proved on its own rather than on the pile.
    await page.evaluate(() => {
      document.querySelectorAll('.audit-break,#audit-break-input').forEach((n) => n.remove());
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
      const app = document.querySelector('.app');
      if (app) app.style.overflowX = '';
    });
  }
  await context.close();
  return dead;
}

/* ------------------------------------------------------------------ */

if (!KEEP) {
  console.log('Building the app as it ships…');
  const code = await run(process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'],
    // Never a real key. It only has to be non-empty for the read sheet to exist.
    { VITE_VISION_KEY: 'audit-fixture-key' });
  if (code !== 0) die('the build failed — fix that first');
} else if (!existsSync(path.join(ROOT, OUT))) {
  die(`--keep was passed but ${OUT}/ is not there. Run without --keep once.`);
}

/* Walk up to a free port rather than dying on a busy one. A leftover preview
   from an interrupted run would otherwise block every run after it, and an
   audit that cannot start is the same as an audit nobody runs. */
let PORT = FIRST_PORT;
while (await canConnect(PORT)) {
  PORT += 1;
  if (PORT > FIRST_PORT + 20) die('no free port in range. Set AUDIT_PORT.');
}
const BASE = `http://localhost:${PORT}/ShowKardz/`;

/* Vite's bin directly, not `npx`: killing npx leaves the node process it
   spawned holding the port, and the next run dies on "port is busy". */
const VITE_BIN = path.join(ROOT, 'node_modules/vite/bin/vite.js');
const preview = spawn(process.execPath,
  [VITE_BIN, 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' });
const shutdown = () => { try { preview.kill(); } catch { /* already gone */ } };
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(2); });

if (!await waitForServer(PORT)) { shutdown(); die('the preview server never came up'); }

const browser = await launch();
let failures = [];

if (SELF_TEST) {
  console.log('\nProving each check fails when the thing it watches is broken:\n');
  const dead = await selfTest(browser);
  await browser.close();
  shutdown();
  if (dead.length) {
    console.error(`\n${dead.length} check(s) did not fire: ${dead.join(', ')}`);
    console.error('A check that cannot fail is not a check. Fix or remove it.');
    process.exit(1);
  }
  console.log('\nAll checks fire. A clean run means something.');
  process.exit(0);
}

console.log(`\nWalking ${SCENES.length} screens at ${VIEWPORT.width}×${VIEWPORT.height}…\n`);
for (const scene of SCENES) {
  const found = await inspect(browser, scene);
  console.log(`  ${found.length ? '✗' : '✓'} ${scene.name}${found.length ? `  (${found.length})` : ''}`);
  failures = failures.concat(found);
}
await browser.close();
shutdown();

if (failures.length) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\nAll ${SCENES.length} screens are clean.`);
