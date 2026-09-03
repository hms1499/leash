'use client'

import { formatAmount } from '../lib/policy.js'
import type { FeedRow } from '../lib/feed.js'

export default function Feed({
  rows, decimals, symbol, isLoading, hasPolicy, error,
}: {
  rows: FeedRow[]; decimals: number; symbol: string
  isLoading: boolean; hasPolicy: boolean; error: Error | null
}) {
  // A freshly deployed account has no policy, and every operator path reverts
  // TokenNotConfigured until the owner sets one. Saying so beats an empty list.
  if (!hasPolicy) {
    return (
      <div className="panel p-4">
        <p className="label">No limits set</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          Until the owner sets a per-transaction and a daily cap, this account
          refuses every spend. Open <strong>Limits</strong> to set them.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="panel p-4"><p className="label">Loading activity…</p></div>
  }

  // A failed log scan must never be shown as a quiet account. forno is
  // load-balanced and a chunk can fail after its retry; saying "no activity"
  // then would be the UI asserting something it does not know.
  if (error) {
    return (
      <div className="panel p-4">
        <p className="label" style={{ color: 'var(--bad)' }}>Could not load activity</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          The chain did not answer. The allowance above is still correct — it is
          read separately and does not depend on this. Reload to try again.
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="panel p-4">
        <p className="label">No activity yet</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          Nothing has been spent in the last three days.
        </p>
      </div>
    )
  }

  return (
    <div className="panel px-4">
      {rows.map((r) => (
        <div
          key={`${r.txHash}-${r.blockNumber}-${r.text}`}
          className="flex items-center gap-3 py-2 text-sm"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: r.kind === 'paused' ? 'var(--bad)' : 'var(--ok)' }}
          />
          <span className="flex-1">{r.text}</span>
          {r.amount !== null && (
            <span className="num" style={{ color: 'var(--amber)' }}>
              {formatAmount(r.amount, decimals)} {symbol}
            </span>
          )}
          <a
            className="label"
            href={`https://celoscan.io/tx/${r.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            tx
          </a>
        </div>
      ))}
    </div>
  )
}
