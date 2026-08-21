/**
 * What "well formed" means for a SHOWKARDZ screen.
 *
 * This function is stringified and run INSIDE the page, so it must be
 * self-contained — no imports, no closures over anything out here.
 *
 * Every rule below exists because it broke in the real app and was found by a
 * person looking at a screen rather than by a test:
 *
 *   - a player's name truncated to "2023 Panini Prizm Anth…" in the register
 *     cart, which is the typo guard at the table;
 *   - a subline breaking mid-phrase as "3 in / case";
 *   - read-sheet controls at 24-30px, on the most-tapped buttons in the app;
 *   - a blanket size pass rewriting the 16px control floor to 15px, which
 *     makes iOS zoom on focus and STICK there in an installed PWA;
 *   - twenty-five font sizes and nine weights, drifting one commit at a time.
 *
 * None of them are subtle once seen. All of them shipped.
 */
export const IN_PAGE_AUDIT = () => {
  const clipped = [];
  const overflowing = [];
  const smallTargets = [];
  const zoomTriggers = [];
  const weights = new Set();
  const sizes = new Set();

  const name = (el) => {
    const cls = (el.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.');
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  };

  const W = window.innerWidth;

  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;

    /* 1. TEXT IS NEVER CUT OFF.
       Only elements holding their OWN text: a flex parent legitimately reports
       a wider scrollWidth than its box without anything being hidden. */
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim() !== '')
      .map((n) => n.textContent.trim())
      .join(' ');
    if (ownText && el.scrollWidth > el.clientWidth + 1) {
      clipped.push({
        el: name(el), text: ownText.slice(0, 48),
        box: el.clientWidth, needs: el.scrollWidth,
      });
    }

    /* 2. NOTHING EXTENDS PAST THE VIEWPORT. */
    if (r.right > W + 0.5 || r.left < -0.5) {
      overflowing.push({ el: name(el), left: Math.round(r.left), right: Math.round(r.right), viewport: W });
    }

    /* 3. EVERY BUTTON IS AT LEAST 44px.
       Used one-handed at a table with a buyer waiting. */
    if (el.tagName === 'BUTTON' && r.height < 44) {
      smallTargets.push({ el: name(el), height: Math.round(r.height), text: ownText.slice(0, 24) });
    }

    /* 5. THE SYSTEM HOLDS. Collected here, asserted by the caller. */
    if (ownText) {
      weights.add(cs.fontWeight);
      sizes.add(cs.fontSize);
    }
  });

  /* 4. NOTHING CAN MAKE iOS ZOOM.
       A focused text control under 16px zooms the page, and in an installed
       PWA there is no address bar to escape with — it stays zoomed. Selects
       count: one looks perfectly normal at 13px and only misbehaves on tap. */
  document.querySelectorAll('input,select,textarea').forEach((el) => {
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 16) zoomTriggers.push({ el: el.id || el.getAttribute('type') || name(el), size: px });
  });

  /* 6. THE PAGE NEVER SCROLLS SIDEWAYS. */
  const sideways = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > W + 0.5;

  return {
    clipped, overflowing, smallTargets, zoomTriggers, sideways,
    weights: [...weights].sort(),
    sizes: [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
  };
};

/**
 * The system, as the app declares it.
 *
 * Kept in sync with the tokens in styles.css by hand — deliberately. A check
 * that reads its expectations out of the thing it is checking cannot fail.
 */
export const ALLOWED_WEIGHTS = ['400', '600', '700'];
export const ALLOWED_SIZES = ['10px', '11px', '13px', '15px', '16px', '17px', '22px', '27px'];

/**
 * Sizes that are allowed to be off-scale, and why.
 * `clamp()` on the stat figure resolves to whatever the viewport makes it.
 */
export const SIZE_EXEMPT = /^(1[89]|2[0-9]|3[0-9])(\.\d+)?px$/;

/** Turn one screen's raw report into a list of failures. */
export function failuresFor(scene, report) {
  const out = [];
  const at = (msg) => `${scene}: ${msg}`;

  for (const c of report.clipped) {
    out.push(at(`text cut off in ${c.el} — needs ${c.needs}px, has ${c.box}px — "${c.text}"`));
  }
  for (const o of report.overflowing) {
    out.push(at(`${o.el} extends to ${o.right}px past a ${o.viewport}px viewport`));
  }
  for (const s of report.smallTargets) {
    out.push(at(`tap target ${s.el} is ${s.height}px, under 44 — "${s.text}"`));
  }
  for (const z of report.zoomTriggers) {
    out.push(at(`${z.el} is ${z.size}px — under 16 makes iOS zoom and stick`));
  }
  if (report.sideways) out.push(at('the page scrolls sideways'));

  for (const w of report.weights) {
    if (!ALLOWED_WEIGHTS.includes(w)) out.push(at(`font-weight ${w} is outside the system`));
  }
  for (const s of report.sizes) {
    if (!ALLOWED_SIZES.includes(s) && !SIZE_EXEMPT.test(s)) {
      out.push(at(`font-size ${s} is outside the scale`));
    }
  }
  return out;
}
