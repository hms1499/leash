'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDeployContract, useWriteContract } from 'wagmi'
import { KNOWN_FEE_ADAPTERS, FEE_CURRENCY_DIRECTORY } from '@leash/sdk'
import ConnectButton from '../../components/ConnectButton'
import NetworkBadge from '../../components/NetworkBadge'
import Address from '../../components/ui/Address'
import Panel from '../../components/ui/Panel'
import Label from '../../components/ui/Label'
import { PROSE } from '../../components/ui/prose'
import Button from '../../components/ui/Button'
import McpHandoff from '../../components/McpHandoff'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK, DEPLOY_GAS } from '../../lib/chain.js'
import { isValidAddress } from '../../lib/address.js'
import { formatAmount, validateLimits } from '../../lib/policy.js'
import { isAttributionTag } from '../../lib/mcpJson.js'
import { pollUntil } from '../../lib/confirm.js'
import { PAGE } from '../../components/ui/page'
import {
  announceAccountRegistryChange,
  migrateLegacyAccount,
  savePolicyAccount,
  selectPolicyAccount,
} from '../../lib/accountRegistry.js'

/**
 * A wizard's job is to say where you are. Every step was a Label -- the same
 * 11px treatment as the field labels inside it -- and completed steps stay on
 * screen, so six identical headings competed for attention.
 * docs/design-system.md §7.
 */
const STEP_HEADING: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-heading)',
  lineHeight: 'var(--t-heading-line)',
  fontWeight: 500,
  color: 'var(--text)',
  display: 'block',
}

