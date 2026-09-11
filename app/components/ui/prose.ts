/**
 * The prose treatment, in one place.
 *
 * design-system §1 makes an exception to the everything-is-mono rule for text
 * that is *read* rather than looked at, and §2 caps its measure at 68
 * characters. Both are four property values, and they were about to be typed
 * out by hand in five components -- which is how the app came to have two type
 * sizes doing six jobs in the first place.
 *
 * Same arrangement as LABEL_STYLE in Label.tsx, and exported for the same
 * reason: a caller that must render its own element still gets one copy of
 * the rule. `maxWidth` is applied by the caller, since a list item inside a
 * narrow panel is already measured by its column.
 */
export const PROSE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--t-body)',
  lineHeight: 'var(--t-body-line)',
}

/**
 * The rank below a section title, in one place.
 *
 * Sixteen call sites wrote `text-sm font-semibold` for this and none of them
 * was on the scale. Mono rather than sans because §1 makes mono what a reader
 * looks at, and 500 rather than 600 to match --t-heading's weight: this is the
 * step below it, not a bolder one beside it. docs/design-system.md §2.
 */
export const SUBHEAD: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-subhead)',
  lineHeight: 'var(--t-subhead-line)',
  fontWeight: 500,
}
