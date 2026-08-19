# ShowKardz — implementation handoff

Source of truth for visuals: `SHOWKARDZ.dc.html` in this project (Organic system).
Repo: kepz94/ShowKardz @ main (ec69a75fb26f at time of writing).

Good news from reading the code: **groups already exist.** `src/lib/groups.ts` has
`groupRows(db)`, `cardsInGroup(db, id)`, `statsFor`, `NO_GROUP`, and `stacks` is
already the group entity on `DB`. No migration is needed. The design's group model
maps 1:1 onto what is there.

## 1. New data: which groups are in the case today

This is the only genuinely new state. A show session is a set of stack ids.

```ts
// src/types.ts
export interface DB {
  // …existing
  /** Stack ids loaded into the case for the current show. Absent = nothing packed. */
  packedStackIds?: string[];
}
```

- `load()` in `lib/store.tsx`: add `packedStackIds: parsed.packedStackIds ?? []`
  (optional-first, same pattern as `receipts`).
- `lib/reducer.ts`: one action, `{ type: 'pack/toggle', stackId: string }`.
  Toggling is idempotent and order-independent, so it needs no merge rule beyond
  last-write-wins; if you sync it, treat it as a device-local field and leave it
  out of `changedDocs` — what is in one dealer's case is not a shared record.
- Do NOT store counts or values. Derive with `statsFor(cardsInGroup(db, id))`,
  exactly as `groupRows` already does. That invariant is load-bearing in this
  codebase and the design depends on it too.

## 2. New screen: Prep (`src/screens/Prep.tsx`)

Replaces the Scan landing as the night-before home. Three numbered steps:

1. **Price the unpriced** — count of `status === 'unpriced'`, queue of rows, each
   tapping through to the card editor in Book.
2. **Set floors** — cards priced with `floorCents == null`.
3. **Load the case** — the group picker. One row per `groupRows(db)` entry:
   tick, name, `${cardCount} priced`, group value, and "in the case" /
   "staying home". Tapping dispatches `pack/toggle`.

Then a "Going in the car" summary: total card count, total value, the group names,
and a warning line counting unpriced cards **inside the packed groups only** — that
is the number that actually costs a sale.

Ring/progress at top = priced vs unpriced across the whole book.

**Why groups and not cards:** at ~1000 cards a per-card packing checklist is
unusable. The group is the physical unit that gets carried. This is the core
design decision — do not reintroduce a card-level packing list.

## 3. Book (`src/screens/Book.tsx`) — groups only

Book already lists groups; the changes are:

- Header title "Your groups"; subhead `${n} groups · tap one to see its cards`.
- **+ New group** button opening an inline name field → dispatch the existing
  stack-create action, then drill straight into the new group.
- Group row: count chip (sage when that group is packed), name, `${inCase} in case`,
  a sage **Packed** pill when `packedStackIds.includes(id)`, a brick
  `${n} unpriced` pill, and group value. Keep both pills as pills — earlier
  drafts put "packed today" in the subline and it clipped.
- Group detail: back link, group value, filter chips (All / Unpriced / In case /
  Sold) **scoped to the group**, and card rows whose subline shows the floor
  (not the group name — it's redundant inside a group).
- Empty group → dashed empty state + "Add a card to this group" (only when the
  group is truly empty, not when a filter matched nothing).

## 4. Show (`src/screens/Show.tsx`)

Add a sage strip above the number pad: "On the table today", total packed value,
a chip per packed group with its card count, and a "Change in Prep" dashed chip.
The "In case" figure in the header counts **packed** cards, not the whole book.

Number entry, comp lookup, floor and the negotiation slider are unchanged.

## 5. Nav

Six tabs is too many. Prep replaces the Scan landing as the first tab; Scan stays
reachable from Prep and from the group empty state. Stats nests under Shows rather
than earning a tab (per your call on the form).

## 6. Visuals — Organic

`src/styles.css` is 36KB of the existing cream/mono utility styling. The restyle:

- Display face Caprasimo for screen titles and big numbers; body face unchanged sans.
- Surfaces: `--color-neutral-100` cards on `--color-bg`, 1px `--color-neutral-300`
  borders, 20px radii, `--shadow-sm`.
- Sage `#56633f` = money and packed state. Brick `#a03418` = unpriced/warning.
  Terracotta `#c67139` = accent. Sage tint `#e1eecc` on `#ccdbb2` for "in the case"
  panels. Two background colors maximum.
- Buttons: `.btn` with `.btn-primary` / `.btn-secondary` / `.btn-ghost`, 999px pills
  for filters, 44px minimum hit target everywhere — this is used one-handed at a table.

Lift exact values from the DC rather than re-deriving them.

## Order of work

1. `packedStackIds` + reducer action + tests (mirror `groups.test.ts` style).
2. Prep screen, wired to real derived numbers.
3. Book group list + new-group flow + scoped filters.
4. Show strip.
5. Organic pass over `styles.css`.

Steps 1–4 are behavioral and testable; step 5 is a pure restyle and should land
last so it cannot hide a logic regression.
