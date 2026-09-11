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
  display: { size: '44px', line: '1.0', face: 'mono', weight: 600 },
  title: { size: '30px', line: '1.2', face: 'mono', weight: 600 },
  heading: { size: '18px', line: '1.35', face: 'mono', weight: 500 },
  /**
   * The title of a block sitting below a section title: a landing card, a
   * wizard sub-step, a claim in SecurityBoundary.
   *
   * Shares 14px with `body` on purpose. The pair is separated by family
   * rather than size, which is §1's central rule made structural -- mono is
   * what a reader looks at, sans is what they read, and a card title is
   * looked at. The 16 call sites this replaces were all sans 600, so all 16
   * were §1 violations as well as off-scale.
   */
  subhead: { size: '14px', line: '1.35', face: 'mono', weight: 500 },
  body: { size: '14px', line: '1.65', face: 'sans', weight: 400 },
  data: { size: '13px', line: '1.55', face: 'mono', weight: 400 },
  label: { size: '11px', line: '1.3', face: 'mono', weight: 400 },
} as const

export type StepName = keyof typeof SCALE

/**
 * A face is a size, a family and a weight together, because that is what a
 * reader receives. Measured in Chromium on 2026-09-11, the app drew eight
 * faces the scale does not define -- 36px mono at 400, 500 *and* 600 for the
 * same rank, 18px mono 600 beside 18px mono 500, and a nav set at --t-data's
 * size in the sans family. Every one of them passed test/type.test.ts and
 * test/scaleUsage.test.ts, which read sizes.
 *
 * Weight and family live here now so e2e/faces.spec.ts can assert that every
 * face on a route is one of these, rather than merely counting how many there
 * are. A ceiling stops drift from growing; this stops it existing.
 */
export function faceOf(step: StepName): string {
  const s = SCALE[step]
  return `${s.size} ${s.face} ${s.weight}`
}

/**
 * Faces that are not steps, and are allowed anyway. Each is a decision, and
 * an entry here is the only way to have one.
 */
export const DECLARED_EXCEPTIONS: Record<string, string> = {
  // §2: six letters at 11px need the weight to hold .26em open. BrandLink only.
  '11px mono 700': 'the wordmark',
  // A primary action is the one thing on a screen you are meant to press, and
  // `stop` is the one you are meant to find in a hurry. Button and ActionLink.
  '13px mono 700': 'the primary and stop controls',
  // <strong> inside prose. Semantic emphasis the browser sets, in the family
  // and size the prose already has -- the wizard uses it on "private key".
  '14px sans 700': 'strong emphasis inside prose',
}

/** The full set a route may render at a desktop width. */
export function allowedFaces(): Set<string> {
  const out = new Set<string>()
  for (const step of Object.keys(SCALE) as StepName[]) out.add(faceOf(step))
  // --t-title steps up at 640px and the faces spec measures at 1280.
  out.delete(faceOf('title'))
  out.add(`36px ${SCALE.title.face} ${SCALE.title.weight}`)
  for (const face of Object.keys(DECLARED_EXCEPTIONS)) out.add(face)
  return out
}
