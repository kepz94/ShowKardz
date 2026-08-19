# SHOWKARDZ

A number-keyed, offline-first tool for sports card show dealers. Price your showcase at home the night before, run cash sales and trades at the table with instant deal math, and close the day with per-card books and a shrink audit.

Strictly seller-side. No marketplace. Free to run.

**Status: building.** The app runs — four screens, the money math and the integrity rule under test, installable to the home screen. Records are local to the device; Firestore sync is not wired yet (see Known gaps).

---

## The idea in one paragraph

Cards carry a plain number sticker — nothing else. The price lives in the app, so stickers never go stale and repricing is a database edit instead of a re-sticker job. At home on wifi you scan the stack with your phone, declare what the camera can't read (year, product, parallel), check real eBay sold listings, and set your price. At the show you type the numbers off the stickers, and the app does the deal math offline. At close you get card-level books and a count of what should still be in the case.

## The five screens

**Scan** — getting cards in, and nothing else. Type the sticker number, photograph the card and it reads the player name off it on-device — free, no account, no per-scan cost — next. No collection, no filters, no totals: everything that is not the next card is a reason to look up. Turn on **Group scan** and the running batch appears — that is the one case where seeing your other scans is the point.

**Book** — the collection. Everything ever scanned, with its photo. Name, group, price and floor are filled in here, from the card's own screen: a link to real eBay sold listings, your price, an optional floor. Filter by state or by group, search by name or number.

**Groups are optional and opt-in.** A group supplies year, product and parallel to every card in it, so titles compose themselves — but nothing needs one, they appear only once you create one, and a card can be moved in or out at any time.

**Show** — the register, offline. Type the number off the sticker; the name and price come back as a typo guard. Running total, percent-of-price dial, floor warning before a bundle drops, mark sold.

**Sales** — the record. What was taken against what was asked, the day log card by card (ask → realized), and the case audit against a physical count.

**Receipts** — money out. Table fees, travel, cards you bought. Photograph a paper slip, or upload a screenshot of a digital receipt from your photos or files; expenses net against sales so a show has a real profit number.

## The workflow behind them

**1 — Night before (home, wifi).** Enter the stack: peel a number, stick it on the sleeve, type it in, next. Nothing else is required. Optionally declare a group so year, product and parallel compose into every title. Then the price pass — tap through to real eBay sold listings, eyeball the last handful, type your price, and optionally a floor.

**2 — Show day (phone, offline).** Type the pulled numbers. Each one echoes the card name as a typo guard. Running total, deal math, floor warnings before a bundle drops under what you'd take. Trades value both sides with a spread. Mark sold.

**3 — Close out.** Per-deal, card-level day log. Case audit: what the app thinks is still in the case, against a physical count.

## Principles (each is load-bearing)

1. **The sticker is a pointer, not a price.** Price lives in the app. Stickers never go stale.
2. **Humans declare what isn't printed.** Group tags supply year, product, set and parallel. The camera reads only what's printed. No card-ID database needed — that database is the moat of funded competitors, and this design routes around it.
3. **Offline where it matters.** All the smart work happens at home on wifi. The show floor needs zero signal.
4. **Claims vs receipts.** Any number shown to a buyer is labeled. Your price is your claim. Market evidence is a tappable link to real eBay solds. The app never launders a dealer-entered number into "market price," and never displays a market figure it has no way to obtain.
5. **Single-player only.** One dealer gets full value on day one. No marketplace layer.

## Locked decisions

- **Type the number. No QR, no scanning at checkout.** A QR is just a number a camera can read — the upgrade path stays open without a data-model change.
- **Comps by free eBay sold-listings link-out. No paid data API.** eBay's official sold-data door is effectively closed to small developers: the Finding API was decommissioned Feb 2025 and Marketplace Insights is partner-gated. Slab certs (PSA/SGC/CGC/BGS) are the exception — the one authoritative free-ish lookup, for graded cards.
- **No stored market figure.** Because there's no API, the app cannot know a card's sold price. The market read happens during the night-before price pass and comes out as your price. Show day displays your number and a link — never an app-asserted market value that would be stale by the time a buyer checks it.
- **Add to Home Screen is a requirement, not a suggestion.** iOS caps script-writable storage at seven days of inactivity; installed home-screen web apps get their own days-of-use counter that resets on real use. Used as a browser tab, a dealer who works one show a month could find an empty case.
- **Local storage is a cache, never the record.** Firestore is the truth. Corollary product rule: open the app on wifi before leaving for the show, not at the table.
- **Phone-first.** The rear camera has autofocus and macro; a laptop webcam is a fixed-focus wide-angle pointed at your face. The phone is the scanner. The laptop is the same screens at more width.
- No marketplace, no aggregated price signal — cut deliberately.

