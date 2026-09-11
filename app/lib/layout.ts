/**
 * The grid: how wide the page is, and how it divides.
 *
 * Data here, `var(--…)` in globals.css, and test/layout.test.ts fails when the
 * two disagree -- the same arrangement PALETTE, SCALE and RADIUS already use.
 *
 * ## Why this replaces a single 768px
 *
 * §3 fixed every screen at 768px on 2026-09-05 and gave a reason that was
 * real: `Meter` had rendered at 1888px on an unconstrained dashboard, where
 * its fill is a dot against the left edge and its cap line a dot against the
 * right, and the relationship between those two marks is the entire
 * information content of the component.
 *
 * But `Meter` is an SVG with `viewBox="0 0 600 14"` and `w-full`. A viewBox
 * *scales*: at 1888px it did not lay out wider, it magnified, and the 2px gap
 * §3.1 spends a rule on magnified with it. So the constraint was never "the
 * page is 768px". It was **"the meter is about 700px"** -- a fact about one
 * component, enforced three levels up at the page, where it also decided the
 * width of every card grid and every panel in the app.
 *
 * `METER_MAX` puts it back where it belongs. With the meter immune, the page
 * is free to be as wide as its content wants.
 *
 * ## Why 1024 and not 1280
 *
 * Measured at 1440px on 2026-09-11, the landing's three-up card grid gave each
 * card 235px, and the body text inside one ran at **21 characters a line**.
 * Below about 30ch an eye spends more time returning to the left margin than
 * reading. Measured again after the change, the same card is 315px and runs at
 * **31ch** -- one character above that floor, not the 36 this paragraph first
 * claimed before anyone put a probe on it.
 *
 * 1152 would give 357px and 36ch and 1280 would give 400px and 41ch, both of
 * which read better -- but the dashboard is a stack of panels and a meter
 * capped at 704, and the wider the page the more of it is margin. One width
 * for every screen is §3's rule and it is kept. 31ch is the price, and it is
 * recorded here rather than rounded up.
 */

/** Columns. Twelve because it divides by 2, 3, 4 and 6. */
export const COLUMNS = 12

/**
 * The gutter between columns: §3's step 6, 24px. Not a new number -- the
 * spacing scale already had the one this needs.
 */
export const GUTTER = '24px'

/**
 * The page's maximum width. Below it the container is fluid and the gutter
 * does the work.
 */
export const CONTAINER = '1024px'

/**
 * The page gutter, unchanged from §3: 16px, because it is the edge of the
 * viewport rather than a relationship between two elements, and 24px wastes
 * width on the phone MiniPay runs on.
 */
export const PAGE_GUTTER = '16px'

/**
 * What `Meter` was drawn for. The track measured 702px inside `LiveProof`
 * when the page was 768, and that is the width its 600-unit viewBox was
 * proportioned against. 736 here because the cap sits on the element that
 * carries the 16px page gutter on each side: 736 - 32 = 704 of track.
 * It does not grow with the container.
 */
export const METER_MAX = '736px'

/**
 * A column's width at the container's maximum, for the record and for the
 * test. 12 columns and 11 gutters inside 1024 less two 16px page gutters.
 */
export function columnWidth(): number {
  const inner = parseInt(CONTAINER, 10) - 2 * parseInt(PAGE_GUTTER, 10)
  return (inner - (COLUMNS - 1) * parseInt(GUTTER, 10)) / COLUMNS
}
