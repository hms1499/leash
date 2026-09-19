'use client'

import { useEffect, useState } from 'react'
import { formatDisplayAmount } from '../lib/policy.js'
import { bandFigure, bandSentence, meterState, spendBand } from '../lib/meter.js'
import Stat from './ui/Stat'
import Label from './ui/Label'
import { PROSE } from './ui/prose'
import { PAGE, PANEL_GRID } from './ui/page'

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
  /**
   * The inset its contents take. `gutter` is PAGE's 16px, which is what the
   * landing's LiveProof card uses beside it. `panel` is a Panel's 24px, which
   * is what every panel on the dashboard uses: there the meter kept PAGE from
   * when it was a full-bleed band, and its first line sat 8px left of the
   * panels above and below it, with 12px over it where they have 24
   * (e2e/dashboard.spec.ts).
   */
  inset?: 'gutter' | 'panel'
}

const TRACK = 600
const CAP_X = 588
const CAP_W = 4
/** The fill stops here, 2px short of the cap line, so the line is always drawn
 *  on --well. --bad on --meter-fill is 1.36:1: a flush lock indicator would
 *  vanish at the moment it matters most. Spec §3.1. */
const FILL_MAX = CAP_X - 2

/**
 * The rule that marks the one stat currently holding the figure down.
 *
 * `--text`, not `--celo`. --celo is spoken for in exactly two roles -- the
 * brand mark and the meter's cap wall -- and Feed.tsx:168 says in so many
 * words that it cannot be the third. This is not a good or a bad state either,
 * so --ok and --bad are both wrong: one of the three always binds, and which
 * one is information rather than a verdict.
 *
 * Padding only when the rule is drawn, so the two unmarked stats keep the grid
 * alignment they had. 12px is §3's `3`.
 */
function bindingRule(isBinding: boolean): React.CSSProperties {
  return isBinding
    ? { borderLeft: '2px solid var(--text)', paddingLeft: 12 }
    : {}
}

