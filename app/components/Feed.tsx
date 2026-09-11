'use client'

import { useEffect, useState } from 'react'
import { formatDisplayAmount } from '../lib/policy.js'
import { relativeAge, rowKey, WINDOW_LABEL, type FeedRow } from '../lib/feed.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import { HEADING } from './ui/prose'

export default function Feed({
  account, rows, decimals, symbol, isLoading, hasPolicy, error, head,
}: {
  account: `0x${string}`
  rows: FeedRow[]; decimals: number; symbol: string
  /** The last observed block height and when it was observed. Rows are dated
   * from it rather than from a getBlock call each. */
  head: { block: bigint; seenAt: number } | null
  // null while the account read is still in flight: an unread policy is not
  // an absent one, and saying "refuses every spend" about an account nobody
  // has looked at yet is a claim, not a reading.
  isLoading: boolean; hasPolicy: boolean | null; error: Error | null
}) {
  // Ages are computed, not stored, so they need a reason to re-render. Ten
  // seconds is finer than the smallest unit that stays visible for long.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) tick((n) => n + 1) }, 10_000)
    return () => clearInterval(t)
  }, [])

  /**
   * One frame for every branch.
   *
   * Five returns each built their own <Panel className="p-6">, so the heading
   * could not be passed in without being repeated five times -- and the sixth
   * branch someone adds next year would forget it. That is why "Recent
   * activity" lived outside the component, where at 375px it started at the
   * page gutter while this panel's content started 24px further in. The
   * misalignment was plainly visible and nothing could see it but an eye.
   */
  const Frame = ({ children, pad = 'p-6' }: { children: React.ReactNode; pad?: string }) => (
    <Panel className={pad}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        {/* lineHeight and fontWeight included: the copy in the dashboard page
            set neither, which is where the stray 18px mono 600 came from. */}
        <h2 style={HEADING}>
          Recent activity
        </h2>
        {/* "Last" here, the window from the shared constant: the page used to
            hardcode the whole string, which is two places for one fact. */}
        <Label>Last {WINDOW_LABEL}</Label>
      </div>
      <div data-testid="feed-body">{children}</div>
    </Panel>
  )

  if (hasPolicy === null) {
    return <Frame><Label className="block">Reading the chain…</Label></Frame>
  }

  // A freshly deployed account has no policy, and every operator path reverts
  // TokenNotConfigured until the owner sets one. Saying so beats an empty list.
  if (!hasPolicy) {
    return (
      <Frame>
        <Label className="block">No limits set</Label>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          Until the owner sets a per-transaction and a daily cap, this account
          refuses every spend. Open <strong>Limits</strong> to set them.
        </p>
      </Frame>
    )
  }

  if (isLoading) {
    return <Frame><Label className="block">Loading activity…</Label></Frame>
  }

  // A failed log scan must never be shown as a quiet account. forno is
  // load-balanced and a chunk can fail after its retry; saying "no activity"
  // then would be the UI asserting something it does not know.
  if (error) {
    return (
      <Frame>
        <Label className="block" style={{ color: 'var(--bad)' }}>Could not load activity</Label>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          The chain did not answer. The allowance above is still correct — it is
          read separately and does not depend on this. Reload to try again.
        </p>
      </Frame>
    )
  }

  if (rows.length === 0) {
    return (
      <Frame>
        <Label className="block">No activity yet</Label>
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
            className="focus-ring"
            style={{ borderRadius: 'var(--r-mark)', color: 'var(--celo)' }}
          >
            See the full history on Celoscan
          </a>
        </p>
      </Frame>
    )
  }

  return (
    <Frame pad="px-4 py-6">
      {rows.map((r, index) => (
        <div
          key={rowKey(r)}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[auto_1fr_auto_auto_auto]"
          style={{ borderBottom: index === rows.length - 1 ? 'none' : '1px solid var(--line)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: r.kind === 'paused' ? 'var(--bad)' : 'var(--ok)' }}
          />
          <span className="min-w-0">{r.text}</span>
          {head && (
            <Label className="col-start-2 row-start-2 sm:col-auto sm:row-auto">
              {relativeAge(
                Number(head.block - r.blockNumber) + (Date.now() - head.seenAt) / 1000,
              )}
            </Label>
          )}
          {r.amount !== null && (
            // --text, stated rather than inherited. This read `var(--amber)`,
            // a token the 2026-09-04 palette replaced and nothing defines, so
            // the declaration was invalid and the figure fell back to the
            // inherited colour. --celo is spoken for in exactly two roles and
            // cannot be the third.
            <span className="num" style={{ color: 'var(--text)' }}>
              {formatDisplayAmount(r.amount, decimals)} {symbol}
            </span>
          )}
          <a
            href={`https://celoscan.io/tx/${r.txHash}`}
            target="_blank"
            rel="noreferrer"
            aria-label="View transaction on Celoscan"
            className="focus-ring"
            style={{ borderRadius: 'var(--r-mark)', outlineColor: 'var(--text)' }}
          >
            <Label>tx ↗</Label>
          </a>
        </div>
      ))}
    </Frame>
  )
}
