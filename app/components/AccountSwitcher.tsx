'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { truncateAddress } from '../lib/address.js'
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
    const refresh = () => setAccounts(migrateLegacyAccount(localStorage, connected))
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
            const operator = localStorage.getItem(`leash.agent.${next.address.toLowerCase()}`)
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
      <Link
        href="/accounts"
        aria-current={pathname === '/accounts' ? 'page' : undefined}
        className="rounded px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          border: '1px solid var(--line-control)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--t-data)',
          outlineColor: 'var(--text)',
        }}
      >
        My accounts{accounts.length ? ` (${accounts.length})` : ''}
      </Link>
    </span>
  )
}