export default function Meter({
  daily, remaining, perTx, decimals, symbol, balance, allowlistEnabled, paused, loading,
  dominant = false, inset = 'gutter',
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
  const figure = bandFigure(band)
  const width = Math.max(0, Math.min(FILL_MAX, (fillPercent / 100) * FILL_MAX))

  /**
   * Which of the three stats below produced the figure above it.
   *
   * `spendBand` has decided this since it was written -- the sentence under
   * the figure reads it out -- and the row it names sat unmarked, so a reader
   * matched "limited by the per-transaction cap" to a column by reading three
   * labels. `null` outside the `ceiling` band: in `paused`, `unfunded` and
   * `exhausted` the figure is zero for a reason no single stat explains, and
   * pointing at one of them would be a claim the band does not make.
   */
  const binding = band.kind === 'ceiling' ? band.limitedBy : null

  return (
    <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      {/* The meter fills the surface its parent gives it while its contents
          retain the shared page gutter. Landing and dashboard both contain
          that surface inside a panel.

          PAGE and nothing else. This carried `maxWidth: var(--meter-max)` --
          736px, inline, so it beat PAGE's own `max-w-5xl` -- and the result
          was that the meter's whole block sat on a 736px column while every
          other panel on the page sat on a 1024px one. Measured at a 1440px
          viewport: the panels' content ran 249→1191 and this ran 368→1072,
          inset 119px on each side, which is what a reader sees as the meter
          not lining up with anything.

          The variable was introduced for a real reason and applied one scope
          too wide, which is the same mistake it was introduced to fix. §3 had
          held every SCREEN at 768px because Meter is an SVG with
          viewBox="0 0 600 14" and magnifies rather than reflows -- at the
          1888px it measured on an unconstrained dashboard, the 2px gap §3.1
          spends a rule on magnified with it. Moving that to the component was
          right; putting it on the block rather than on the drawing was not.
          The heading, the figure, the sentence and the three stats do not
          magnify, and they were pulled in with the bar.

          Nothing replaces it, because PAGE already caps the page at 1024px:
          the unconstrained case that motivated a cap cannot happen any more.
          At 1440px the track is now 958px, a magnification of 1.6x against the
          3.1x that made the marks unreadable, and the cap wall reads at 6.4px.
          Measured in a browser, not reasoned about.

          The deeper fault is still here and is deliberately left for after the
          deadline: CAP_W and the 2px gap are viewBox units, so they scale with
          the container at all. A track drawn as two divs with the wall
          absolutely positioned at a fixed 4px would not, and would need no cap
          at any level. Changing it means rewriting e2e/dashboard.spec.ts's
          reduced-motion guard, which asserts the SMIL <animate> element -- one
          of the two guards spec §3 calls non-negotiable. */}
      <div className={inset === 'panel' ? 'p-6' : `${PAGE} py-3`}>
      {/* One --t-display per screen, and on the dashboard this is it.
          The allowance alone says what is permitted and the balance alone
          says what is there; 50778cd was opened because the meter showed the
          first and an empty account read as a full allowance. The ceiling is
          the only figure that is always true, because it is the minimum of
          all three. docs/design-system.md §7.

          Present in all five bands, not just `ceiling`. It used to render for
          that one alone, which meant the screen lost its dominant element in
          the four states where something was wrong -- the same shape of
          defect as the §4 badge drawn in the colour behind it. */}
      {/* The block announces itself. This figure is the one design-system §7
          calls "the number that moves on camera when the agent spends", and
          it sat in a static <Stat>: an owner listening to the dashboard heard
          nothing change. `aria-atomic` so the label, the figure and the
          clause are read as one phrase -- a number announced alone does not
          say which number it is. */}
      <div className="mb-3" role="status" aria-atomic="true">
        <Stat
          label="Maximum next direct payment"
          value={figure === null
            ? `— ${symbol}`
            : `${formatDisplayAmount(figure, decimals)} ${symbol}`}
          size={dominant ? 'display' : 'data'}
          tone={figure === 0n ? 'bad' : 'normal'}
        />
        {/* The figure alone does not say whether to raise a cap or send more
            money, and those are opposite actions -- and in the other four
            bands it does not say why it is zero. Both clauses are decided in
            lib/meter.ts so the words a reader sees and the words a screen
            reader hears cannot drift apart. */}
        <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
          {band.kind === 'ceiling'
            ? <>
                limited by the {band.limitedBy}
                {/* Appended, not a sixth band.kind: the four §5 state
                    vocabulary sentences are not to be reworded, and this
                    figure is still correct -- it is only incomplete without
                    naming who may receive it. */}
                {band.restrictedToApprovedPayees && ' \u00b7 approved recipients only'}
              </>
            : bandSentence(band, symbol)}
        </p>
      </div>

      {/* The bar measures the daily allowance, and the figure above it is the
          minimum of THREE constraints -- a different quantity. Stacked with
          nothing between them, a reader takes the bar for that figure's gauge.
          Naming it is the whole fix; the two are both worth showing and only
          the silence was wrong.

          The percentage is also what tells an empty track from a full bar.
          At 0% used the fill has width 0, so the whole shape is `--well` --
          darker than the panel behind it, and a solid dark rectangle reads as
          full. §7 met the same ambiguity in the zero-balance state and
          answered it the same way: "the empty state needed a number, not an
          illustration."

          `role="status"` is deliberately NOT repeated here. The block above
          already announces the figure that moves when the agent spends, and a
          second live region on the same panel interrupts the first. */}
      <div className="flex items-baseline justify-between gap-3 mt-6">
        <Label>Daily allowance used</Label>
        <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)' }}>
          {loading ? '—' : `${Math.round(fillPercent)}%`}
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

        {/* `meter-fill` eases this rect's width over --m-slow. A CSS
            transition does not run on the first render, so the bar arrives at
            today's figure rather than sweeping up to it -- §12 allows movement
            the reader caused, and loading a page is not that. What it does
            catch is the next poll: an agent spends, and the wall the bar is
            travelling towards is visibly where it was. The figure above still
            changes in one frame; only the geometry eases. */}
        {!paused && !loading && (
          <rect className="meter-fill" width={width} height="14" fill="var(--meter-fill)">
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

      {/* The three constraints the figure above is the minimum of, at --t-data.
          Before the first read there is nothing to state: 0.00 here is
          indistinguishable from a spent allowance, and that is the first thing
          a visitor sees. */}
      {/* One column below `md`, four of the twelve each above it. grid-cols-2
          left the third stat alone on its own row with its 11px .16em label
          wrapped onto two lines -- measured at 375px on 2026-09-11. gap-5 and
          mt-4 were both off §3's scale. */}
      <div className={`${PANEL_GRID} mt-6`}>
        <div data-testid="meter-stat" className="col-span-12 md:col-span-4"
          style={bindingRule(binding === 'daily allowance')}>
        <Stat
          label="Remaining today"
          value={loading
            ? `— / — ${symbol}`
            : `${formatDisplayAmount(remaining, decimals)} / ${formatDisplayAmount(daily, decimals)} ${symbol}`}
          tone={locked ? 'bad' : 'normal'}
        />
        </div>
        {/* The allowance is what policy permits; this is whether the money is
            there. They are different numbers and only the first was shown. */}
        <div data-testid="meter-stat" className="col-span-12 md:col-span-4"
          style={bindingRule(binding === 'balance')}>
        <Stat
          label="Account holds"
          value={loading ? `— ${symbol}` : `${formatDisplayAmount(balance, decimals)} ${symbol}`}
          tone={band.kind === 'unfunded' ? 'bad' : 'normal'}
        />
        </div>
        <div data-testid="meter-stat" className="col-span-12 md:col-span-4"
          style={bindingRule(binding === 'per-transaction cap')}>
        <Stat
          label="Per-transaction cap"
          value={loading ? `— ${symbol}` : `${formatDisplayAmount(perTx, decimals)} ${symbol}`}
        />
        </div>
      </div>
      </div>
    </div>
  )
}
