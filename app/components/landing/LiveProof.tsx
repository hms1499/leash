'use client'

import Meter from '../Meter'
import Panel from '../ui/Panel'
import Label from '../ui/Label'
import Address from '../ui/Address'
import { useAccountState } from '../../lib/useAccountState.js'
import { useFeed } from '../../lib/useFeed.js'
import { explorerUrl } from '../../lib/proofs.js'
import { WINDOW_LABEL } from '../../lib/feed.js'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2' as const
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const ROWS = 3

export default function LiveProof() {
  // Two arguments, not three: useAccountState.ts:30 takes (account, token) and
  // returns bigints. DECIMALS below is for formatting only.
  const state = useAccountState(ACCOUNT, TOKEN)
  const feed = useFeed(ACCOUNT)

  return (
    <Panel>
      <div className="px-4 pt-6 flex flex-wrap items-center justify-between gap-2">
        <Label>Live on Celo mainnet</Label>
        {/* The Address primitive rather than the identical markup by hand.
            Spec §6 lists it, and an unused primitive is dead code. */}
        <Address
          address={ACCOUNT}
          explorer
          className="num"
          style={{ color: 'var(--dim)', fontSize: 'var(--t-data)' }}
        />
      </div>

      <div className="mt-3">
        <Meter
          daily={state.daily}
          remaining={state.remaining}
          perTx={state.perTx}
          decimals={DECIMALS}
          symbol="USDC"
          balance={state.balance}
          paused={state.paused}
          loading={state.isLoading}
        />
      </div>

      <div className="p-6 flex flex-col gap-2">
        {/* Capped at three rows on purpose: forno refuses a getLogs range wider
            than 5,000 blocks, so every window costs window / 5,000 sequential
            round trips, and this page is the one strangers load. Spec §5.2. */}
        {/* Three states, not one. `rows.length === 0` alone would keep saying
            "reading" after the scan finished having found nothing, and would
            report a forno failure as a quiet account -- the same mistake
            Feed.tsx already carries a comment about. Two renderings of one
            feed must not disagree (CLAUDE.md). */}
        {feed.error ? (
          <span className="text-sm" style={{ color: 'var(--bad)' }}>
            The chain did not answer. The allowance above is still correct — it
            is read separately and does not depend on this.
          </span>
        ) : feed.isLoading ? (
          <span className="text-sm" style={{ color: 'var(--dim)' }}>
            Reading recent activity from the chain…
          </span>
        ) : feed.rows.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--dim)' }}>
            {/* The span stated is the span that was scanned. */}
            Nothing has been spent in the last {WINDOW_LABEL}.{' '}
            <a
              href={`https://celoscan.io/address/${ACCOUNT}#events`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--celo)' }}
            >
              See the full history on Celoscan
            </a>
          </span>
        ) : (
          feed.rows.slice(0, ROWS).map((r) => (
            <a
              key={`${r.txHash}-${r.logIndex}`}
              className="text-sm flex justify-between gap-3"
              style={{ color: 'var(--dim)' }}
              href={explorerUrl(r.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              <span>{r.text}</span>
              <span className="num shrink-0">↗</span>
            </a>
          ))
        )}
      </div>
    </Panel>
  )
}
