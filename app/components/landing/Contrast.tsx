import Panel from '../ui/Panel'
import Label from '../ui/Label'
import { PROSE } from '../ui/prose'

/**
 * The second row used to end "...to addresses you named". That was false.
 *
 * The payee allowlist is checked in exactly one place, `execute`
 * (SpendPolicyAccount.sol:122). `topUpOperator` moves funds to the operator's
 * own wallet and never consults it -- the contract's own comment says so:
 * "the payee allowlist cannot apply once funds leave this contract". A stolen
 * agent key therefore reaches an attacker's address whatever the allowlist
 * says. The daily bound still holds, because both paths run `_consume`, so
 * that is what this row now claims and nothing more. The full answer is in
 * Questions.tsx.
 */
const ROWS: ReadonlyArray<{ without: string; with_: string }> = [
  { without: 'The agent holds the private key.', with_: 'The money sits in a contract. The agent holds a key that can only ask.' },
  { without: 'A leaked key drains the wallet.', with_: 'A leaked key spends at most one day’s allowance, never the balance behind it.' },
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
