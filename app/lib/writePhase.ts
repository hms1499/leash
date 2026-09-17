import { truncateAddress } from './address.js'

/**
 * What a write control is waiting for, so it can say which.
 *
 * Every write in this app is the same two waits back to back: the wallet has
 * the transaction, and then the chain does. `busy: boolean` covered both, so
 * a pressed button read "Stopping…" from the press until pollUntil returned --
 * 20 attempts at 3s is up to a minute (sdk/src/confirm.ts) -- and nothing on
 * screen changed at the moment the owner's own part finished. An owner with
 * no signal that the wallet was done is an owner deciding whether to press
 * again, and a second press is a second transaction.
 *
 * The decision lives here rather than in the eight controls that make it
 * because app/vitest.config.ts runs in the node environment and no
 * component-testing dependency may be added (spec §2.2). Same arrangement as
 * meterState and spendBand.
 *
 * docs/design-system.md §5 is where the rule is written down; this is the
 * implementation of it.
 */
export type WritePhase =
  /** Nothing in flight. */
  | 'idle'
  /** The wallet has it, or -- for the one read that uses this -- the RPC does. */
  | 'sending'
  /** Signed and sent. pollUntil is watching the chain for the condition. */
  | 'confirming'

/**
 * What every control says during the second wait.
 *
 * Not a per-caller string. The confirming wait is one wait -- pollUntil on a
 * condition -- and CLAUDE.md's rule is that two implementations of one
 * operation must not behave differently. It names Celo rather than saying
 * "confirming" because the owner has just been told their wallet is done, and
 * the next question is who they are waiting on now.
 */
export const CONFIRMING_LABEL = 'Waiting for Celo…'

/**
 * The button's text for the phase it is in.
 *
 * `confirming` deliberately ignores `labels`: see CONFIRMING_LABEL.
 */
export function writeLabel(
  phase: WritePhase,
  labels: { idle: string; sending: string },
): string {
  switch (phase) {
    case 'idle': return labels.idle
    case 'sending': return labels.sending
    case 'confirming': return CONFIRMING_LABEL
  }
}

/**
 * Whether the control is disabled.
 *
 * Both in-flight phases, not just the first. The split is about what the
 * button says and never about when it can be pressed.
 */
export function isBusy(phase: WritePhase): boolean {
  return phase !== 'idle'
}

export type OwnerControlView = 'controls' | 'pending' | 'outcome' | 'hidden'

/**
 * What an owner-only control shows, given who is connected now.
 *
 * Ownership can end mid-write: a disconnect, or an account switch in the
 * wallet, while pollUntil is still waiting. The control must not offer its
 * buttons to a non-owner -- the write would revert and be paid for -- and it
 * must not vanish either, because it holds the only account of a transaction
 * that was really sent. So a non-owner sees the wait and then the outcome,
 * and never a button.
 */
export function ownerControlView(
  isOwner: boolean,
  phases: readonly WritePhase[],
  note: string | null,
): OwnerControlView {
  if (isOwner) return 'controls'
  if (phases.some(isBusy)) return 'pending'
  if (note !== null) return 'outcome'
  return 'hidden'
}

/** An outcome shown after its wallet has gone says which wallet it is about. */
export function outcomeForOtherWallet(note: string, sender: string | null): string {
  return sender ? `${truncateAddress(sender)}: ${note}` : note
}
