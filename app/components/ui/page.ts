/**
 * The page container: one width for every screen.
 *
 * There was no rule for this and it showed. Measured 2026-09-05 at a 1920px
 * viewport, the app had four screens at three widths: the landing and the
 * message screens at 768px, the wizard at 672px, and the dashboard at no
 * constraint at all -- 1920px of it.
 *
 * That was not only untidy. `Meter` is rendered on the landing and on the
 * dashboard, and it measured 702px on one and 1888px on the other: the fill
 * became a dot against the left edge and the cap line a dot against the right,
 * nearly two thousand pixels apart, when the whole information content of that
 * component is the relationship between them. Spec §3.1 spends a rule on the
 * 2px gap between those two marks.
 *
 * 768px because that is the width `Meter` was drawn for and already runs at
 * inside LiveProof. `px-4` is the page gutter and stays 16px on purpose: it is
 * the edge of the viewport rather than a relationship between two elements,
 * and 24px gutters waste width on the phone MiniPay runs on.
 *
 * A full-bleed band (the dashboard header, the meter's ground) puts its
 * background on an outer element and this on the content inside it, so the
 * band spans the viewport while what it holds stays on the page's column.
 */
export const PAGE = 'w-full max-w-3xl mx-auto px-4'
