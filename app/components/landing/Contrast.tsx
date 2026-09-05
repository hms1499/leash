import Panel from '../ui/Panel'
import Label from '../ui/Label'
import { PROSE } from '../ui/prose'

const ROWS: ReadonlyArray<{ without: string; with_: string }> = [
  { without: 'The agent holds the private key.', with_: 'The money sits in a contract. The agent holds a key that can only ask.' },
  { without: 'A leaked key drains the wallet.', with_: 'A leaked key spends at most one day’s allowance, to addresses you named.' },
  { without: '“Only spend $5 a day” is an instruction.', with_: '$5 a day is code. Over it, the transaction reverts.' },
  { without: 'You find out afterwards.', with_: 'You watch it live, and you can stop it in one click.' },
]

export default function Contrast() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Panel className="p-6">
        <Label>Without Leash</Label>
        <ul className="mt-3 flex flex-col gap-3">
          {ROWS.map((r) => (
            <li key={r.without} style={{ ...PROSE, color: 'var(--dim)' }}>{r.without}</li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-6">
        <Label>With Leash</Label>
        <ul className="mt-3 flex flex-col gap-3">
          {ROWS.map((r) => (
            <li key={r.with_} style={{ ...PROSE, color: 'var(--text)' }}>{r.with_}</li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
