import { truncateAddress } from '../../lib/address.js'

/**
 * The read-only address display. `CopyAddress.tsx` stays the interactive one
 * and is not replaced by this: it owns the clipboard, its failure state, and
 * the "copied" confirmation. This is for the places that only show an address
 * and link it -- the landing page, and headers where nothing is copyable.
 */
export default function AddressChip({
  address, href,
}: { address: string; href?: string }) {
  const body = <span className="num text-xs">{truncateAddress(address)}</span>
  if (!href) return <span style={{ color: 'var(--dim)' }}>{body}</span>
  return (
    <a style={{ color: 'var(--dim)' }} href={href} target="_blank" rel="noreferrer">
      {body} ↗
    </a>
  )
}