/** A finished step recedes: it is context now, not the thing to do. */
const STEP_HEADING_DONE: React.CSSProperties = {
  ...STEP_HEADING,
  fontSize: 'var(--t-data)',
  color: 'var(--dim)',
}

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
  { type: 'function', name: 'setAllowlist', stateMutability: 'nonpayable',
    inputs: [{ name: 'payee', type: 'address' }, { name: 'allowed', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'payeeAllowlist', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setAllowlistEnabled', stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'allowlistEnabled', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
] as const

export default function Onboard() {
  const { address: connected, isConnected, chainId } = useAccount()
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [agent, setAgent] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentNote, setAgentNote] = useState<string | null>(null)
  const [perTx, setPerTx] = useState('0.50')
  const [daily, setDaily] = useState('5.00')
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsNote, setLimitsNote] = useState<string | null>(null)
  const [recipient, setRecipient] = useState('')
  const [recipientBusy, setRecipientBusy] = useState(false)
  const [recipientNote, setRecipientNote] = useState<string | null>(null)
  const [tag, setTag] = useState('')
  const [feeAdapter, setFeeAdapter] = useState<`0x${string}` | null>(null)
  const [funded, setFunded] = useState(false)
  const [checkingFunds, setCheckingFunds] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tagStatus: 'ok' | 'missing' | 'invalid' =
    !tag.trim() ? 'missing' : isAttributionTag(tag.trim()) ? 'ok' : 'invalid'

  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  // Offer the previously deployed account rather than making the user
  // remember an address they were shown once — but only to the wallet that
  // deployed it. A different wallet on the same browser gets no account and
  // no way to mistake someone else's contract for its own.
  useEffect(() => {
    if (!connected) { setAccount(null); return }
    const accounts = migrateLegacyAccount(localStorage, connected)
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setAccount(null)
      return
    }
    const savedAddr = localStorage.getItem('leash.account')
    const savedOwner = localStorage.getItem('leash.accountOwner')
    if (
      savedAddr && isValidAddress(savedAddr) &&
      savedOwner && savedOwner.toLowerCase() === connected.toLowerCase()
    ) {
      setAccount(savedAddr)
    } else if (accounts[0]) setAccount(accounts[0].address)
    else setAccount(null)
  }, [connected])

  // Resume an interrupted setup from chain state. Local storage supplies only
  // the candidate agent and the user's explicit recipient choice; every
  // permission and balance is verified again before a step is marked done.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    void (async () => {
      try {
        const [limits, balance, listEnabled] = await Promise.all([
          publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'limits', args: [TOKEN],
          }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
          publicClient.readContract({
            address: TOKEN,
            abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
                    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
            functionName: 'balanceOf', args: [account],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'allowlistEnabled',
          }) as Promise<boolean>,
        ])
        if (cancelled) return
        if (limits[1] > 0n) {
          setPerTx(formatAmount(limits[0], DECIMALS, 2))
          setDaily(formatAmount(limits[1], DECIMALS, 2))
          setLimitsNote('Limits saved.')
        }
        setFunded(balance > 0n)

        const choice = localStorage.getItem(`leash.recipientMode.${account.toLowerCase()}`)
        if (listEnabled) setRecipientNote('Recipient protection enabled.')
        else if (choice === 'any') setRecipientNote('Any recipient selected.')

        const savedAgent = localStorage.getItem(`leash.agent.${account.toLowerCase()}`)
        if (savedAgent && isValidAddress(savedAgent)) {
          const active = await publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'operators', args: [savedAgent],
          }) as boolean
          if (!cancelled && active) {
            setAgent(savedAgent)
            setAgentNote('Agent added.')
          }
        }

        const savedTag = localStorage.getItem(`leash.tag.${account.toLowerCase()}`)
        if (!cancelled && savedTag) setTag(savedTag)
      } catch {
        // Resuming is a convenience. Individual actions still perform their
        // own reads and surface errors if this best-effort restore cannot run.
      }
    })()
    return () => { cancelled = true }
  }, [account])

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
    // A deployment signed on another chain spends real gas putting the
    // contract somewhere this app will never read, and the receipt wait below
    // — pinned to Celo — would then report it as merely unconfirmed.
    if (chainId !== REQUIRED_CHAIN_ID) { setError(WRONG_NETWORK); return }
    setDeploying(true)
    try {
      // SpendPolicyAccount's ABI and bytecode are emitted by `forge build`
      // into contracts/out. Task 6 Step 7 copies them into app/lib/contract.ts.
      const { abi, bytecode } = await import('../../lib/contract.js')
      let hash: `0x${string}`
      try {
        hash = await deployContractAsync({
          abi, bytecode, args: [connected!], chainId: REQUIRED_CHAIN_ID,
          // Without this the request reaches the wallet carrying only `data`
          // and `from`, and a wallet whose own estimator fails then has
          // nothing to fall back on -- OKX showed a fee of `--` and would not
          // let the deployment be confirmed. See DEPLOY_GAS.
          gas: DEPLOY_GAS,
        })
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
        savePolicyAccount(localStorage, connected!, {
          address: receipt.contractAddress,
          deployBlock: receipt.blockNumber.toString(),
          // This exact artifact was just deployed with `connected` as its
          // constructor owner, so it has the same assurance as a read-back.
          verifiedAt: Date.now(),
        })
        selectPolicyAccount(localStorage, connected!, receipt.contractAddress)
        announceAccountRegistryChange()
        // `?new=1` is an entry instruction, not durable setup state. Leaving
        // it in the URL would hide this freshly deployed account if the owner
        // disconnected and reconnected during the remaining steps.
        window.history.replaceState(null, '', '/setup')
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
    if (connected && agent.toLowerCase() === connected.toLowerCase()) {
      setError('Use a separate agent wallet. The owner wallet should not also be the agent.')
      return
    }
    if (chainId !== REQUIRED_CHAIN_ID) { setAgentNote(WRONG_NETWORK); return }
    setAgentBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setOperator',
        args: [agent, true], chainId: REQUIRED_CHAIN_ID,
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'operators', args: [agent],
        }),
      ))
      setAgentNote(confirmed
        ? 'Agent added.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      if (confirmed) localStorage.setItem(`leash.agent.${account!.toLowerCase()}`, agent)
    } catch {
      setAgentNote('The transaction was not sent.')
    } finally {
      setAgentBusy(false)
    }
  }

  async function setLimits() {
    setError(null)
    setLimitsNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setLimitsNote(WRONG_NETWORK); return }
    const parsed = validateLimits(perTx, daily, DECIMALS)
    if (!parsed.ok) { setError(parsed.error); return }
    const { perTx: nextPerTx, daily: nextDaily } = parsed
    setLimitsBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setPolicy',
        args: [TOKEN, nextPerTx, nextDaily], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => {
        const l = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'limits', args: [TOKEN],
        }) as readonly [bigint, bigint, bigint, bigint]
        return l[0] === nextPerTx && l[1] === nextDaily
      })
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

  async function allowAnyRecipient() {
    setRecipientNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setRecipientNote(WRONG_NETWORK); return }
    setRecipientBusy(true)
    try {
      const currentlyEnabled = await publicClient.readContract({
        address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled',
      }) as boolean
      if (!currentlyEnabled) {
        setRecipientNote('Any recipient selected.')
        localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'any')
        return
      }
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setAllowlistEnabled',
        args: [false], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => !Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled',
        }),
      ))
      setRecipientNote(confirmed
        ? 'Any recipient selected.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      if (confirmed) localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'any')
    } catch {
      setRecipientNote('The transaction was not sent.')
    } finally {
      setRecipientBusy(false)
    }
  }

  async function protectRecipient() {
    setRecipientNote(null)
    if (!isValidAddress(recipient)) { setRecipientNote('Enter a valid recipient address.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setRecipientNote(WRONG_NETWORK); return }
    setRecipientBusy(true)
    try {
      // The mapping must contain a recipient before protection is enabled;
      // enabling an empty list would make every direct payment fail.
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setAllowlist',
        args: [recipient, true], chainId: REQUIRED_CHAIN_ID,
      })
      const recipientConfirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'payeeAllowlist', args: [recipient],
        }),
      ))
      if (!recipientConfirmed) {
        setRecipientNote('Recipient approval was sent but has not been confirmed. Do not enable protection yet.')
        return
      }
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setAllowlistEnabled',
        args: [true], chainId: REQUIRED_CHAIN_ID,
      })
      const enabled = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled',
        }),
      ))
      setRecipientNote(enabled
        ? 'Recipient protection enabled.'
        : 'The recipient is approved, but protection has not been confirmed yet.')
      if (enabled) localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'protected')
    } catch {
      setRecipientNote('The requested policy change was not completed.')
    } finally {
      setRecipientBusy(false)
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
    <main className={`${PAGE} py-12 space-y-6`}>
      <h1 style={{
        fontFamily: 'var(--mono)',
        fontSize: 'var(--t-title)',
        lineHeight: 'var(--t-title-line)',
        color: 'var(--celo)',
        letterSpacing: '.26em',
      }}>
        LEASH
      </h1>
      <p style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>
        Give an AI agent a wallet without trusting it. Spend limits are enforced
        on Celo, not by a prompt.
      </p>

      <Panel as="section" className="p-6">
        <h2 style={STEP_HEADING}>Before you start</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
          Setup takes about 5–10 minutes. Keep these ready before you create the account.
        </p>
        <ul className="text-sm mt-3 space-y-2" style={{ color: 'var(--text)' }}>
          <li>✓ An owner wallet connected to Celo, with a little CELO for deployment gas</li>
          <li>✓ USDC on Celo to fund the protected account</li>
          <li>✓ A separate wallet address used by your AI agent</li>
          <li>✓ Your Celo attribution tag for the MCP configuration</li>
        </ul>
      </Panel>

      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <Panel as="section" className="p-6">
        <div className="flex items-center justify-between">
          <h2 style={isConnected ? STEP_HEADING_DONE : STEP_HEADING}>
            {isConnected ? '✓ ' : ''}Step 1 — Connect
          </h2>
          <NetworkBadge />
        </div>
        <div className="mt-2"><ConnectButton /></div>
      </Panel>

      {isConnected && (
        <Panel as="section" className="p-6">
          <h2 style={Boolean(account) ? STEP_HEADING_DONE : STEP_HEADING}>
            {Boolean(account) ? '✓ ' : ''}Step 2 — Deploy your account
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            You own it. Costs about $0.013 in gas.
          </p>
          {account
            ? (
              <div className="mt-2">
                <Address address={account} copy full className="num" />
              </div>
            )
            : (
              <Button variant="primary" className="mt-2" disabled={deploying} onClick={() => void deploy()}>
                {deploying ? 'Deploying…' : 'Deploy'}
              </Button>
            )}
        </Panel>
      )}

      {account && (
        <>
          <Panel as="section" className="p-6">
            <h2 style={limitsNote === 'Limits saved.' ? STEP_HEADING_DONE : STEP_HEADING}>
              {limitsNote === 'Limits saved.' ? '✓ ' : ''}Step 3 — Set spending limits
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              The daily limit is the total budget until 00:00 UTC. The maximum
              payment is the most one direct payment may send.
            </p>
            <Label className="block mt-3">Maximum direct payment (USDC)</Label>
            <input className="num field w-full mt-2 p-2"
              aria-label="Maximum direct payment in USDC"
              value={perTx} onChange={(e) => setPerTx(e.target.value)} disabled={limitsBusy} />
            <Label className="block mt-3">Daily limit (USDC)</Label>
            <input className="num field w-full mt-2 p-2"
              aria-label="Daily spending limit in USDC"
              value={daily} onChange={(e) => setDaily(e.target.value)} disabled={limitsBusy} />
            <Button variant="primary" className="mt-2" disabled={limitsBusy} onClick={() => void setLimits()}>
              {limitsBusy ? 'Saving…' : 'Save limits'}
            </Button>
            {limitsNote && (
              <p className="text-sm mt-2" style={{ color: limitsNote === 'Limits saved.' ? 'var(--ok)' : 'var(--bad)' }}>
                {limitsNote}
              </p>
            )}
          </Panel>

          <Panel as="section" className="p-6">
            <h2 style={agentNote === 'Agent added.' ? STEP_HEADING_DONE : STEP_HEADING}>
              {agentNote === 'Agent added.' ? '✓ ' : ''}Step 4 — Add your agent
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Use a separate wallet controlled by your AI agent. It may request
              payments, but it cannot change limits, stop the account or withdraw everything.
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
              For x402 attribution, this must match the agentWalletAddress registered with Celo Builders.
            </p>
            <Label className="block mt-3">Agent wallet address</Label>
            <input
              className="num field w-full mt-2 p-2"
              aria-label="Agent wallet address"
              placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)}
              disabled={agentBusy}
            />
            <Button variant="primary" className="mt-2" disabled={agentBusy} onClick={() => void addAgent()}>
              {agentBusy ? 'Adding…' : 'Add agent'}
            </Button>
            {agentNote && (
              <p role="status" className="text-sm mt-2" style={{ color: agentNote === 'Agent added.' ? 'var(--ok)' : 'var(--bad)' }}>
                {agentNote}
              </p>
            )}
          </Panel>

          <Panel as="section" className="p-6">
            <h2 style={recipientNote === 'Recipient protection enabled.' || recipientNote === 'Any recipient selected.'
              ? STEP_HEADING_DONE : STEP_HEADING}>
              {(recipientNote === 'Recipient protection enabled.' || recipientNote === 'Any recipient selected.') ? '✓ ' : ''}
              Step 5 — Choose recipient protection
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Direct payments can be restricted to approved addresses. This does
              not restrict funds after they move to the agent wallet for gas or x402.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" disabled={recipientBusy} onClick={() => void allowAnyRecipient()}>
                Any recipient
              </Button>
            </div>
            <Label className="block mt-4">Approved recipient address — safer</Label>
            <input
              className="num field w-full mt-2 p-2"
              aria-label="Approved recipient address"
              placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)}
              disabled={recipientBusy}
            />
            <Button variant="primary" className="mt-2" disabled={recipientBusy} onClick={() => void protectRecipient()}>
              {recipientBusy ? 'Saving protection…' : 'Approve and turn on protection'}
            </Button>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              The safer option requires two wallet confirmations: approve the address, then turn protection on.
            </p>
            {recipientNote && (
              <p role="status" className="text-sm mt-2" style={{
                color: recipientNote === 'Recipient protection enabled.' || recipientNote === 'Any recipient selected.'
                  ? 'var(--ok)' : 'var(--bad)',
              }}>
                {recipientNote}
              </p>
            )}
          </Panel>

          <Panel as="section" className="p-6">
            <h2 style={funded ? STEP_HEADING_DONE : STEP_HEADING}>
              {funded ? '✓ ' : ''}Step 6 — Add protected funds
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Send USDC on Celo to <Address address={account} copy full className="num" />.
              These funds remain protected by the limits above. Do not send native CELO.
            </p>
            <Button variant="ghost" className="mt-2" disabled={checkingFunds} onClick={() => void waitForFunding()}>
              {funded ? 'Funded' : checkingFunds ? 'Checking…' : 'Check balance'}
            </Button>
          </Panel>

          {feeAdapter && (
            <section>
              <h2 className="mb-2" style={STEP_HEADING}>Step 7 — Connect your agent</h2>
              <Label className="block">Attribution tag</Label>
              <p className="text-sm mt-2 mb-2" style={{ color: 'var(--dim)' }}>
                <code>celo_</code> plus 12 hex characters. It is issued when you
                register your project on{' '}
                <a
                  href="https://celobuilders.xyz"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--celo)' }}
                >
                  celobuilders.xyz
                </a>{' '}
                and comes back as <code>attributionTag</code> — the same value
                you can re-read any time from{' '}
                <code>GET /submissions/me</code>. Every transaction your agent
                sends carries it; there is no untagged path.
              </p>
              <input
                className="num field w-full mb-2 p-2"
                aria-label="Celo attribution tag"
                aria-invalid={tagStatus === 'invalid'}
                placeholder="celo_0123456789ab"
                value={tag} onChange={(e) => {
                  setTag(e.target.value)
                  localStorage.setItem(`leash.tag.${account.toLowerCase()}`, e.target.value)
                }}
              />
              <p className="text-sm mb-3" style={{ color: 'var(--bad)', minHeight: '1rem' }}>
                {tagStatus === 'invalid' && 'Not a valid tag — expected celo_ and 12 hex characters.'}
              </p>
              <McpHandoff
                handoff={{
                  account, token: TOKEN, feeAdapter,
                  // Never emit a value the server will refuse. A placeholder
                  // the user can see is better than a config that dies at
                  // startup with the reason buried in an agent's log.
                  // buildMcpJson substitutes the placeholder itself, from the
                  // tag's shape — see displayTag. Doing it here too is how the
                  // landing page came to do it nowhere.
                  attributionTag: tag.trim(),
                }}
                tagStatus={tagStatus}
              />
              <Panel as="section" className="p-6 mt-6">
                <h2 style={STEP_HEADING}>Step 8 — Verify setup</h2>
                <ul className="text-sm mt-3 space-y-2">
                  <li>{account ? '✓' : '○'} Policy account created</li>
                  <li>{limitsNote === 'Limits saved.' ? '✓' : '○'} Spending limits confirmed</li>
                  <li>{agentNote === 'Agent added.' ? '✓' : '○'} Agent access confirmed</li>
                  <li>{recipientNote === 'Recipient protection enabled.' || recipientNote === 'Any recipient selected.' ? '✓' : '○'} Recipient policy selected</li>
                  <li>{funded ? '✓' : '○'} Protected funds detected</li>
                  <li>{tagStatus === 'ok' ? '✓' : '○'} MCP configuration ready</li>
                </ul>
                <a
                  className="inline-block rounded px-4 py-2 mt-4"
                  href={`/a/${account}`}
                  style={{
                    background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700,
                    fontFamily: 'var(--mono)', fontSize: 'var(--t-data)',
                  }}
                >
                  Open dashboard
                </a>
              </Panel>
            </section>
          )}
        </>
      )}
    </main>
  )
}
