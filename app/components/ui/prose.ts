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
