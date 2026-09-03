'use client'

import { use } from 'react'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress, truncateAddress } from '../../../lib/address.js'

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
        <span className="ml-auto"><ConnectButton /></span>
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
        <Feed
          rows={feed.rows}
          decimals={DECIMALS}
          symbol={SYMBOL}
          isLoading={feed.isLoading}
          hasPolicy={state.daily > 0n}
        />
      </div>
    </main>
  )
}
