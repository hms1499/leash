/**
 * The page container: one width for every screen.
 *
 * There was no rule for this until 2026-09-05 and it showed. Measured at a
 * 1920px viewport, the app had four screens at three widths: the landing and
 * the message screens at 768px, the wizard at 672px, and the dashboard at no
 * constraint at all -- 1920px of it.
 *
 * The fix then was to hold every screen at 768px, because `Meter` had measured
 * 1888px on that unconstrained dashboard: its fill a dot against the left edge
 * and its cap line a dot against the right, when the relationship between
 * those two marks is the whole information content of the component.
 *
 * **That reason was real and the remedy was in the wrong place.** `Meter` is
 * an SVG with `viewBox="0 0 600 14"`, so it magnifies rather than reflows, and
 * the constraint was never "the page is 768px" but "the meter is about 700px".
 * Enforced at the page, one component's geometry also decided the width of
 * every card grid in the app -- and measured at 1440px on 2026-09-11, the
 * landing's three-up cards ran their body text at 21 characters a line.
 *
 * `Meter` carries `max-w-[--meter-max]` itself now, so the page is free.
 * 1024px, from lib/layout.ts: measured again at that width on 2026-09-11, the
 * same card is 315px and its body runs at 31 characters a line.
 *
 * `px-4` is the page gutter and stays 16px on purpose: it is the edge of the
 * viewport rather than a relationship between two elements, and 24px gutters
 * waste width on the phone MiniPay runs on.
 *
 * A full-bleed band (the dashboard header, the meter's ground) puts its
 * background on an outer element and this on the content inside it, so the
 * band spans the viewport while what it holds stays on the page's column.
 */
export const PAGE = 'w-full max-w-5xl mx-auto px-4'

/**
 * Twelve columns and a 24px gutter, for a block that divides the page.
 *
 * Everything that used an ad-hoc `sm:grid-cols-2` or `sm:grid-cols-3` states a
 * span against this instead, so two blocks on different screens line up
 * because they are on one grid rather than because both happened to choose
 * thirds. docs/design-system.md §16.
 *
 * A span starts at `col-span-12` -- one column, which is what a phone gets --
 * and widens only where a measurement says it may. `md` (768px) is where half
 * the page first holds a readable card, at 356px and 35ch; a third of the page
 * does not until `lg` (1024px), where it is 315px and 31ch. At 768 that same
 * third is 229px and **21ch**, which is the figure this whole grid exists to
 * fix, so a prose card does not go three-up before `lg`.
 */
export const GRID = 'grid grid-cols-12 gap-6'

/**
 * The same twelve columns inside a panel.
 *
 * `gap-6` is the page gutter and it is wrong in here: §14 asks a container's
 * padding to sit one step above the gap between its children, and a `Panel` at
 * `p-6` holds rows at `gap-3`. A panel's own padding already separates its
 * grid from the page's, so the two gutters were never going to align anyway --
 * what carries across is the division into twelve, which is what makes the
 * field pairs in the wizard and the two balance boxes in `AgentPanel` land on
 * the same edges.
 */
export const PANEL_GRID = 'grid grid-cols-12 gap-3'
