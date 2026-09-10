'use client'

import { useEffect, useState } from 'react'
import { formatDisplayAmount } from '../lib/policy.js'
import { bandSentence, meterState, spendBand } from '../lib/meter.js'
import Label from './ui/Label'
import Stat from './ui/Stat'
import { PROSE } from './ui/prose'
import { PAGE } from './ui/page'

type Props = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  decimals: number
  symbol: string
  /** What the account holds. The caps say what is allowed; only this says
   *  whether there is anything to spend. */
  balance: bigint
  /** Whether the payee allowlist is on. The ceiling is true either way; the
   *  clause under it is what changes. */
  allowlistEnabled: boolean
  paused: boolean
  /** True until the first read returns. Zeroes are not observations. */
  loading: boolean
  /**
   * Whether this meter is the dominant element of its screen.
   *
   * The dashboard's dominant element is the refusal threshold, so there it
   * takes --t-display. The landing's is the headline, and design-system §7
   * says that screen carries no --t-display at all -- "nothing here is a
   * number". This component is rendered on both, so the step cannot be baked
   * into it: a 44px figure in LiveProof would outrank the headline it is
   * supposed to support.
   */
  dominant?: boolean
}

const TRACK = 600
const CAP_X = 588
const CAP_W = 4
/** The fill stops here, 2px short of the cap line, so the line is always drawn
 *  on --well. --bad on --meter-fill is 1.36:1: a flush lock indicator would
 *  vanish at the moment it matters most. Spec §3.1. */
const FILL_MAX = CAP_X - 2

export default function Meter({
  daily, remaining, perTx, decimals, symbol, balance, allowlistEnabled, paused, loading,
  dominant = false,
}: Props) {
  // False on the server and on first paint so hydration matches; the effect
  // corrects it before the first frame anyone sees.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // An animation in a hidden tab is pure cost. Stop it there.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    // Read once at mount, like the reduced-motion effect above. Without it a
    // tab that was ALREADY hidden fires no visibilitychange, so `visible`
    // stayed true and the SMIL <animate> ran for as long as the tab stayed
    // hidden -- the opposite of what the comment below promises.
    onChange()
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const { fillPercent, locked, animating } =
    meterState({ daily, remaining, paused, loading, visible, reduced })
  const band = spendBand({ remaining, perTx, balance, allowlistEnabled, paused, loading })
  const width = Math.max(0, Math.min(FILL_MAX, (fillPercent / 100) * FILL_MAX))

  return (
    <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      {/* The meter fills the surface its parent gives it while its contents
          retain the shared page gutter. Landing and dashboard both contain
          that surface inside a panel; the PAGE cap still prevents accidental
          stretching if the component is mounted elsewhere. */}
      <div className={`${PAGE} py-3`}>
      {/* One --t-display per screen, and on the dashboard this is it.
          The allowance alone says what is permitted and the balance alone
          says what is there; 50778cd was opened because the meter showed the
          first and an empty account read as a full allowance. The ceiling is
          the only figure that is always true, because it is the minimum of
          all three. docs/design-system.md §7. */}
      {band.kind === 'ceiling' && (
        // The block announces itself. This figure is the one design-system §7
        // calls "the number that moves on camera when the agent spends", and
        // it sat in a static <Stat>: an owner listening to the dashboard heard
        // nothing change. `aria-atomic` so the label, the figure and the
        // clause are read as one phrase -- a number announced alone does not
        // say which number it is.
        <div className="mb-3" role="status" aria-atomic="true">
          <Stat
            label="Maximum next direct payment"
            value={`${formatDisplayAmount(band.amount, decimals)} ${symbol}`}
            size={dominant ? 'display' : 'data'}
          />
          {/* The figure alone does not say whether to raise a cap or send more
              money, and those are opposite actions. */}
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            limited by the {band.limitedBy}
            {/* Appended, not a sixth band.kind: the four sentences below are
                the design-system §5 state vocabulary and are not to be
                reworded, and this figure is still correct -- it is only
                incomplete without naming who may receive it. */}
            {band.restrictedToApprovedPayees && ' \u00b7 approved recipients only'}
          </p>
        </div>
      )}

      <svg
        className="meter block w-full mt-2"
        height={12}
        viewBox={`0 0 ${TRACK} 14`}
        preserveAspectRatio="none"
        role="img"
        aria-label={loading
          ? 'Reading the daily allowance'
          : `${fillPercent.toFixed(1)} percent of the daily allowance used`}
      >
        <rect width={TRACK} height="14" fill="var(--well)" />

        {!paused && !loading && (
          <rect width={width} height="14" fill="var(--meter-fill)">
            {/* Mounted only when motion is allowed. Hiding an <animate> in CSS
                matches, applies, and achieves nothing: SMIL has no renderer to
                suppress, so it keeps running and keeps costing a phone its
                battery. Only not mounting it decides. */}
            {animating && (
              <animate
                attributeName="opacity"
                values="1;0.72;1"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </rect>
        )}

        {/* The wall. Celo yellow while there is room, the blocked colour once
            the bar has struck it. One of exactly two places --celo appears. */}
        <rect
          x={CAP_X}
          width={CAP_W}
          height="14"
          fill={locked ? 'var(--bad)' : 'var(--celo)'}
        />
      </svg>

      {/* Both the sentence and the choice of sentence are decided in
          lib/meter.ts, so the words a reader sees and the words a screen
          reader hears cannot drift apart. The fifth band, `ceiling`, is the
          figure above the track. */}
      {band.kind !== 'ceiling' && (
        <Label
          className="block mt-2"
          // Its sibling above, for the four bands that replace the figure
          // rather than accompany it. The two are mutually exclusive, so they
          // never compete for the reader's ear.
          role="status"
          aria-atomic="true"
          style={{
            color: locked || band.kind === 'unfunded' ? 'var(--bad)' : 'var(--dim)',
          }}
        >
          {bandSentence(band, symbol)}
        </Label>
      )}

      {/* The three constraints the figure above is the minimum of, at --t-data.
          Before the first read there is nothing to state: 0.00 here is
          indistinguishable from a spent allowance, and that is the first thing
          a visitor sees. */}
      <div className="grid grid-cols-2 gap-5 mt-4 sm:grid-cols-3">
        <Stat
          label="Remaining today"
          value={loading
            ? `— / — ${symbol}`
            : `${formatDisplayAmount(remaining, decimals)} / ${formatDisplayAmount(daily, decimals)} ${symbol}`}
          tone={locked ? 'bad' : 'normal'}
        />
        {/* The allowance is what policy permits; this is whether the money is
            there. They are different numbers and only the first was shown. */}
        <Stat
          label="Account holds"
          value={loading ? `— ${symbol}` : `${formatDisplayAmount(balance, decimals)} ${symbol}`}
          tone={band.kind === 'unfunded' ? 'bad' : 'normal'}
        />
        <Stat
          label="Per-transaction cap"
          value={loading ? `— ${symbol}` : `${formatDisplayAmount(perTx, decimals)} ${symbol}`}
        />
      </div>
      </div>
    </div>
  )
}
