'use client'

import { use, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import NetworkBadge from '../../../components/NetworkBadge'
import Address from '../../../components/ui/Address'
import Label, { LABEL_STYLE } from '../../../components/ui/Label'
import Shell from '../../../components/ui/Shell'
import { PAGE } from '../../../components/ui/page'
import LimitsDrawer from '../../../components/LimitsDrawer'
import StopButton from '../../../components/StopButton'
import AgentPanel from '../../../components/AgentPanel'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress } from '../../../lib/address.js'
import { canEdit } from '../../../lib/policy.js'
import { publicClient } from '../../../lib/chain.js'

// USDC on Celo mainnet. The token the policy is denominated in; the UI treats
// stablecoins as 1:1 with the dollar, and that assumption lives here in the UI
// and never in the contract.
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const SYMBOL = 'USDC'

const OPERATOR_ABI = [
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

export default function DashboardRoute({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  if (!isValidAddress(address)) {
    return (
      <Shell title="That is not a Celo address.">
        <p>
          An address is <code>0x</code> followed by 40 hexadecimal characters.
          Check the link you followed, or start from the top.
        </p>
      </Shell>
    )
  }
  return <Dashboard address={address} />
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const state = useAccountState(address, TOKEN)

  // Spec §1.2: the deploy receipt's block is the correct floor for a log
  // scan, and the wizard has been storing it under `leash.deployBlock` with
  // nothing reading it. Only honoured when the stored account is the one
  // being viewed — another account's deploy block would silently hide its
  // history.
  //
  // The spec also says this can be "carried in the URL". It deliberately is
  // not: a `?fromBlock=` a stranger controls could hide every spend from
  // whoever opened the link, which is the same attacker-controllable-input
  // shape the operator check already refuses to trust.
  //
  // Read in an effect, not during render: localStorage does not exist on the
  // server and touching it in the render body is a hydration mismatch.
  const [deployBlock, setDeployBlock] = useState<bigint | undefined>(undefined)
  useEffect(() => {
    try {
      const savedAccount = localStorage.getItem('leash.account')
      const savedBlock = localStorage.getItem('leash.deployBlock')
      if (
        savedAccount && savedBlock &&
        savedAccount.toLowerCase() === address.toLowerCase() &&
        /^\d+$/.test(savedBlock)
      ) {
        setDeployBlock(BigInt(savedBlock))
      }
    } catch {
      // A browser with storage blocked simply scans the whole window.
    }
  }, [address])

  const feed = useFeed(address, deployBlock)
  const { address: connected } = useAccount()
  const isOwner = canEdit(state.owner, connected)

  // The contract stores operators in a mapping(address => bool), which
  // cannot be enumerated, so the dashboard learns the operator address from
  // the most recent Spent or ToppedUp row — both carry it — falling back to
  // a query parameter when the feed is empty.
  //
  // Read inside an effect, never during render: this page is server-rendered
  // before it hydrates, and touching window.location in the render body
  // produces a hydration mismatch.
  //
  // Neither source is trusted on its own. A feed row only proves an address
  // *was* an operator when that log was emitted — an owner who has since
  // revoked it would still see a refuel button for a wallet the contract no
  // longer trusts. A `?operator=` query parameter is worse: it is
  // attacker-controllable, so an unverified value here would let a phishing
  // link show "Send 0.05 USDC for gas" to a wallet the owner never approved.
  // Both sources are therefore only candidates; `operators()` on the account
  // itself is what actually gates the panel.
  const [operator, setOperator] = useState<string | null>(null)
  const [operatorCheckFailed, setOperatorCheckFailed] = useState(false)

  // The check below depends on feed.rows, so a single failed read used to
  // stick until a new feed event arrived — while its neighbour, the balance
  // poll, self-healed every 8 seconds. Given forno's documented flakiness and
  // that the refuel button is the demo's rescue beat, a failure retries on
  // the same cadence instead of waiting for a reload.
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!operatorCheckFailed) return
    const t = setInterval(() => {
      if (!document.hidden) setRetry((n) => n + 1)
    }, 8000)
    return () => clearInterval(t)
  }, [operatorCheckFailed])

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const fromFeed = feed.rows.find((r) => r.kind === 'spent' || r.kind === 'toppedUp')?.operator
      const fromQuery = new URLSearchParams(window.location.search).get('operator')
      // A spend proves the operator is real and working, so it wins. Failing
      // that, who the owner authorised: without this an account set up but not
      // yet used — what the wizard leaves behind — never showed its agent at
      // all. The query parameter stays last and stays untrusted; operators()
      // below is what decides, either way.
      const candidate = fromFeed ?? feed.operatorCandidate ?? fromQuery
      if (!candidate || !isValidAddress(candidate)) {
        if (!cancelled) { setOperator(null); setOperatorCheckFailed(false) }
        return
      }
      try {
        const isOperator = await publicClient.readContract({
          address, abi: OPERATOR_ABI, functionName: 'operators', args: [candidate],
        }) as boolean
        if (cancelled) return
        setOperator(isOperator ? candidate : null)
        setOperatorCheckFailed(false)
      } catch {
        // Fail closed: a failed check must never render the panel as if it
        // had verified the address, since that is exactly the phishing shape
        // this check exists to prevent.
        if (!cancelled) { setOperator(null); setOperatorCheckFailed(true) }
      }
    }
    void resolve()
    return () => { cancelled = true }
    // operatorCandidate belongs here: on an account that has been configured
    // but never used it is the only thing that changes, so leaving it out
    // would keep the panel hidden for exactly the case it was added for. It is
    // an address or null, compared by value.
  }, [feed.rows, feed.operatorCandidate, address, retry])

  return (
    <main>
      {/* Everything on this band obeys the bright-ground rule: --bg only.
          Mixing --text at 3.16 with --bg at 5.10 was the state this was left
          in when the invisible-badge bug was fixed in a hurry. */}
      <header
        style={{
          background: state.paused ? 'var(--bad)' : 'var(--panel)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className={`${PAGE} flex items-center gap-3 py-3`}>
        <strong style={{
          fontFamily: 'var(--mono)', fontSize: 'var(--t-label)',
          color: state.paused ? 'var(--bg)' : 'var(--celo)', letterSpacing: '.26em',
        }}>
          LEASH
        </strong>
        {/* .label's --dim on the paused band's --bad is about 1.6:1 and
            disappears on video. The state change is meant to read at a glance,
            and the address is what tells you *which* account stopped. */}
        <Address
          address={address}
          copy
          explorer
          style={{ ...LABEL_STYLE, color: state.paused ? 'var(--bg)' : undefined }}
        />
        <span className="ml-auto flex items-center gap-3">
          <NetworkBadge onDangerBand={state.paused} />
          <StopButton
            account={address}
            paused={state.paused}
            isOwner={isOwner}
            loading={state.isLoading}
            onChanged={state.refetch}
          />
          <ConnectButton />
        </span>
        </div>
      </header>

      {/* The dashboard's dominant element, so the ceiling takes --t-display
          here and nowhere else. design-system §7. */}
      <Meter
        daily={state.daily}
        remaining={state.remaining}
        perTx={state.perTx}
        decimals={DECIMALS}
        symbol={SYMBOL}
        balance={state.balance}
        paused={state.paused}
        loading={state.isLoading}
        dominant
      />

      <div className={`${PAGE} py-6`}>
        <LimitsDrawer
          account={address}
          token={TOKEN}
          decimals={DECIMALS}
          symbol={SYMBOL}
          perTx={state.perTx}
          daily={state.daily}
          isOwner={isOwner}
          loading={state.isLoading}
          onSaved={state.refetch}
        />
        {operator && isValidAddress(operator) && (
          <AgentPanel
            account={address} operator={operator} token={TOKEN}
            decimals={DECIMALS} symbol={SYMBOL} isOwner={isOwner}
            onRefuelled={state.refetch}
          />
        )}
        {!operator && operatorCheckFailed && (
          <Label className="block mt-2" style={{ color: 'var(--bad)' }}>
            Could not verify the agent wallet — still trying.
          </Label>
        )}
        <Feed
          account={address}
          rows={feed.rows}
          decimals={DECIMALS}
          symbol={SYMBOL}
          isLoading={feed.isLoading}
          head={feed.head}
          hasPolicy={state.isLoading ? null : state.daily > 0n}
          error={feed.error}
        />
      </div>
    </main>
  )
}
