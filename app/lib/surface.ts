/**
 * The surface of a control: its corner, its focus ring, and how long it takes
 * to change.
 *
 * Data here, `var(--…)` in globals.css, and test/surface.test.ts fails when
 * the two disagree -- the same arrangement PALETTE and SCALE already use, for
 * the reason design-system.md §9 gives: a rule that lives in one place drifts
 * silently, and a rule that lives in fifteen is not a rule.
 *
 * All three axes were in the app before they were in this file. Measured
 * 2026-09-11 across `app/` and `components/`:
 *
 *   radius        4px ×10, 2px ×8, 9999px ×4      three values, no name
 *   focus ring    the same three Tailwind utilities hand-written at 14 call
 *                 sites in 10 files, its colour set separately at 19
 *   motion        zero CSS transitions in the entire app
 *
 * Every one of those focus rings is correct today. Nothing makes the
 * fifteenth correct, and §4 already records what that costs: --line-control
 * was introduced for Button and every input in the app was missed, including
 * the two that set how much an agent may spend.
 */

/**
 * Four corners, and the choice between them is about what a thing *is*.
 *
 * A single radius on everything is the tell of a kit rather than a system: it
 * makes a status dot and a submit button claim to be the same kind of object.
 * Here the corner is the claim. design-system.md §10.
 *
 * §10 first said three and no fourth. It had grepped classes and CSS and not
 * inline `borderRadius`, where four more values were sitting -- including
 * Panel, the most-used container in the product, at 8px. A surface is not a
 * control, and that is the distinction the missing fourth was carrying.
 */
export const RADIUS = {
  /** A panel, a card, a band: something the layout sits on. */
  surface: '8px',
  /** A control or a well: Button, ActionLink, .field, a code block. */
  box: '4px',
  /** A mark laid over text: the ring on an inline link, a small badge. */
  mark: '2px',
  /** A state dot, and only ever that. A pill in this UI means "status". */
  dot: '9999px',
} as const

/**
 * One ring. The width is 2px because 1px was the defect: measured 2026-09-05
 * an enabled input fell back to Chrome's own `auto 1px rgb(0,95,204)` -- not
 * an accessibility hole, but browser blue in a dark terminal UI.
 *
 * The colour is deliberately not here. A ring is a non-text UI boundary drawn
 * on the ground *outside* the control, so it has to clear 3:1 against that
 * ground -- which is a per-variant decision, not a constant. `primary` rings
 * in --celo while its own text is --bg. §11.
 */
export const FOCUS = {
  width: '2px',
  /** Outside the control, where there is room around it. */
  offset: '2px',
  /** Inside it, for a full-bleed row whose ring would be clipped otherwise. */
  inset: '-2px',
} as const

/**
 * Two durations, and a rule about which things are allowed to use them.
 *
 * globals.css has carried the sentence "the ground drifts; the data snaps"
 * since the meter was built. This gives it numbers. §12.
 */
export const MOTION = {
  /** A state the reader just caused: a disclosure opening, a copy landing. */
  fast: '90ms',
  /** The meter's geometry moving to a new value. The only slow thing. */
  slow: '400ms',
} as const

export type RadiusName = keyof typeof RADIUS
export type MotionName = keyof typeof MOTION
