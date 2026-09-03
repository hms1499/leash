'use client'

import { use, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import LimitsDrawer from '../../../components/LimitsDrawer'
import StopButton from '../../../components/StopButton'
import AgentPanel from '../../../components/AgentPanel'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress, truncateAddress } from '../../../lib/address.js'
import { canEdit } from '../../../lib/policy.js'

// USDC on Celo mainnet. The token the policy is denominated in; the UI treats
// stablecoins as 1:1 with the dollar, and that assumption lives here in the UI
// and never in the contract.
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const SYMBOL = 'USDC'

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
  const [operator, setOperator] = useState<string | null>(null)
  useEffect(() => {
    const fromFeed = feed.rows.find((r) => r.kind === 'spent' || r.kind === 'toppedUp')
    setOperator(
      fromFeed?.operator
        ?? new URLSearchParams(window.location.search).get('operator'),
    )
  }, [feed.rows])

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
          <StopButton
            account={address}
            paused={state.paused}
            isOwner={isOwner}
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
          onSaved={state.refetch}
        />
        {operator && isValidAddress(operator) && (
          <AgentPanel
            account={address} operator={operator} token={TOKEN}
            decimals={DECIMALS} symbol={SYMBOL} isOwner={isOwner}
            onRefuelled={state.refetch}
          />
        )}
        <Feed
          rows={feed.rows}
          decimals={DECIMALS}
          symbol={SYMBOL}
          isLoading={feed.isLoading}
          hasPolicy={state.daily > 0n}
          error={feed.error}
        />
      </div>
    </main>
  )
}
