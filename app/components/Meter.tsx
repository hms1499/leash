'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatAmount, percentUsed, refusalThreshold } from '../lib/policy.js'

type Props = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  decimals: number
  symbol: string
  paused: boolean
  /** True until the first read returns. Zeroes are not observations. */
  loading: boolean
}

/**
 * The one signature component. A current that grows more turbulent as the
 * agent approaches its cap and stops dead when it reaches it.
 *
 * It reads only remainingToday() and limits(), never the event log, so it
 * stays correct when log scanning fails. That is the whole reason this shape
 * was chosen over the impasto variant.
 */
export default function Meter({ daily, remaining, perTx, decimals, symbol, paused, loading }: Props) {
  const id = useId().replace(/:/g, '')
  const used = percentUsed(daily, remaining)
  const atCap = daily > 0n && remaining === 0n
  const threshold = refusalThreshold(remaining, perTx)

  // Turbulence tracks how close the agent is to the wall: calm at the start,
  // violent near the cap, frozen at it.
  const scale = atCap ? 11 : 2 + (used / 100) * 8
  const period = atCap ? 0 : Math.max(3, 14 - (used / 100) * 11)

  // Spec §3's other non-negotiable guard. It was written in CSS as
  // `@media (prefers-reduced-motion: reduce) { .meter-turbulence animate {
  // display: none } }`, which matches and applies — computed display really
  // is none — and does nothing at all: `display` has no effect on an
  // animation element, because it has no renderer to suppress. SMIL keeps
  // running and feTurbulence keeps costing, which on MiniPay is a phone's
  // battery. Only mounting the element decides whether it animates, so the
  // query is read here.
  //
  // False on the server and on first paint, so hydration matches; the effect
  // corrects it before the first frame anyone sees.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // A filter animating in a hidden tab is pure cost. Stop it there.
  const [visible, setVisible] = useState(true)
  const ref = useRef<SVGAnimateElement>(null)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const animate = !loading && !paused && !atCap && visible && !reduced && period > 0

  return (
    <div className="px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex justify-between items-baseline">
        <span className="label">Remaining today</span>
        <span className="num text-sm" style={{ color: atCap && !loading ? 'var(--bad)' : 'var(--text)' }}>
          {/* Before the first read there is nothing to state. 0.000000 here
              is indistinguishable from a spent allowance, and that is the
              first thing a visitor sees. */}
          {loading
            ? `— / — ${symbol}`
            : `${formatAmount(remaining, decimals)} / ${formatAmount(daily, decimals)} ${symbol}`}
        </span>
      </div>

      <svg
        className="meter-turbulence block w-full mt-2"
        height={12}
        viewBox="0 0 600 14"
        preserveAspectRatio="none"
        role="img"
        aria-label={loading
          ? 'Reading the daily allowance'
          : `${used.toFixed(1)} percent of the daily allowance used`}
      >
        <defs>
          <filter id={`t${id}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05 0.24"
              numOctaves={3}
              seed={7}
              result="n"
            >
              {animate && (
                <animate
                  ref={ref}
                  attributeName="seed"
                  values="7;60;7"
                  dur={`${period}s`}
                  repeatCount="indefinite"
                />
              )}
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <linearGradient id={`g${id}`}>
            <stop offset="0" stopColor="var(--meter-start)" />
            <stop offset="0.6" stopColor="var(--meter-mid)" />
            <stop offset="1" stopColor="var(--celo)" />
          </linearGradient>
        </defs>

        <rect width="600" height="14" fill="var(--well)" />
        {!paused && !loading && (
          <rect
            width={Math.max(0, Math.min(597, (used / 100) * 597))}
            height="14"
            fill={`url(#g${id})`}
            filter={`url(#t${id})`}
          />
        )}
        <rect x={atCap ? 594 : 597} width={atCap ? 6 : 3} height="14" fill="var(--bad)" />
      </svg>

      <p className="label mt-2" style={{ color: atCap && !loading ? 'var(--bad)' : 'var(--dim)' }}>
        {loading ? (
          'Reading the chain…'
        ) : paused ? (
          'Paused by the owner — every spend is refused'
        ) : threshold === 0n ? (
          'The allowance is spent — resets at UTC midnight'
        ) : (
          <>
            Next spend over{' '}
            {/* .num even here: this figure changes live, and the whole point
                of tabular-nums is that a changing figure must not reflow. */}
            <span className="num">
              {formatAmount(threshold, decimals)} {symbol}
            </span>{' '}
            will be refused
          </>
        )}
      </p>
    </div>
  )
}
