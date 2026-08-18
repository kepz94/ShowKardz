# Platform constraints — iOS PWA

These shape the data model and belong in acceptance criteria, not in code comments discovered later. Several are scars from Scribal, recorded in the Dev Hub Lessons doc.

## Storage

**Add to Home Screen is a hard requirement.** iOS caps script-writable storage — IndexedDB and service worker caches — at roughly seven days of inactivity. Installed home-screen web apps get their own days-of-use counter, separate from Safari, which resets whenever the app is actually used. A dealer running the app as a browser tab between monthly shows can lose the local case.

**Local storage is a cache, never the record — for records.** Firestore is the truth; the device holds a copy. Eviction then costs a re-sync at home, not the inventory. This produces a product rule: open the app on wifi before leaving for the show, not at the table.

**Photographs are the exception, and they are device-local by decision.** Card and receipt images stay in this phone's IndexedDB and are never uploaded; only the reference syncs. The sync payload stays small and the app stays free to run. The accepted cost: an image lives on exactly one device and cannot be recovered if that device is lost — which lands hardest on receipt photos, the records most likely to be wanted months later. Any other device shows the expense in full with the photo marked as being elsewhere.

**Size is not the constraint; eviction is.** The old ~50MB ceiling this doc used to cite is several iOS versions out of date. Since Safari 17 / iOS 17 an origin may use roughly 60% of total disk, under an overall 80% cap, and Safari no longer prompts for more space. A Home Screen web app gets the same origin quota as Safari. On a 256GB phone that is tens of gigabytes — photographs are not a space problem.

What does bite is deletion. WebKit removes all script-written storage — IndexedDB, localStorage, service worker registrations — for an origin with no user interaction in seven days of browser use. Two things exempt an origin: installation to the Home Screen, which gets its own days-of-use counter, and `navigator.storage.persist()`, which the app requests on every launch. Both matter, because photos are stored on one device only.

**Don't cache photos for the show floor.** Still true, but now a choice rather than a forced one: show day needs number → name → price, and nothing on that screen is improved by an image. Photos belong to the price pass and to receipts, at home.

## Data model

**Never put the inventory in one document.** Firestore's hard ceiling is 1 MiB per document. Scribal crossed it on a single-doc sync payload and writes 400'd for days while the UI reported "Synced." Five hundred cards with titles and prices in one doc walks into the same wall. One document per card, or chunked — decided before build.

**A half-built sale must survive a process kill.** iOS kills PWA processes constantly, and module-level state is dead on every launch. Three cards typed into a sale, phone call comes in, dealer returns — the sale is still there. Acceptance item on the cash-sale ticket.

**The price pass must persist on every change, not on save.** Tapping the comps link leaves the app entirely. iOS can kill the process while the dealer reads eBay. Position in the queue and any half-typed price are written as they change, so returning lands on the same card with the typing intact.

**Surface every write error.** Never `catch {}` on a sync path. An error field that is written but never read is worse than no error handling — it closes the incident while every surface keeps lying.

## Input and interaction

**All form controls ≥16px on touch.** Below that, iOS auto-zooms on focus, and in an installed PWA the zoom sticks. The sticker-number field is the highest-traffic input in the app.

**Blur before unmount.** Remounting a scrollable screen in the same frame that an input-bearing sheet unmounts, with the keyboard still up, can freeze the new scroller. Blur first, defer the remount ~300ms.

**No `navigator.vibrate` in Safari.** Scan confirmation is beep plus a full-width visual band, no haptic.

**Audio needs a user gesture.** The AudioContext must be unlocked by a tap, so the first beep of a session won't fire until the first interaction.

**No install prompt on iOS.** Onboarding requires walking the user through Share → Add to Home Screen.

**No Background Sync API on iOS.** Queued writes flush while the app is open, not in the background. Acceptable here — the dealer opens the app at the table anyway.

## Service worker

Network-first. Never cache `/api/*` or cross-origin Firestore and auth traffic. The cache is an offline fallback only.

## Verification

Anything using blob URLs, new tabs, or file downloads behaves differently in standalone mode and carries a device-test acceptance item. Headless browsers have no software keyboard and no real storage eviction — those behaviors are unreproducible in a container and the device pass is owed explicitly.
