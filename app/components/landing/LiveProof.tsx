'use client'

import { useEffect, useRef } from 'react'
import Meter from '../Meter'
import ActionLink from '../ui/ActionLink'
import Panel from '../ui/Panel'
import Label from '../ui/Label'
import Address from '../ui/Address'
import { DATA } from '../ui/prose'
import { useAccountState } from '../../lib/useAccountState.js'
import { useFeed } from '../../lib/useFeed.js'
import { explorerUrl } from '../../lib/proofs.js'
import { arrivedKeys, rowKey, WINDOW_LABEL } from '../../lib/feed.js'
import { CELO_USDC } from '@leash/sdk'

const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d' as const
const OPERATOR = '0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6' as const
/**
 * USDC on Celo mainnet. One literal, in `@leash/sdk`, because this line was
 * four separate copies of the same 42 characters and the MCP server asked
 * every user to paste a fifth by hand.
 */
const TOKEN = CELO_USDC
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
        {/* The dot breathes while the page is reading the chain: §12's landing
            exception. --r-dot is the one radius a state dot takes (§10). */}
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="landing-live"
            style={{ width: 6, height: 6, borderRadius: 'var(--r-dot)', background: 'var(--ok)' }}
          />
          <Label>Live on Celo mainnet</Label>
        </span>
        {/* The Address primitive rather than the identical markup by hand.
            Spec §6 lists it, and an unused primitive is dead code. */}
        <Address
          address={ACCOUNT}
          explorer
          className="num"
          style={{ color: 'var(--dim)', fontSize: 'var(--t-data)' }}
        />
      </div>

      {/**
        * How fresh the figures below are, which the panel knew and never said.
        *
        * "Live on Celo mainnet" was an assertion a reader had no way to check;
        * this is the same claim with a number behind it, and the number moves
        * every poll because the chain moved. That is §12's sanctioned
        * category -- the page reporting -- and it is why the block height is
        * shown rather than a relative time. "Read 2 seconds ago" would have to
        * recompute on a timer of its own, which is a clock ticking on the
        * page, which is ambient and banned.
        *
        * Free: useFeed already calls getBlockNumber every tail tick to work
        * out its range, and exposes the result as `head`. Nothing here adds a
        * request.
        *
        * `.num` for the same reason money uses it -- tabular figures, so a
        * height that gains a digit does not shift the row.
        */}
      {feed.head && (
        <p
          className="num px-4 mt-2"
          style={{ ...DATA, color: 'var(--dim)' }}
        >
          {/* Keyed by the block, so each new one remounts the span and its
              colour eases back to --dim: the chain moved, and nothing moves
              when it has not. The figure itself snaps. */}
          Read at block{' '}
          <span key={feed.head.block.toString()} className="landing-tick">
            {feed.head.block.toLocaleString('en-US')}
          </span>
        </p>
      )}

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
          /**
           * An idle account stated as a fact, not as an absence.
           *
           * This read "Nothing has been spent in the last 24 hours" followed by
           * a link off the site, which on 2026-09-16 was what every visitor
           * saw: the window was scanned in full and held zero events, the last
           * activity being about three and a half days back. The deadest
           * sentence available, on the one panel whose job is to show the money
           * is real -- and its only call to action sent the reader to Celoscan.
           *
           * The span scanned is still stated, because the claim has to stay
           * exactly as narrow as the scan. What follows it is now what is true
           * right now rather than what failed to happen: the allowance is live,
           * read seconds ago, and it is what the agent could spend if it ran
           * this second.
           */
          <span className="text-sm" style={{ color: 'var(--dim)' }}>
            Quiet for {WINDOW_LABEL} — the allowance above is live and unspent,
            and resets at 00:00 UTC.{' '}
            <a
              href={`https://celoscan.io/address/${ACCOUNT}#events`}
              target="_blank"
              rel="noreferrer"
              className="focus-ring"
              style={{ borderRadius: 'var(--r-mark)', color: 'var(--celo)' }}
            >
              Full history on Celoscan
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
