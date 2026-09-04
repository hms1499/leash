import Label from './Label'

/** `.num` stays a global class and is never wrapped away: money must be mono
 *  and tabular so digits do not reflow as values update live (CLAUDE.md). */
export default function Stat({
  label, value, tone = 'normal',
}: { label: string; value: string; tone?: 'normal' | 'bad' }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <span className="num text-sm" style={{ color: tone === 'bad' ? 'var(--bad)' : 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}
