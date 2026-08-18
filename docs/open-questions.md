# Open questions

Decisions owed before build. Nothing here is blocked on code.

## 1 — Does the card number belong in the title?

Not an OCR question — a geometry one. The **sticker** number reads fine; it's printed text and the camera handles it. The **manufacturer's card number** (the `#58` in "Anthony Edwards #58") is printed on the *back* of most modern base cards, so a front-facing shot never has it in frame.

Options:
- Compose titles without it, searching on year + product + player.
- Flip every card for a second shot.
- Type it by hand only on cards where it matters.

**Decided by question 2.** If adding `58` doesn't measurably improve the eBay results, the camera never needs to see the back and this closes itself.

## 2 — Does the auto-built eBay query return the right cards?

Open. **Test built and waiting on a browser run:** `design/comps-query-test.html`.

eBay returns **403** to automated fetches from a datacenter, so this cannot be answered from a container — it has to run from a real browser on a residential connection. The test page generates seven query variants for any card and opens real sold-and-completed listings for each.

Variants under test:

| Variant | What it decides |
|---|---|
| `year product player` | The simplest thing the app could build |
| `year product player number` | Whether the card number helps — this also settles question 1 |
| `… -auto -patch -psa -bgs -sgc` | Whether negative keywords should be baked in by default |
| `year product parallel player` | Whether "Silver" returns silvers or every colour |
| `year product player PSA 10` | The graded case |

The failure mode that matters: a raw base card search flooded with autos, patches and slabs that sell for 10× the card, which would make the comps read wildly high in exactly the direction that costs money.

---

## Resolved

**Product name** — SHOWKARDZ. (Mockups used "Table" as a placeholder.)

**Sticker numbers do not encode location** — 100s = left case, 200s = binder two was considered and rejected. It breaks sequential peel-and-stick, which is what makes intake fast. If the close-out audit needs location later, that becomes a per-card field, not a meaning baked into the number.

**Trades degrade without signal** — valuing the other side needs the comps link, and that needs network at the show. Rather than have one flow die mid-negotiation, the trade screen falls back to typing a value from the dealer's own read, with no comps, and says plainly that's what's happening. Cash sales remain fully offline.

**The floor warns, it never blocks** — taking $11 under your own floor to move a slow card is a normal Saturday, and a tool that argues with the dealer gets closed. The warning is loud (red total, the amount under the floor named on the charge button) and the sale still goes through.

**Add to Home Screen is a requirement** — see `platform-constraints.md`.

**No stored market figure** — the app cannot obtain sold prices without a paid API, so it never displays one. The market read happens during the night-before price pass and comes out as the dealer's price. Show day shows that number and a link to real listings.

**Phone-first, not laptop-first** — the phone is the scanner. The laptop is the same screens at more width.
