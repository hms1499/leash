/**
 * localStorage that cannot take a write path down with it.
 *
 * Storage THROWS, it does not merely return null: Safari private mode and
 * blocked third-party contexts raise SecurityError on access, and a quota-full
 * origin throws on write. Every call in this app sat inside a try whose catch
 * belonged to something else, so a storage failure was reported as whatever
 * that catch was about:
 *
 *   addAgent / grantAccess    -> "The transaction was not sent."
 *   protectRecipient          -> "The requested policy change was not completed."
 *   deploy                    -> "Sent as 0x… The chain has not confirmed it yet."
 *   the wizard restore effect -> "Could not verify this account on Celo."
 *
 * Each of those ran AFTER the write had been confirmed on chain by a pollUntil.
 * Telling an owner their setOperator never landed, because a browser would not
 * remember the address, is the exact failure CLAUDE.md's rule exists to stop:
 * never report a write as anything other than what was observed.
 *
 * Remembering is a convenience. The chain is the record, and every one of these
 * values is re-derivable from it -- operators() verifies the agent,
 * allowlistEnabled() the recipient mode. So these swallow, deliberately, and
 * the caller carries on.
 */
export function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* not remembering is survivable */ }
}

export function removeLocal(key: string): void {
  try { localStorage.removeItem(key) } catch { /* see writeLocal */ }
}
