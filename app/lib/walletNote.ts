/**
 * A note belongs to the wallet that caused it.
 *
 * Switching accounts in MetaMask does not remount a React component: the
 * `connected` address changes, the component re-renders, and every piece of
 * state it was holding survives. So a message about what one wallet just did
 * stays on screen for the next one.
 *
 * Measured on mainnet 2026-09-12 during the ownership hand-back. Wallet B
 * nominated wallet A, the maintainer switched MetaMask to A, and
 * "✓ Nomination saved." was still rendered — underneath a panel addressed to A,
 * about a transaction A had not sent. On a control that hands over `sweep`,
 * a stale success is the wrong thing to leave lying around.
 *
 * Scoped rather than cleared in an effect, deliberately. An effect runs after
 * the render that already painted the stale note, so the wrong sentence is
 * briefly visible either way; this cannot render it at all.
 */
export type WalletNote = { text: string; wallet: string } | null

export function noteForWallet(
  note: WalletNote,
  connected: string | null | undefined,
): string | null {
  if (!note || !connected) return null
  return note.wallet.toLowerCase() === connected.toLowerCase() ? note.text : null
}