## Running it

```
npm install
npm run dev        # http://localhost:5173
npm test           # the logic suite — money math, floors, merge rules, integrity
npm run test:rules # firestore.rules against the emulator (needs Java)
npm run build      # tsc --noEmit && vite build
```

`test:rules` runs every allow and every deny as a real request against the rules
engine. It is deliberately not part of the deploy gate — it needs Java and the
emulator — but it is the only thing that actually proves the rules, and reading
them is not a substitute: the first version denied every write in the app because
a function referenced a path variable it could not see.

Deployed by GitHub Actions to Pages on every push to `main`.

## Repo layout

```
src/lib/     Logic, all of it pure and tested: deal math, floors, sticker
             numbers, title composition, comps URLs, the sold-wins merge
             rule, and the reducer that is the single write path.
src/screens/ One screen per step of the day.
design/      Interaction specs. Open in a browser — every zone is numbered
             and annotated with what it does and why it exists.
docs/        SRD, open questions, platform constraints.
```

| File | What it covers |
|---|---|
| `design/01-night-before.html` | Intake (scan the stack) and the price pass. Phone-first, with states. |
| `design/02-show-day-cash-sale.html` | The cash sale screen, with floor-breach and bad-number states. |
| `docs/SRD.md` | Full spec: workflow, adopted features, market context. |
| `docs/open-questions.md` | Decisions still owed before build. |
| `docs/platform-constraints.md` | iOS PWA realities that shape the data model. |

Not yet designed: the trade screen (two dials, who owes cash) and close-out.

## Stack

React + TypeScript PWA, built with Vite. Firebase Auth (Google) + Firestore, with
offline persistence and queued writes.

Sync is an enhancement, never a requirement: the app runs fully signed out, from
`localStorage`. Signing in merges this device's records with the account's and
keeps them in step. The Firebase SDK is loaded after first paint so it never sits
in the critical path.

**Publishing `firestore.rules` is a separate step from deploying the app.** It does
not ride the GitHub Pages build — Firebase console → Firestore Database → Rules → Publish.

Both invariants are enforced and covered by tests from day one:

- **Duplicate sticker numbers are blocked** — in the reducer, not in a screen, so no
  new entry path can forget the rule. The one hard integrity rule in the product.
- **Sold wins.** The merge rule for offline-tolerant sync, implemented in
  `src/lib/merge.ts` ahead of the sync that will use it. Totals are derived from
  records, never from counters. The physical card is the real lock — one card, one
  hand — so genuine conflicts are rare by nature.

## Known gaps

- **Sync is unverified on a real device.** The merge and change-detection rules are
  covered by tests, but two phones actually reconciling has not been observed —
  that pass is owed.
- **Read accuracy is unmeasured on real cards.** On a synthetic high-contrast card
  the on-device reader returns the player name in about a second. On a synthetic
  low-contrast foil card it returns nothing — quickly and cleanly, but nothing.
  Foil, refractors and stylised fonts have never been tried on real stock.
- **The printed card number is unreliable.** The name is the field that works; the
  card number is best-effort and did not survive synthetic text. It is deliberately
  conservative — it would rather report nothing than invent a number from noise.
- **Google Vision is an optional fallback**, used only when the on-device read finds
  no name AND `VISION_API_KEY` is set as a repository secret. Nothing needs it.
- **Cash sales only.** The trade screen (two dials, who owes cash) is neither
  designed nor built. Hold tabs, lot mode and the dead-weight radar are not built.
- **One stack at a time.** The night-before flow uses the most recently declared
  stack; there is no stack switcher.

## Project tracking

Planned and tracked in Dev Hub under project slug `seller-table-tool` (prefix `STT`).
