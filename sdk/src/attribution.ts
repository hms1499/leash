import { toDataSuffix } from '@celo/attribution-tags'
import { LEASH_ATTRIBUTION_CODE } from './constants.js'

/**
 * This project's code alone, as the bytes to append. For a signer that takes a
 * suffix rather than calldata to wrap -- wagmi's `dataSuffix`, which is how the
 * dashboard tags the transactions an owner signs in a browser wallet.
 */
export const LEASH_DATA_SUFFIX = toDataSuffix(LEASH_ATTRIBUTION_CODE)

/**
 * Appends an ERC-8021 attribution suffix to calldata.
 *
 * Every outbound transaction must go through this. There is deliberately no
 * "send untagged" path: an untagged transaction scores zero on every track.
 *
 * Several codes are allowed because ERC-8021's wire format carries them
 * comma-delimited in one suffix, and the layering rule that governs them is
 * not ours to bend: `@celo/attribution-tags` says each code is added only by
 * the entity it represents. `leash-agentpay` emits its own code because it is
 * the app that built and signed the transaction; a builder shipping their own
 * product on top of it adds theirs beside it, and neither replaces the other.
 */
export function withAttribution(
  data: `0x${string}` | undefined,
  tag: string | readonly string[],
): `0x${string}` {
  const suffix = toDataSuffix(tag)
  const base = data ?? '0x'
  return (base + suffix.slice(2)) as `0x${string}`
}
