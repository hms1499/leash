import type { SetupStage } from '../../lib/setup.js'

/**
 * Where focus lands when the wizard changes step. Every stage carries it on
 * the one element that says what this step is -- its heading, or on the
 * recovery branch that has no heading, the sentence explaining why.
 */
export const STAGE_HEADING_ID = 'stage-heading'

export const STEPS: ReadonlyArray<{ id: SetupStage; title: string; short: string }> = [
  { id: 1, title: 'Create account', short: 'Create' },
  { id: 2, title: 'Set protection', short: 'Protect' },
  { id: 3, title: 'Add & fund agent', short: 'Fund' },
  { id: 4, title: 'Review & finish', short: 'Review' },
]

export const HEADING: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)', lineHeight: 'var(--t-heading-line)',
  fontWeight: 500, color: 'var(--text)',
}

/** A --well box holding a choice is a control, not a surface: --r-box, not
 *  --r-surface. The 6px here was the only radius in the app on no scale at
 *  all. design-system.md §10. */
export const STATUS_BOX: React.CSSProperties = {
  background: 'var(--well)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-box)',
}

export type RecipientMode = 'any' | 'protected'
export type ConfirmedLimits = { perTx: bigint; daily: bigint }
export type FundingTarget = 'protected' | 'agent'

/**
 * Variadic because a single operation has more than one non-failure outcome:
 * "already authorised, nothing was sent" is not an error, and matching one
 * exact string painted it in --bad. AgentAccessPanel marks its own successes
 * with a leading tick instead; both spellings are load-bearing strings, and
 * either way a reworded message must not silently turn red.
 */
export function noteColor(note: string | null, ...successes: string[]): string {
  return note !== null && successes.includes(note) ? 'var(--ok)' : 'var(--bad)'
}
