'use client'

import { use, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import NetworkBadge from '../../../components/NetworkBadge'
import LimitsDrawer from '../../../components/LimitsDrawer'
import StopButton from '../../../components/StopButton'
import AgentPanel from '../../../components/AgentPanel'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress, truncateAddress } from '../../../lib/address.js'
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
    return <main className="p-6"><p>That is not a Celo address.</p></main>
  }
  return <Dashboard address={address} />
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const state = useAccountState(address, TOKEN)
  const feed = useFeed(address)
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
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const fromFeed = feed.rows.find((r) => r.kind === 'spent' || r.kind === 'toppedUp')?.operator
      const fromQuery = new URLSearchParams(window.location.search).get('operator')
      const candidate = fromFeed ?? fromQuery
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
  }, [feed.rows, address])

  return (
    <main>
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: state.paused ? 'var(--bad)' : 'var(--panel)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <strong style={{ color: state.paused ? 'var(--text)' : 'var(--celo)', letterSpacing: '.26em' }}>
          LEASH
        </strong>
        <a
          className="label"
          href={`https://celoscan.io/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          {truncateAddress(address)}
        </a>
        <span className="ml-auto flex items-center gap-3">
          <NetworkBadge />
          <StopButton
            account={address}
            paused={state.paused}
            isOwner={isOwner}
            loading={state.isLoading}
            onChanged={state.refetch}
          />
          <ConnectButton />
        </span>
      </header>

      <Meter
        daily={state.daily}
        remaining={state.remaining}
        perTx={state.perTx}
        decimals={DECIMALS}
        symbol={SYMBOL}
        paused={state.paused}
        loading={state.isLoading}
      />

      <div className="p-4">
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
          <p className="label mt-2" style={{ color: 'var(--bad)' }}>
            Could not verify the agent wallet. Reload to try again.
          </p>
        )}
        <Feed
          account={address}
          rows={feed.rows}
          decimals={DECIMALS}
          symbol={SYMBOL}
          isLoading={feed.isLoading}
          hasPolicy={state.isLoading ? null : state.daily > 0n}
          error={feed.error}
        />
      </div>
    </main>
  )
}
