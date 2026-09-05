import Label from './Label'

/**
 * A label and its value. `.num` stays a global class and is never wrapped
 * away: money must be mono and tabular so digits do not reflow as values
 * update live (CLAUDE.md).
 *
 * This component existed with zero imports while Meter and LiveProof each
 * built the same pair by hand, so the two drifted. `size` is why it was
 * skipped -- the dashboard needs one figure at display size and the rest at
 * data size. docs/design-system.md §6.
 */
export default function Stat({
  label, value, tone = 'normal', size = 'data',
}: {
  label: string
  value: string
  tone?: 'normal' | 'bad'
  /** 'display' is the one figure a screen is about. At most one per screen. */
  size?: 'data' | 'display'
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <span
        className="num"
        style={{
          fontSize: size === 'display' ? 'var(--t-display)' : 'var(--t-data)',
          lineHeight: size === 'display' ? 'var(--t-display-line)' : 'var(--t-data-line)',
          fontWeight: size === 'display' ? 600 : 400,
          color: tone === 'bad' ? 'var(--bad)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  )
}
