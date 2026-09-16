'use client'

import { useEffect, useRef } from 'react'
import Meter from '../Meter'
import ActionLink from '../ui/ActionLink'
import Panel from '../ui/Panel'
import Label from '../ui/Label'
import Address from '../ui/Address'
import { useAccountState } from '../../lib/useAccountState.js'
import { useFeed } from '../../lib/useFeed.js'
import { explorerUrl } from '../../lib/proofs.js'
import { arrivedKeys, rowKey, WINDOW_LABEL } from '../../lib/feed.js'

const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d' as const
const OPERATOR = '0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6' as const
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const ROWS = 3

export default function LiveProof() {
  // Two arguments, not three: useAccountState.ts:30 takes (account, token) and
  // returns bigints. DECIMALS below is for formatting only.
  const state = useAccountState(ACCOUNT, TOKEN)
  const feed = useFeed(ACCOUNT, TOKEN)

  /**
   * The one thing on this page that is allowed to move on its own.
   *
   * design-system.md §12 bans motion the reader did not cause, widened
   * 2026-09-14 to "the reader **or the chain**", and names the whole of what
   * that admits: a row appearing because an agent just paid somebody is the
   * page reporting an event. Its test is "would this have moved if the chain
   * had been idle?" -- and if this account is quiet, nothing here moves.
   *
   * `Feed` on the dashboard has done this since the widening. This panel
   * renders the same feed and did not, which CLAUDE.md names directly: two
   * implementations of one operation must not behave differently. The
   * difference mattered most here, because this is the panel a stranger sees
   * without a wallet -- the page argues the money is real, and the moment it
   * can show that is a payment landing while they watch.
   *
   * Identical mechanics to Feed.tsx, from the same pure functions rather than
   * a second copy of the logic: refs because the answer is wanted during the
   * render that mounts the row, and `primed` because §12 also says a
   * transition does not run on first render. Without it every row would
   * announce itself on mount, which is an entrance, which is the thing the
   * rule refuses.
   *
   * Tracked against the whole poll, not the three rows drawn: a row can arrive
   * and be pushed past the cut by another in the same poll.
   */
  const seen = useRef<ReadonlySet<string>>(new Set())
  const primed = useRef(false)
  const arrived = arrivedKeys(seen.current, primed.current, feed.rows)
  useEffect(() => {
    const next = new Set(seen.current)
    for (const r of feed.rows) next.add(rowKey(r))
    seen.current = next
    primed.current = true
  }, [feed.rows])

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
        {state.error && state.updatedAt === null ? (
          <p className="p-6 text-sm" style={{ color: 'var(--bad)' }}>
            The live account could not be read. No balance is being shown as zero.
          </p>
        ) : (
          <Meter
            daily={state.daily}
            remaining={state.remaining}
            perTx={state.perTx}
            decimals={DECIMALS}
            symbol="USDC"
            balance={state.balance}
            allowlistEnabled={state.allowlistEnabled}
            paused={state.paused}
            loading={state.isLoading}
          />
        )}
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
              className="focus-ring"
              style={{ borderRadius: 'var(--r-mark)', color: 'var(--celo)' }}
            >
              See the full history on Celoscan
            </a>
          </span>
        ) : (
          feed.rows.slice(0, ROWS).map((r) => (
            <a
              key={rowKey(r)}
              className={`text-sm flex justify-between gap-3${
                arrived.has(rowKey(r)) ? ' motion-reveal' : ''}`}
              style={{ color: 'var(--dim)' }}
              href={explorerUrl(r.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              <span>{r.text}</span>
              {/* --t-data, not the 14px the row above inherits. `.num` switches
                  the family to mono, and mono at 14px 400 is not a step the
                  scale declares -- 14px mono is `subhead`, at 500. (Writing the
                  raw class name here would also have moved the debt ratchet in
                  test/scaleUsage.test.ts, which counts the file's text.) This
                  branch only renders when
                  the account has spent something inside the feed window, so it
                  had never been drawn on the landing until the demo address
                  moved to v2, and e2e/faces.spec.ts caught it the first time it
                  was. SecurityBoundary draws its arrow the same way. */}
              <span
                className="num shrink-0"
                style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)' }}
              >↗</span>
            </a>
          ))
        )}
        <div className="mt-4">
          <ActionLink href={`/a/${ACCOUNT}?operator=${OPERATOR}`}>Open full dashboard</ActionLink>
        </div>
      </div>
    </Panel>
  )
}
