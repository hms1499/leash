import { isAddress } from 'viem'

export function isValidAddress(s: string): s is `0x${string}` {
  return isAddress(s)
}

/**
 * Shortens an address for display. Deliberately keeps six leading characters:
 * four is not enough to tell two accounts apart at a glance, and this string
 * appears next to money.
 */
export function truncateAddress(a: string): string {
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
