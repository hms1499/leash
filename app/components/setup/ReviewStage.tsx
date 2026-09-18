'use client'

import Address from '../ui/Address'
import ActionLink from '../ui/ActionLink'
import Button from '../ui/Button'
import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { SUBHEAD } from '../ui/prose'
import { PANEL_GRID } from '../ui/page'
import McpHandoff from '../McpHandoff'
import GeneratedKeyPanel from './GeneratedKeyPanel'
import { HEADING, STAGE_HEADING_ID, STATUS_BOX, type ConfirmedLimits } from './chrome.js'
import { DECIMALS } from './contracts.js'
import { describeTopUpMode } from '../../lib/setup.js'
import { formatDisplayAmount } from '../../lib/policy.js'
import { isValidAddress } from '../../lib/address.js'

/**
 * Step 4. The only stage that writes nothing.
 *
 * It takes values rather than a slice of the wizard's state, because it reads
 * the account and never changes it: every figure here was already verified on
 * Celo by `setupReadiness` before this stage unlocked, and the one affordance
 * that is not a link goes back a step.
 */
export default function ReviewStage({
  account, agent, limits, protectedBalanceText, agentTransactionsLeft,
  recipientProtectionEnabled, topUpEnabled, shownKey, onBack,
}: {
  account: `0x${string}`
  agent: string
  limits: ConfirmedLimits
  protectedBalanceText: string
  agentTransactionsLeft: number
  recipientProtectionEnabled: boolean
  topUpEnabled: boolean
  /** Scoped by `keyToShow`, never the raw held key. */
  shownKey: `0x${string}` | null
  onBack: () => void
}) {
  return (
    <Panel as="section" className="p-6 mt-6">
      <Label className="block">Step 4 of 4</Label>
      <h2 id={STAGE_HEADING_ID} tabIndex={-1} className="mt-2" style={HEADING}>Your agent account is ready</h2>
      <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
        The on-chain protections, agent permission and both operating balances have been verified.
      </p>
      <div className="p-6 mt-5" style={{ ...STATUS_BOX, borderColor: 'var(--ok)' }}>
        <p style={{ ...SUBHEAD, color: 'var(--ok)' }}>Ready on Celo</p>
        <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
          Hand the account address to your agent when you are ready to connect its runtime.
        </p>
      </div>
      <dl className={`${PANEL_GRID} mt-6 text-sm`}>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Protected account</dt>
          <dd className="mt-2"><Address address={account} copy explorer className="num" /></dd></div>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Agent wallet</dt>
          <dd className="mt-2"><Address address={agent} copy explorer className="num" /></dd></div>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Maximum per payment</dt>
          <dd className="num mt-2">{formatDisplayAmount(limits.perTx, DECIMALS, 2)} USDC</dd></div>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Maximum per day</dt>
          <dd className="num mt-2">{formatDisplayAmount(limits.daily, DECIMALS, 2)} USDC</dd></div>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Protected balance</dt>
          <dd className="num mt-2">{protectedBalanceText}</dd></div>
        <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Agent gas</dt>
          <dd className="num mt-2">{agentTransactionsLeft} {agentTransactionsLeft === 1 ? 'transaction' : 'transactions'} available</dd></div>
        <div className="col-span-12"><dt style={{ color: 'var(--dim)' }}>Direct-payment recipients</dt>
          <dd className="mt-2">{recipientProtectionEnabled ? 'Approved addresses only' : 'Any address — recipient protection is not enabled'}</dd></div>
        <div className="col-span-12"><dt style={{ color: 'var(--dim)' }}>Agent-funded payments</dt>
          <dd className="mt-2">{describeTopUpMode(topUpEnabled)}</dd></div>
      </dl>
      <div className="mt-6">
        {/* agent is a verified operator by this point: readiness.ready
            gates this whole stage on addAgent's operators() check. */}
        <McpHandoff
          account={account}
          operator={isValidAddress(agent) ? agent as `0x${string}` : null}
          defaultOpen
        />
        {/* Repeated from step 3 rather than linked back to it. The block
            above is copied here, and OPERATOR_PK is the one field the
            reader has to fill by hand -- so the value it wants belongs on
            the same screen, not one step behind. */}
        {shownKey && <GeneratedKeyPanel privateKey={shownKey} />}
      </div>

      <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
        <h3 style={SUBHEAD}>What happens next</h3>
        {/* Was "a separate integration journey", which stopped being true
            when the block above moved onto this step. Still not REQUIRED
            -- readiness deliberately ignores it (lib/setup.ts) -- but it
            is no longer somewhere else. */}
        <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
          Open the dashboard to monitor spending or change protection. The account is complete either way: connecting a runtime is optional and is not part of what this setup verifies.
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <ActionLink href={`/a/${account}?operator=${agent}`} variant="primary">Open dashboard</ActionLink>
          <Button variant="ghost" onClick={onBack}>Review funding</Button>
        </div>
      </div>
    </Panel>
  )
}

/**
 * What step 4 shows when it cannot summarise the account.
 *
 * Its own component rather than a branch inside the one above, so that one
 * never has to accept a null account or a null limit it would then re-check.
 * Reaching this means readiness went false after the reader arrived -- a
 * wallet switch, or a read that failed -- and the honest move is to send them
 * back to the step that can fix it rather than to summarise nothing.
 */
export function ReviewUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <Panel as="section" className="p-6 mt-6">
      <p id={STAGE_HEADING_ID} tabIndex={-1} className="text-sm" style={{ color: 'var(--bad)' }}>
        This account&apos;s setup could not be summarised. Go back a step to
        check its limits, agent and balances.
      </p>
      <Button variant="ghost" className="mt-3" onClick={onBack}>
        Back to step 3
      </Button>
    </Panel>
  )
}
