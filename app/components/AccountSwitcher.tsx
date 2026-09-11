'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { truncateAddress } from '../lib/address.js'
import { readLocal } from '../lib/browserStorage.js'
import {
  ACCOUNT_REGISTRY_CHANGED,
  listPolicyAccounts,
  migrateLegacyAccount,
  selectPolicyAccount,
  type SavedPolicyAccount,
} from '../lib/accountRegistry.js'

export default function AccountSwitcher({ current }: { current: `0x${string}` }) {
  const { address: connected } = useAccount()
  const pathname = usePathname()
  const router = useRouter()
  const [accounts, setAccounts] = useState<SavedPolicyAccount[]>([])

  useEffect(() => {
    if (!connected) { setAccounts([]); return }
    // Storage can throw, not merely come back empty. A switcher that cannot
    // list accounts renders empty; it is not worth an error banner, but it
    // must not take the page down with it.
    const refresh = () => {
      try { setAccounts(migrateLegacyAccount(localStorage, connected)) }
      catch { setAccounts([]) }
    }
    refresh()
    window.addEventListener(ACCOUNT_REGISTRY_CHANGED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(ACCOUNT_REGISTRY_CHANGED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [connected])

  return (
    <span className="flex flex-wrap items-center gap-2">
      {connected && accounts.length > 1 && (
        <select
          className="field num px-2 py-2 max-w-48"
          aria-label="Protected account"
          value={current.toLowerCase()}
          onChange={(event) => {
            const next = accounts.find((item) => item.address.toLowerCase() === event.target.value)
            if (!next) return
            selectPolicyAccount(localStorage, connected, next.address)
            const operator = readLocal(`leash.agent.${next.address.toLowerCase()}`)
            const query = operator && /^0x[0-9a-fA-F]{40}$/.test(operator)
              ? `?operator=${operator}`
              : ''
            router.push(`/a/${next.address}${query}`)
          }}
        >
          {!accounts.some((item) => item.address.toLowerCase() === current.toLowerCase()) && (
            <option value={current.toLowerCase()}>{truncateAddress(current)}</option>
          )}
          {accounts.map((item) => (
            <option key={item.address} value={item.address.toLowerCase()}>
              {truncateAddress(item.address)}
            </option>
          ))}
        </select>
      )}
      {/* `control control-ghost` rather than a border and a colour written out
          here. Written out, this link could not know it was sitting on the
          paused band -- and it was not: --text on --bad, 2.44 against §4's
          4.5, on every paused dashboard since the switcher was added. The
          classes carry the tone, the hover and `.on-bright` together. */}
      <Link
        href="/accounts"
        aria-current={pathname === '/accounts' ? 'page' : undefined}
        className="control control-ghost motion-press tap-tall px-3 py-2 focus-ring"
        style={{
          borderRadius: 'var(--r-box)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--t-data)',
        }}
      >
        My accounts{accounts.length ? ` (${accounts.length})` : ''}
      </Link>
    </span>
  )
}
