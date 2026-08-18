# SHOWKARDZ — SRD

Discovery Aug 2026. Amended Aug 18, 2026 (name, phone-first intake, no stored market figure).

## One-liner

A number-keyed, offline-first tool that lets a sports card dealer price their showcase at home the night before, run cash sales and trades at the table with instant deal math, and close the day with per-card books and a shrink audit. Strictly seller-side. No marketplace. Free to run.

## Problem and user

Show dealers price by hand the night before — hours of comps lookups, handwritten stickers that go stale mid-weekend. They do bundle and deal math on a phone calculator mid-negotiation. They have no record of what sold, for how much, or whether the case still adds up at close.

First target user is a friend of Kepu's who actively deals shows — a real test user, available. Venue connectivity is unreliable. Stands typically run a laptop and phone combo.

## Core principles

1. **The sticker is a pointer, not a price.** Cards carry only a number from a pre-printed sequential roll — peel and stick. Price lives in the app, so stickers never go stale and repricing is a database edit.
2. **Humans declare what isn't printed.** Group tags, declared once per stack, supply year, product, set and parallel. The camera reads only what's printed. No card-ID database needed — that database is the moat of funded competitors, and this design routes around it.
3. **Offline where it matters.** All the smart work — scan, comps, pricing — happens at home on wifi. The show floor needs zero signal.
4. **Claims vs receipts.** Any number shown to a buyer is labeled. The dealer's price is "my price." Market evidence is a tappable link to real eBay sold listings. The app never launders a dealer-entered number into "market price," and never displays a market figure it has no way to obtain.
5. **Single-player only.** One dealer gets full value on day one. The marketplace layer was cut deliberately — integrity, plus no network cold-start problem.

## Workflow

### Night before — home, wifi, phone as the scanner

Declare the stack: "2023 Panini Prizm · Base." It stays pinned on screen through the whole run, because it's the one thing the camera can't read and the one thing that fails silently.

Per card: peel the next number from the roll, stick it on the sleeve or slab, lay the card flat and hold the phone over it. One shot reads the sticker number and the printed player name. The title composes as [stack product] + [parallel token, omitted for base] + [player and card number]. Green band plus beep means entered. A low tone means retry. A duplicate number is blocked — the one hard integrity rule. Scanning fires automatically on a confident read, so **Undo last** is a first-class control, reachable by thumb.

New scans land unpriced, on purpose. Scanning and pricing are separate passes: you have a stack in one hand and a sticker roll in the other, and stopping to look up comps on every card means putting it all down and picking it back up, two hundred times.

Then the price pass, one card at a time with position always visible. Tap the auto-built eBay sold-comps link — a real URL, no API — eyeball the last handful, type your price. Optional floor: the least you'd take. **Skip** is a real answer for cards you can't read the market on, because a guessed price at the table is worse than a card you know isn't priced.

Because tapping the comps link leaves the app entirely, queue position and any half-typed price are persisted on every change, not on save.

### Show day — phone in hand, laptop as dashboard

**Cash sale.** Type the pulled numbers off the stickers. Each one echoes the card name and price as a typo guard before it joins the sale. Running total. Percent slider for deal math, or reverse-offer: type their dollar figure and see it as a percentage instantly. A floor warning fires before a bundle dips below the combined floors — it warns, it does not block. The charge button carries the amount, so there's never a question of what was just taken. Mark sold.

**Trade.** Your side is numbers. Their side is quick ad-hoc lines valued live — snap, comps link, type a value. Two dials set the spread; the spread is the margin. A delta shows who owes cash. Incoming cards absorb into inventory with cost basis equal to the credited value.

Repricing is available at any time. Stickers are unaffected.

### Close out

Day log with per-deal, card-level detail: each card's number, title, and realized price; trades show both sides, the spread, and who owed cash; timestamps throughout.

Case audit: active numbers as chips against a physical count — a shrink and theft check dealers don't have today.

Records carry over. The next show is touch-ups, not a restart.

## Adopted feature layers

Hold tabs (named holds, first-write-wins) · reverse-offer math · buyer-facing running display (receipts rule applies) · per-card floors · voice pricing pass · lot mode (price a stack or dollar box as one line — the bulk-scale answer) · reprice-only-the-movers (staleness trigger; the comps-drift trigger would require paid data and is off under link-only) · dead-weight radar (shows survived unsold) · private realized-price log (never aggregated or shared).

## Locked decisions

- Pre-printed sequential number roll. Handwritten is acceptable. **No QR, no scanning at checkout — type the number.** A QR is just a number a camera can read; the upgrade path is preserved without a data-model change.
- Name and title auto-composed from the photo. Errors here are cosmetic by design, never financial.
- **Comps by free eBay sold-listings link-out. No paid data API.** eBay's official sold-data door is effectively closed to small developers: the Finding API was decommissioned Feb 2025 and Marketplace Insights is partner-gated. Third-party options exist if "free" ever stops being the constraint — SoldComps (~$9/mo), PriceCharting / SportsCardsPro, Ximilar / CardGrader photo-ID plus price. Slab certs are the exception: PSA, SGC, CGC and BGS cert lookups are the one authoritative free-ish database, for graded cards.
- **No stored market figure.** Follows from the above: with no API the app cannot know a sold price, and a figure captured at pricing time is stale by the time a buyer checks their own phone. The market read comes out as the dealer's price.
- **Phone-first.** The phone is the scanner. The laptop is the same screens at more width.
- **Add to Home Screen is required.** See `platform-constraints.md`.
- Laptop plus phone with offline-tolerant sync — local cache and queued writes. Merge rule: **sold wins.** Totals are derived from records, never counters. The physical card is the real lock — one card, one hand — so genuine conflicts are rare by nature.
- No marketplace, no aggregated price signal.

## Market context (verified Aug 2026)

Dealer show tooling is a fresh, unconsolidated wave: Slabbie (pre-launch, slab-scan to price label via pocket printer), Double Holo Vendor Hub (open beta, free, NIIMBOT labels, repricing, per-show P&L), Slabfy Card Show POS ($40/mo), CardShow Pro (Table Mode).

Differentiators: number-first with no scan hardware at the table, free comps by link, offline-first, two-dial trade math, floors wired into live bundle math, and the close-out audit.

The older commercialized layer — Card Ladder, CollX / Card Dealer Pro, Ludex, Beckett — owns data and scanning, and is deliberately not competed with.

## Design learnings

- Organize screens by **time** (night before / show day / close out), not by feature. Every step labeled with what it is and why. One primary action per screen.
- Every judgment field is the dealer's own input: price, floor, stack declaration. Nothing pre-set.
- The close-out log must show per-card detail, not deal summaries.
- Screens must render and navigate with scripts dead — stacked fallback plus anchor nav.
- Function before looks. An interaction that doesn't work cannot be rescued by a visual direction, and "minimal" means tidying the existing register, not changing themes.
- Scope is encoded by position: controls that edit what you're typing sit inside the keypad; controls that commit a card sit outside it.
- The amount lives on the button that commits it.

## Out of scope

Marketplace and event search, paid data ingestion, QR and hardware, card-ID databases, buyer accounts, payments. All have preserved upgrade paths. None are in the product.

## Stack

React + TypeScript PWA on Vercel, Firebase Auth and Firestore, per the fullstack-standards rulebook.

Build is **not** called. Next gates: remaining screen designs (trade, close-out), then plan red-team, then feature planning and tickets.
