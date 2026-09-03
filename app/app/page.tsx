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
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' },
             { name: 'perTx', type: 'uint256' },
             { name: 'daily', type: 'uint256' }],
    outputs: [] },
  { type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' }, { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' }, { name: 'day', type: 'uint64' }] },
] as const

export default function Onboard() {
  const { address: connected, isConnected } = useAccount()
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [agent, setAgent] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentNote, setAgentNote] = useState<string | null>(null)
  const [perTx, setPerTx] = useState('0.50')
  const [daily, setDaily] = useState('5.00')
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsNote, setLimitsNote] = useState<string | null>(null)
  const [tag, setTag] = useState('')
  const [feeAdapter, setFeeAdapter] = useState<`0x${string}` | null>(null)
  const [funded, setFunded] = useState(false)
  const [checkingFunds, setCheckingFunds] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  // Offer the previously deployed account rather than making the user
  // remember an address they were shown once — but only to the wallet that
  // deployed it. A different wallet on the same browser gets no account and
  // no way to mistake someone else's contract for its own.
  useEffect(() => {
    if (!connected) { setAccount(null); return }
    const savedAddr = localStorage.getItem('leash.account')
    const savedOwner = localStorage.getItem('leash.accountOwner')
    if (
      savedAddr && isValidAddress(savedAddr) &&
      savedOwner && savedOwner.toLowerCase() === connected.toLowerCase()
    ) {
      setAccount(savedAddr)
    } else {
      setAccount(null)
    }
  }, [connected])

  // Never trust a fee adapter from memory: assert this one is on the
  // directory's live whitelist before putting it in someone's config.
  useEffect(() => {
    void (async () => {
      try {
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
      } catch {
        // A transient forno failure here must not read as "not whitelisted" —
        // those are different problems with different fixes.
        setError('Could not check the fee-adapter whitelist against the chain. Check your connection and reload to try again.')
      }
    })()
  }, [])

  async function deploy() {
    setError(null)
    setDeploying(true)
    try {
      // SpendPolicyAccount's ABI and bytecode are emitted by `forge build`
      // into contracts/out. Task 6 Step 7 copies them into app/lib/contract.ts.
      const { abi, bytecode } = await import('../lib/contract.js')
      let hash: `0x${string}`
      try {
        hash = await deployContractAsync({ abi, bytecode, args: [connected!] })
      } catch {
        // Almost always the user rejecting in their wallet. Silence here
        // reads as a broken button, and this step spends real gas.
        setError('The deployment was not sent.')
        return
      }
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (!receipt.contractAddress) {
          setError(`Sent as ${hash}, but the receipt carried no contract address. Check that transaction before deploying again.`)
          return
        }
        setAccount(receipt.contractAddress)
        localStorage.setItem('leash.account', receipt.contractAddress)
        localStorage.setItem('leash.accountOwner', connected!)
        localStorage.setItem('leash.deployBlock', receipt.blockNumber.toString())
      } catch {
        // forno is load-balanced and this is the likeliest failure right
        // after a transaction. The transaction may still land — never tell
        // the user to pay for a second deployment while the first is still
        // in flight.
        setError(`Sent as ${hash}. The chain has not confirmed it yet — check that transaction before deploying again; do not deploy a second time until you know this one failed.`)
      }
    } catch {
      // Only reachable if the contract artifact itself failed to load —
      // nothing was sent, so it is safe to say so plainly.
      setError('The deployment did not start. Reload and try again.')
    } finally {
      setDeploying(false)
    }
  }

  async function addAgent() {
    setError(null)
    setAgentNote(null)
    if (!isValidAddress(agent)) { setError('That is not a Celo address.'); return }
    setAgentBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setOperator', args: [agent, true],
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        const enabled = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'operators', args: [agent],
        })
        if (enabled) { confirmed = true; break }
        await new Promise((r) => setTimeout(r, 3000))
      }
      setAgentNote(confirmed
        ? 'Agent added.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      setAgentNote('The transaction was not sent.')
    } finally {
      setAgentBusy(false)
    }
  }

  async function setLimits() {
    setError(null)
    setLimitsNote(null)
    let nextPerTx: bigint
    let nextDaily: bigint
    try {
      nextPerTx = parseAmount(perTx, DECIMALS)
      nextDaily = parseAmount(daily, DECIMALS)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    setLimitsBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setPolicy',
        args: [TOKEN, nextPerTx, nextDaily],
      })
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        const l = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'limits', args: [TOKEN],
        }) as readonly [bigint, bigint, bigint, bigint]
        if (l[0] === nextPerTx && l[1] === nextDaily) { confirmed = true; break }
        await new Promise((r) => setTimeout(r, 3000))
      }
      setLimitsNote(confirmed
        ? 'Limits saved.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      // Almost always the user rejecting in their wallet. A raw viem error
      // string does not belong in front of a stranger.
      setLimitsNote('The transaction was not sent.')
    } finally {
      setLimitsBusy(false)
    }
  }

  // Wait on the balance, not on a receipt someone else's wallet produced.
  async function waitForFunding() {
    setError(null)
    setCheckingFunds(true)
    let sawAnySuccess = false
    try {
      for (let i = 0; i < 60; i++) {
        try {
          const bal = await publicClient.readContract({
            address: TOKEN,
            abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
                    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
            functionName: 'balanceOf', args: [account!],
          }) as bigint
          sawAnySuccess = true
          if (bal > 0n) { setFunded(true); return }
        } catch {
          // A single failed forno call must not end the whole five-minute
          // wait — keep polling past a transient read failure.
        }
        await new Promise((r) => setTimeout(r, 5000))
      }
      setError(sawAnySuccess
        ? 'No balance seen after five minutes. Check the transfer and try again.'
        : 'Could not reach the chain to check your balance. Check your connection and try again.')
    } finally {
      setCheckingFunds(false)
    }
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
            : (
              <button className="btn-primary mt-2" disabled={deploying} onClick={() => void deploy()}>
                {deploying ? 'Deploying…' : 'Deploy'}
              </button>
            )}
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
              disabled={agentBusy}
            />
            <button className="btn-primary mt-2" disabled={agentBusy} onClick={() => void addAgent()}>
              {agentBusy ? 'Adding…' : 'Add agent'}
            </button>
            {agentNote && (
              <p className="text-sm mt-2" style={{ color: agentNote === 'Agent added.' ? 'var(--ok)' : 'var(--bad)' }}>
                {agentNote}
              </p>
            )}
          </section>

          <section className="panel p-4">
            <p className="label">Step 4 — Set limits (USDC)</p>
            <p className="label mt-2">Per transaction</p>
            <input className="num w-full mt-1 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={perTx} onChange={(e) => setPerTx(e.target.value)} disabled={limitsBusy} />
            <p className="label mt-2">Per day</p>
            <input className="num w-full mt-1 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={daily} onChange={(e) => setDaily(e.target.value)} disabled={limitsBusy} />
            <button className="btn-primary mt-2" disabled={limitsBusy} onClick={() => void setLimits()}>
              {limitsBusy ? 'Saving…' : 'Save limits'}
            </button>
            {limitsNote && (
              <p className="text-sm mt-2" style={{ color: limitsNote === 'Limits saved.' ? 'var(--ok)' : 'var(--bad)' }}>
                {limitsNote}
              </p>
            )}
          </section>

          <section className="panel p-4">
            <p className="label">Step 5 — Fund it</p>
            <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
              Send USDC to <span className="num">{account}</span>. Send USDC, not
              CELO — this contract refuses native value on purpose.
            </p>
            <button className="btn-ghost mt-2" disabled={checkingFunds} onClick={() => void waitForFunding()}>
              {funded ? 'Funded' : checkingFunds ? 'Checking…' : 'Check balance'}
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
              <McpHandoff
                handoff={{ account, token: TOKEN, feeAdapter, attributionTag: tag || 'celo_yourtag' }}
                tagMissing={!tag.trim()}
              />
              <a className="label block mt-3" href={`/a/${account}`}>Open your dashboard →</a>
            </section>
          )}
        </>
      )}
    </main>
  )
}
