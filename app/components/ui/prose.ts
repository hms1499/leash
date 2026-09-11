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

/**
 * A section title, in one place.
 *
 * §2 gives --t-heading mono 500, and twelve call sites set the size and left
 * the weight to the browser -- so the app rendered 18px mono 400 and 18px
 * mono 500 side by side and neither was wrong on purpose. e2e/faces.spec.ts
 * counts those as two faces, which is what they are.
 *
 * `app/setup/page.tsx` already had this constant locally and already had the
 * 500. It was the one file that did.
 */
export const HEADING: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-heading)',
  lineHeight: 'var(--t-heading-line)',
  fontWeight: 500,
}

/**
 * A page title, in one place.
 *
 * Three screens set --t-title's size and left the weight to whoever was
 * reading: /accounts drew 36px mono 400, the wizard 36px mono 500 through a
 * HEADING it overrode the size of, and the landing 36px mono 600. One rank,
 * three faces, and nothing could see it because all three were the same size.
 */
export const TITLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-title)',
  lineHeight: 'var(--t-title-line)',
  fontWeight: 600,
}

/**
 * A number or an address, in one place: --t-data is mono, and the family is
 * the half that kept being dropped. The header and footer navs were set to
 * this step's size in Task 5 and left in the sans family, which is a rank the
 * scale does not have.
 */
export const DATA: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-data)',
  lineHeight: 'var(--t-data-line)',
}
