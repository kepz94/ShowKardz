# Open questions

Decisions owed before build. Nothing here is blocked on code.

## 1 — The card number is on the back

The spec has the one-shot camera read capturing player name *and* card number, composing a title like `2023 Panini Prizm Anthony Edwards #58`. On most modern base cards the `#58` is printed on the reverse. A single front-facing shot won't see it.

Options:
- Drop the number from the title and search on name alone.
- Two shots per card.
- Type the number only when it matters (parallels, high-value).

This changes the eBay query, so it changes how good the comps are. Not cosmetic.

## 2 — Does the auto-built eBay query return the right cards?

The current guess is the composed title plus sold and completed filters:

```
ebay.com/sch/i.html?_nkw=2023+Panini+Prizm+Anthony+Edwards+58&LH_Sold=1&LH_Complete=1
```

Probably fine for a base card. For a numbered parallel it may pull every colour, which makes the comps useless in exactly the cases where the money is — a `/99` silver and a base card are not the same market.

**Proposed:** run a batch of these queries against real cards — base, silver, numbered parallel, graded slab — and read what actually comes back before anything is built on the link.

## 3 — Do sticker numbers encode physical location?

e.g. 100s = left case, 200s = binder two. Open in Dev Hub since discovery.

Trade-off: encoding location makes the close-out case audit far more useful (you can tell *where* a missing card should be). It also means the roll can't just be peeled sequentially, which is the thing that makes intake fast.

## 4 — Trade screen comps need signal

The trade flow is specified as: snap their card → comps link → type value. That link needs network **at the show**, where signal is unreliable. Cash sales work fully offline; live-valuing an incoming trade does not.

Options:
- The flow degrades to "type a value from memory" with no comps, and says so plainly.
- Trades require signal, and the app says that up front rather than failing mid-negotiation.

## 5 — Floor: warn or block?

Current design warns and does not block. A dealer taking $11 under their own floor to move a slow card is a normal Saturday, and a tool that argues with them gets closed. If a deliberate confirm is wanted instead, it's a small change.

---

## Resolved

**Product name** — SHOWKARDZ. (Mockups used "Table" as a placeholder.)

**Add to Home Screen as a requirement** — accepted. See `platform-constraints.md`.

**No stored market figure** — the app cannot obtain sold prices without a paid API, so it never displays one. The market read happens during the night-before price pass and comes out as the dealer's price. Show day shows that number and a link to real listings.

**Phone-first, not laptop-first** — the phone is the scanner. The laptop is the same screens at more width.
