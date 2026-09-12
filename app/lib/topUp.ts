/**
 * The two pure decisions behind the dashboard's agent-funded payments control.
 *
 * Here rather than inside the component for the reason lib/setup.ts exists:
 * app/vitest.config.ts runs the node environment, so a decision made inside a
 * component cannot be tested.
 */

/**
 * What the dashboard says the switch is currently doing.
 *
 * Names the consequence, not the position. "Off" on its own answers nothing a
 * reader of this panel is asking — the question the switch settles is whether
 * money can leave this account into a wallet the policy cannot reach
 * afterwards, so the sentence says that.
 *
 * `null` is a state that has not been read. Every figure on this dashboard is
 * a positive observation of the chain, and printing "Off" for a read that has
 * not happened would state something nobody has checked — the defect
 * StopButton's own loading branch was fixed for.
 */
export function describeTopUpState(enabled: boolean | null): string {
  if (enabled === null) return '—'
  return enabled
    ? 'On — the agent may draw funds into its own wallet'
    : 'Off — the agent cannot draw funds into its own wallet'
}

/**
 * Whether flipping the switch this way needs the app's two-beat confirm.
 *
 * Only the ON direction does. It opens `topUpOperator`, the one path out of
 * this account that the payee allowlist cannot reach: once funds are in the
 * agent's own wallet they are outside the policy by construction, bounded only
 * by the daily cap that let them out. That is the same class of decision as
 * Stop and as removing the last approved payee, and it gets the same treatment.
 *
 * Turning it OFF only ever removes a permission. Arming the safe direction
 * would teach a reader that both are equally weighty, which is the opposite of
 * what this control is for.
 */
export function topUpNeedsArming(next: boolean): boolean {
  return next
}
