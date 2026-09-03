'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDeployContract, useWriteContract } from 'wagmi'
import { KNOWN_FEE_ADAPTERS, FEE_CURRENCY_DIRECTORY } from '@leash/sdk'
import ConnectButton from '../components/ConnectButton'
import McpHandoff from '../components/McpHandoff'
import { publicClient } from '../lib/chain.js'
import { isValidAddress } from '../lib/address.js'
import { parseAmount } from '../lib/policy.js'

const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const USDC_FEE_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const
const DECIMALS = 6

const DIRECTORY_ABI = [
  { type: 'function', name: 'getCurrencies', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address[]' }] },
] as const

const SETUP_ABI = [
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }],
    outputs: [] },
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' },
             { name: 'perTx', type: 'uint256' },
             { name: 'daily', type: 'uint256' }],
    outputs: [] },
] as const

export default function Onboard() {
  const { address: connected, isConnected } = useAccount()
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [agent, setAgent] = useState('')
  const [perTx, setPerTx] = useState('0.50')
  const [daily, setDaily] = useState('5.00')
  const [tag, setTag] = useState('')
  const [feeAdapter, setFeeAdapter] = useState<`0x${string}` | null>(null)
  const [funded, setFunded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  // Offer the previously deployed account rather than making the user
  // remember an address they were shown once.
  useEffect(() => {
    const saved = localStorage.getItem('leash.account')
    if (saved && isValidAddress(saved)) setAccount(saved)
  }, [])

  // Never trust a fee adapter from memory: assert this one is on the
  // directory's live whitelist before putting it in someone's config.
  useEffect(() => {
    void (async () => {
      const live = await publicClient.readContract({
        address: FEE_CURRENCY_DIRECTORY, abi: DIRECTORY_ABI,
        functionName: 'getCurrencies',
      }) as readonly `0x${string}`[]
      const ok =
        live.some((a) => a.toLowerCase() === USDC_FEE_ADAPTER.toLowerCase()) &&
        (KNOWN_FEE_ADAPTERS as readonly string[])
          .some((a) => a.toLowerCase() === USDC_FEE_ADAPTER.toLowerCase())
      if (ok) setFeeAdapter(USDC_FEE_ADAPTER)
      else setError('The USDC fee adapter is not on the on-chain whitelist. Stop and re-run spikes/fee-currency.ts.')
    })()
  }, [])

  async function deploy() {
    setError(null)
    // SpendPolicyAccount's ABI and bytecode are emitted by `forge build` into
    // contracts/out. Task 6 Step 7 copies them into app/lib/contract.ts.
    const { abi, bytecode } = await import('../lib/contract.js')
    const hash = await deployContractAsync({ abi, bytecode, args: [connected!] })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) { setError('Deployment produced no address.'); return }
    setAccount(receipt.contractAddress)
    localStorage.setItem('leash.account', receipt.contractAddress)
    localStorage.setItem('leash.deployBlock', receipt.blockNumber.toString())
  }

  async function addAgent() {
    setError(null)
    if (!isValidAddress(agent)) { setError('That is not a Celo address.'); return }
    await writeContractAsync({
      address: account!, abi: SETUP_ABI, functionName: 'setOperator', args: [agent, true],
    })
  }

  async function setLimits() {
    setError(null)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setPolicy',
        args: [TOKEN, parseAmount(perTx, DECIMALS), parseAmount(daily, DECIMALS)],
      })
    } catch (e) { setError((e as Error).message) }
  }

  // Wait on the balance, not on a receipt someone else's wallet produced.
  async function waitForFunding() {
    for (let i = 0; i < 60; i++) {
      const bal = await publicClient.readContract({
        address: TOKEN,
        abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
                inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf', args: [account!],
      }) as bigint
      if (bal > 0n) { setFunded(true); return }
      await new Promise((r) => setTimeout(r, 5000))
    }
    setError('No balance seen after five minutes. Check the transfer and try again.')
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 style={{ color: 'var(--celo)', letterSpacing: '.26em' }}>LEASH</h1>
      <p style={{ color: 'var(--dim)' }}>
        Give an AI agent a wallet without trusting it. Spend limits are enforced
        on Celo, not by a prompt.
      </p>

      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <section className="panel p-4">
        <p className="label">Step 1 — Connect</p>
        <div className="mt-2"><ConnectButton /></div>
      </section>

      {isConnected && (
        <section className="panel p-4">
          <p className="label">Step 2 — Deploy your account</p>
          <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
            You own it. Costs about $0.013 in gas.
          </p>
          {account
            ? <p className="num mt-2">{account}</p>
            : <button className="btn-primary mt-2" onClick={() => void deploy()}>Deploy</button>}
        </section>
      )}

      {account && (
        <>
          <section className="panel p-4">
            <p className="label">Step 3 — Add your agent</p>
            <p className="text-sm mt-1" style={{ color: 'var(--bad)' }}>
              This must be the wallet you registered as your agentWalletAddress.
              A different address silently voids your x402 attribution — nothing
              errors, the leaderboard simply reads zero.
            </p>
            <input
              className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)}
            />
            <button className="btn-primary mt-2" onClick={() => void addAgent()}>Add agent</button>
          </section>

          <section className="panel p-4">
            <p className="label">Step 4 — Set limits (USDC)</p>
            <input className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={perTx} onChange={(e) => setPerTx(e.target.value)} />
            <input className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={daily} onChange={(e) => setDaily(e.target.value)} />
            <button className="btn-primary mt-2" onClick={() => void setLimits()}>Save limits</button>
          </section>

          <section className="panel p-4">
            <p className="label">Step 5 — Fund it</p>
            <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
              Send USDC to <span className="num">{account}</span>. Send USDC, not
              CELO — this contract refuses native value on purpose.
            </p>
            <button className="btn-ghost mt-2" onClick={() => void waitForFunding()}>
              {funded ? 'Funded' : 'Check balance'}
            </button>
          </section>

          {feeAdapter && (
            <section>
              <p className="label mb-2">Step 6 — Connect your agent</p>
              <input
                className="num w-full mb-3 p-2"
                style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
                placeholder="celo_ your attribution tag"
                value={tag} onChange={(e) => setTag(e.target.value)}
              />
              <McpHandoff handoff={{ account, token: TOKEN, feeAdapter, attributionTag: tag || 'celo_yourtag' }} />
              <a className="label block mt-3" href={`/a/${account}`}>Open your dashboard →</a>
            </section>
          )}
        </>
      )}
    </main>
  )
}
