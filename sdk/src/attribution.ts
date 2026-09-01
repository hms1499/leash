import { toDataSuffix } from '@celo/attribution-tags'

/**
 * Appends an ERC-8021 attribution suffix to calldata.
 *
 * Every outbound transaction must go through this. There is deliberately no
 * "send untagged" path: an untagged transaction scores zero on every track.
 */
export function withAttribution(
  data: `0x${string}` | undefined,
  tag: string,
): `0x${string}` {
  const suffix = toDataSuffix(tag)
  const base = data ?? '0x'
  return (base + suffix.slice(2)) as `0x${string}`
}
