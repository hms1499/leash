'use client'

import { formatAmount } from '../lib/policy.js'
import { rowKey, WINDOW_LABEL, type FeedRow } from '../lib/feed.js'

export default function Feed({
  account, rows, decimals, symbol, isLoading, hasPolicy, error,
}: {
  account: `0x${string}`
  rows: FeedRow[]; decimals: number; symbol: string
  // null while the account read is still in flight: an unread policy is not
  // an absent one, and saying "refuses every spend" about an account nobody
  // has looked at yet is a claim, not a reading.
  isLoading: boolean; hasPolicy: boolean | null; error: Error | null
}) {
  if (hasPolicy === null) {
    return <div className="panel p-4"><p className="label">Reading the chain…</p></div>
  }

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
          {/* The span this states is the span that was scanned — the label
              is exported beside the block count it is derived from. */}
          Nothing has been spent in the last {WINDOW_LABEL}.{' '}
          {/* Not a dead end: forno caps a log query at 5,000 blocks, so
              scanning further back on every page load is not free. Anyone who
              wants the whole history can have it in one click. */}
          <a
            href={`https://celoscan.io/address/${account}#events`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--celo)' }}
          >
            See the full history on Celoscan →
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="panel px-4">
      {rows.map((r) => (
        <div
          key={rowKey(r)}
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
