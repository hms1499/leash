/**
 * The type scale as data, so the drift test can check it against globals.css.
 *
 * Components read `var(--t-*)` from the CSS and never this module -- the CSS
 * is the runtime source and this is the assertion. Same arrangement as
 * PALETTE in tokens.ts, and adopted for the same reason: a rule that lives in
 * only one place drifts silently.
 *
 * Six steps replace two. Measured 2026-09-05, `text-sm` carried 39 of the
 * app's uses and section headings were rendered through Label at 11px, which
 * left a cliff from 36px to 11px with no rank in between. `heading` is that
 * missing rank. See docs/design-system.md §2.
 */
export const SCALE = {
  display: { size: '44px', line: '1.0' },
  title: { size: '30px', line: '1.2' },
  heading: { size: '18px', line: '1.35' },
  body: { size: '14px', line: '1.65' },
  data: { size: '13px', line: '1.55' },
  label: { size: '11px', line: '1.3' },
} as const

export type StepName = keyof typeof SCALE
