'use client'

import { useEffect, useState } from 'react'
import { formatAmount } from '../lib/policy.js'
import { meterState, spendBand } from '../lib/meter.js'
import Label from './ui/Label'

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
    <div className="px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex justify-between items-baseline gap-3">
        <Label>Remaining today</Label>
        <span className="num text-sm" style={{ color: locked ? 'var(--bad)' : 'var(--text)' }}>
          {/* Before the first read there is nothing to state. 0.000000 here is
              indistinguishable from a spent allowance, and that is the first
              thing a visitor sees. */}
          {loading
            ? `— / — ${symbol}`
            : `${formatAmount(remaining, decimals)} / ${formatAmount(daily, decimals)} ${symbol}`}
        </span>
      </div>

      {/* The allowance above is what policy permits; this is whether the money
          is there. They are different numbers and only the first was shown. */}
      <div className="flex justify-between items-baseline gap-3 mt-1">
        <Label>Account holds</Label>
        <span
          className="num text-sm"
          style={{ color: band.kind === 'unfunded' ? 'var(--bad)' : 'var(--dim)' }}
        >
          {loading ? `— ${symbol}` : `${formatAmount(balance, decimals)} ${symbol}`}
        </span>
      </div>

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
          tested; only the wording lives here. */}
      <Label
        className="block mt-2"
        style={{
          color: locked || band.kind === 'unfunded' ? 'var(--bad)' : 'var(--dim)',
        }}
      >
        {band.kind === 'loading' ? (
          'Reading the chain…'
        ) : band.kind === 'paused' ? (
          'Paused by the owner — every spend is refused'
        ) : band.kind === 'unfunded' ? (
          `This account holds no ${symbol} — every spend will fail`
        ) : band.kind === 'exhausted' ? (
          'The allowance is spent — resets at UTC midnight'
        ) : (
          <>
            Next spend over{' '}
            {/* .num even here: this figure changes live, and the whole point of
                tabular-nums is that a changing figure must not reflow. */}
            <span className="num">
              {formatAmount(band.amount, decimals)} {symbol}
            </span>{' '}
            will be refused
          </>
        )}
      </Label>
    </div>
  )
}
