# SHOWKARDZ

A number-keyed, offline-first tool for sports card show dealers. Price your showcase at home the night before, run cash sales and trades at the table with instant deal math, and close the day with per-card books and a shrink audit.

Strictly seller-side. No marketplace. Free to run.

**Status: planning.** No application code yet. This repo currently holds the spec and the interaction design. Build has not been called.

---

## The idea in one paragraph

Cards carry a plain number sticker — nothing else. The price lives in the app, so stickers never go stale and repricing is a database edit instead of a re-sticker job. At home on wifi you scan the stack with your phone, declare what the camera can't read (year, product, parallel), check real eBay sold listings, and set your price. At the show you type the numbers off the stickers, and the app does the deal math offline. At close you get card-level books and a count of what should still be in the case.

## The three steps

**1 — Night before (home, wifi).** Declare the stack. Scan each card: the camera reads the sticker number and the printed name, the title composes from the stack declaration. Then the price pass — tap through to real eBay sold listings, eyeball the last handful, type your price, and optionally a floor.

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

## Repo layout

```
design/    Interaction specs. Open in a browser — every zone is numbered
           and annotated with what it does and why it exists.
docs/      SRD, open questions, platform constraints.
```

| File | What it covers |
|---|---|
| `design/01-night-before.html` | Intake (scan the stack) and the price pass. Phone-first, with states. |
| `design/02-show-day-cash-sale.html` | The cash sale screen, with floor-breach and bad-number states. |
| `docs/SRD.md` | Full spec: workflow, adopted features, market context. |
| `docs/open-questions.md` | Decisions still owed before build. |
| `docs/platform-constraints.md` | iOS PWA realities that shape the data model. |

Not yet designed: the trade screen (two dials, who owes cash) and close-out.

## Stack (when build is called)

React + TypeScript PWA on Vercel. Firebase Auth + Firestore with offline persistence and queued writes. Serverless functions in `api/`, each fully self-contained.

Two invariants to protect from day one:

- **Duplicate sticker numbers are blocked.** The one hard integrity rule in the product.
- **Sold wins.** The merge rule for offline-tolerant sync. Totals are derived from records, never from counters. The physical card is the real lock — one card, one hand — so genuine conflicts are rare by nature.

## Project tracking

Planned and tracked in Dev Hub under project slug `seller-table-tool` (prefix `STT`).
