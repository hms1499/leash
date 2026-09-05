'use client'

import { useEffect, useState } from 'react'
import { formatAmount } from '../lib/policy.js'
import { meterState, spendBand } from '../lib/meter.js'
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
  daily, remaining, perTx, decimals, symbol, balance, paused, loading,
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
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const { fillPercent, locked, animating } =
    meterState({ daily, remaining, paused, loading, visible, reduced })
  const band = spendBand({ remaining, perTx, balance, paused, loading })
  const width = Math.max(0, Math.min(FILL_MAX, (fillPercent / 100) * FILL_MAX))

  return (
    <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      {/* The ground spans; the content does not. On the dashboard this element
          is the full width of the viewport, and the meter inside it stays on
          the page's column -- without this it drew 1888px wide, with the fill
          at one edge and the cap line at the other. On the landing the outer
          div is already inside a 768px Panel, so this changes nothing there. */}
      <div className={`${PAGE} py-3`}>
      {/* One --t-display per screen, and on the dashboard this is it.
          The allowance alone says what is permitted and the balance alone
          says what is there; 50778cd was opened because the meter showed the
          first and an empty account read as a full allowance. The ceiling is
          the only figure that is always true, because it is the minimum of
          all three. docs/design-system.md §7. */}
      {band.kind === 'ceiling' && (
        <div className="mb-3">
          <Stat
            label="Agent can spend up to"
            value={`${formatAmount(band.amount, decimals)} ${symbol}`}
            size={dominant ? 'display' : 'data'}
          />
          {/* The figure alone does not say whether to raise a cap or send more
              money, and those are opposite actions. */}
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            limited by the {band.limitedBy}
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

      {/* Which sentence this is, is decided in lib/meter.ts so it can be
          tested; only the wording lives here. These four are the state
          vocabulary of design-system §5 and are not to be reworded. The fifth,
          `ceiling`, is the figure above the track. */}
      {band.kind !== 'ceiling' && (
        <Label
          className="block mt-2"
          style={{
            color: locked || band.kind === 'unfunded' ? 'var(--bad)' : 'var(--dim)',
          }}
        >
          {band.kind === 'loading'
            ? 'Reading the chain…'
            : band.kind === 'paused'
              ? 'Paused by the owner — every spend is refused'
              : band.kind === 'unfunded'
                ? `This account holds no ${symbol} — every spend will fail`
                : 'The allowance is spent — resets at UTC midnight'}
        </Label>
      )}

      {/* The three constraints the figure above is the minimum of, at --t-data.
          Before the first read there is nothing to state: 0.000000 here is
          indistinguishable from a spent allowance, and that is the first thing
          a visitor sees. */}
      <div className="flex flex-wrap gap-6 mt-3">
        <Stat
          label="Remaining today"
          value={loading
            ? `— / — ${symbol}`
            : `${formatAmount(remaining, decimals)} / ${formatAmount(daily, decimals)} ${symbol}`}
          tone={locked ? 'bad' : 'normal'}
        />
        {/* The allowance is what policy permits; this is whether the money is
            there. They are different numbers and only the first was shown. */}
        <Stat
          label="Account holds"
          value={loading ? `— ${symbol}` : `${formatAmount(balance, decimals)} ${symbol}`}
          tone={band.kind === 'unfunded' ? 'bad' : 'normal'}
        />
        <Stat
          label="Per-transaction cap"
          value={loading ? `— ${symbol}` : `${formatAmount(perTx, decimals)} ${symbol}`}
        />
      </div>
      </div>
    </div>
  )
}
