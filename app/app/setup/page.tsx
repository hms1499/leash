'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDeployContract, useWriteContract } from 'wagmi'
import ConnectButton from '../../components/ConnectButton'
import NetworkBadge from '../../components/NetworkBadge'
import Address from '../../components/ui/Address'
import ActionLink from '../../components/ui/ActionLink'
import BrandLink from '../../components/ui/BrandLink'
import Panel from '../../components/ui/Panel'
import Label from '../../components/ui/Label'
import { PROSE } from '../../components/ui/prose'
import Button from '../../components/ui/Button'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK, DEPLOY_GAS } from '../../lib/chain.js'
import { isValidAddress } from '../../lib/address.js'
import { formatAmount, parseAmount, validateLimits } from '../../lib/policy.js'
import { transactionsLeft } from '../../lib/gasFloat.js'
import { firstSetupStage, setupReadiness, type SetupStage } from '../../lib/setup.js'
import { pollUntil } from '../../lib/confirm.js'
import { PAGE } from '../../components/ui/page'
import {
  announceAccountRegistryChange, migrateLegacyAccount, savePolicyAccount, selectPolicyAccount,
} from '../../lib/accountRegistry.js'

const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const

const SETUP_ABI = [
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'perTx', type: 'uint256' },
             { name: 'daily', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'limits', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: 'perTx', type: 'uint256' }, { name: 'daily', type: 'uint256' },
              { name: 'spentToday', type: 'uint256' }, { name: 'day', type: 'uint64' }] },
  { type: 'function', name: 'setAllowlist', stateMutability: 'nonpayable',
    inputs: [{ name: 'payee', type: 'address' }, { name: 'allowed', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'payeeAllowlist', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setAllowlistEnabled', stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'allowlistEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const

const STEPS: ReadonlyArray<{ id: SetupStage; title: string; short: string }> = [
  { id: 1, title: 'Create account', short: 'Create' },
  { id: 2, title: 'Set protection', short: 'Protect' },
  { id: 3, title: 'Add & fund agent', short: 'Fund' },
  { id: 4, title: 'Review & finish', short: 'Review' },
]

const HEADING: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)', lineHeight: 'var(--t-heading-line)',
  fontWeight: 500, color: 'var(--text)',
}
const STATUS_BOX: React.CSSProperties = {
  background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 6,
}

type RecipientMode = 'any' | 'protected'
type ConfirmedLimits = { perTx: bigint; daily: bigint }
type FundingTarget = 'protected' | 'agent'

function noteColor(note: string | null, success: string): string {
  return note === success ? 'var(--ok)' : 'var(--bad)'
}

export default function Onboard() {
  const { address: connected, isConnected, chainId } = useAccount()
  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  const [activeStage, setActiveStage] = useState<SetupStage>(1)
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)

  const [perTx, setPerTx] = useState('0.50')
  const [daily, setDaily] = useState('5.00')
  const [confirmedLimits, setConfirmedLimits] = useState<ConfirmedLimits | null>(null)
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsNote, setLimitsNote] = useState<string | null>(null)

  const [recipientMode, setRecipientMode] = useState<RecipientMode>('any')
  const [recipientProtectionEnabled, setRecipientProtectionEnabled] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [recipientBusy, setRecipientBusy] = useState(false)
  const [recipientNote, setRecipientNote] = useState<string | null>(null)

  const [agent, setAgent] = useState('')
  const [agentAuthorized, setAgentAuthorized] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentNote, setAgentNote] = useState<string | null>(null)

  const [protectedBalance, setProtectedBalance] = useState<bigint | null>(null)
  const [agentBalance, setAgentBalance] = useState<bigint | null>(null)
  const [protectedAmount, setProtectedAmount] = useState('5.00')
  const [agentGasAmount, setAgentGasAmount] = useState('0.05')
  const [protectedFundNote, setProtectedFundNote] = useState<string | null>(null)
  const [agentFundNote, setAgentFundNote] = useState<string | null>(null)
  const [fundingTarget, setFundingTarget] = useState<FundingTarget | null>(null)
  const [checkingBalances, setCheckingBalances] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const limitsConfirmed = (() => {
    if (!confirmedLimits) return false
    try {
      return parseAmount(perTx, DECIMALS) === confirmedLimits.perTx &&
        parseAmount(daily, DECIMALS) === confirmedLimits.daily
    } catch { return false }
  })()
  const agentTransactionsLeft = agentBalance === null ? 0 : transactionsLeft(agentBalance)
  const readiness = setupReadiness({
    account, limitsConfirmed, agentAuthorized, protectedBalance, agentTransactionsLeft,
  })
  const recipientReady = recipientMode === 'any' ? !recipientProtectionEnabled : recipientProtectionEnabled

  function stageUnlocked(stage: SetupStage): boolean {
    if (stage === 1) return true
    if (stage === 2) return readiness.accountCreated
    if (stage === 3) return readiness.accountCreated && readiness.limitsConfirmed && recipientReady
    return readiness.ready
  }

  function stageDone(stage: SetupStage): boolean {
    if (stage === 1) return readiness.accountCreated
    if (stage === 2) return readiness.limitsConfirmed && recipientReady
    if (stage === 3) return readiness.ready
    return false
  }

  async function readBalance(address: `0x${string}`): Promise<bigint> {
    return publicClient.readContract({
      address: TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
    }) as Promise<bigint>
  }

  useEffect(() => {
    if (!connected) {
      setAccount(null)
      setActiveStage(1)
      return
    }
    const accounts = migrateLegacyAccount(localStorage, connected)
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setAccount(null)
      setActiveStage(1)
      return
    }
    const savedAddr = localStorage.getItem('leash.account')
    const savedOwner = localStorage.getItem('leash.accountOwner')
    if (savedAddr && isValidAddress(savedAddr) && savedOwner?.toLowerCase() === connected.toLowerCase()) {
      setAccount(savedAddr)
    } else if (accounts[0]) {
      setAccount(accounts[0].address)
    } else {
      setAccount(null)
      setActiveStage(1)
    }
  }, [connected])

  // Local storage supplies candidates; Celo state decides every completion tick.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    setRestoring(true)
    setRestoreNote(null)
    setConfirmedLimits(null)
    setAgent('')
    setAgentAuthorized(false)
    setProtectedBalance(null)
    setAgentBalance(null)
    setRecipient('')
    setRecipientMode('any')
    setRecipientProtectionEnabled(false)

    void (async () => {
      try {
        const [limits, policyBalance, listEnabled] = await Promise.all([
          publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'limits', args: [TOKEN],
          }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
          readBalance(account),
          publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'allowlistEnabled',
          }) as Promise<boolean>,
        ])
        if (cancelled) return
        const nextLimits = limits[0] > 0n && limits[1] > 0n
          ? { perTx: limits[0], daily: limits[1] }
          : null
        if (nextLimits) {
          setPerTx(formatAmount(nextLimits.perTx, DECIMALS, 2))
          setDaily(formatAmount(nextLimits.daily, DECIMALS, 2))
          setConfirmedLimits(nextLimits)
        }
        setProtectedBalance(policyBalance)
        setRecipientProtectionEnabled(listEnabled)
        setRecipientMode(listEnabled ? 'protected' : 'any')
        const savedRecipient = localStorage.getItem(`leash.recipient.${account.toLowerCase()}`)
        if (savedRecipient && isValidAddress(savedRecipient)) setRecipient(savedRecipient)

        let authorized = false
        let operatorBalance: bigint | null = null
        const savedAgent = localStorage.getItem(`leash.agent.${account.toLowerCase()}`)
        if (savedAgent && isValidAddress(savedAgent)) {
          authorized = await publicClient.readContract({
            address: account, abi: SETUP_ABI, functionName: 'operators', args: [savedAgent],
          }) as boolean
          if (authorized) {
            if (!cancelled) {
              setAgent(savedAgent)
              setAgentAuthorized(true)
            }
            try {
              operatorBalance = await readBalance(savedAgent)
              if (!cancelled) setAgentBalance(operatorBalance)
            } catch {
              // The authorization was independently verified. A transient
              // token-balance read must not send the user back to account creation.
              if (!cancelled) setAgentBalance(null)
            }
          }
        }
        if (cancelled) return
        setActiveStage(firstSetupStage(setupReadiness({
          account,
          limitsConfirmed: Boolean(nextLimits),
          agentAuthorized: authorized,
          protectedBalance: policyBalance,
          agentTransactionsLeft: operatorBalance === null ? 0 : transactionsLeft(operatorBalance),
        })))
      } catch {
        if (!cancelled) {
          setRestoreNote('Could not verify this account on Celo. Check your connection and try again.')
          setActiveStage(1)
        }
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()
    return () => { cancelled = true }
  }, [account])

  async function deploy() {
    setError(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setError(WRONG_NETWORK); return }
    setDeploying(true)
    try {
      const { abi, bytecode } = await import('../../lib/contract.js')
      let hash: `0x${string}`
      try {
        hash = await deployContractAsync({
          abi, bytecode, args: [connected!], chainId: REQUIRED_CHAIN_ID, gas: DEPLOY_GAS,
        })
      } catch {
        setError('The deployment was not sent.')
        return
      }
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (!receipt.contractAddress) {
          setError(`Sent as ${hash}, but no contract address was returned. Check the transaction before trying again.`)
          return
        }
        setAccount(receipt.contractAddress)
        savePolicyAccount(localStorage, connected!, {
          address: receipt.contractAddress, deployBlock: receipt.blockNumber.toString(),
        })
        selectPolicyAccount(localStorage, connected!, receipt.contractAddress)
        announceAccountRegistryChange()
        window.history.replaceState(null, '', '/setup')
        setActiveStage(2)
      } catch {
        setError(`Sent as ${hash}. The chain has not confirmed it yet. Check that transaction before deploying again.`)
      }
    } catch {
      setError('The deployment did not start. Reload and try again.')
    } finally { setDeploying(false) }
  }

  async function setLimits() {
    setLimitsNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setLimitsNote(WRONG_NETWORK); return }
    const parsed = validateLimits(perTx, daily, DECIMALS, confirmedLimits ?? undefined)
    if (!parsed.ok) { setLimitsNote(parsed.error); return }
    setLimitsBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setPolicy',
        args: [TOKEN, parsed.perTx, parsed.daily], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => {
        const limits = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'limits', args: [TOKEN],
        }) as readonly [bigint, bigint, bigint, bigint]
        return limits[0] === parsed.perTx && limits[1] === parsed.daily
      })
      if (confirmed) {
        setConfirmedLimits({ perTx: parsed.perTx, daily: parsed.daily })
        setProtectedAmount(daily)
        setLimitsNote('Protection limits saved.')
      } else setLimitsNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      setLimitsNote('The transaction was not sent.')
    } finally { setLimitsBusy(false) }
  }

  async function chooseAnyRecipient() {
    setRecipientMode('any')
    setRecipientNote(null)
    if (!recipientProtectionEnabled) {
      localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'any')
      return
    }
    if (chainId !== REQUIRED_CHAIN_ID) {
      setRecipientMode('protected')
      setRecipientNote(WRONG_NETWORK)
      return
    }
    setRecipientBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setAllowlistEnabled',
        args: [false], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => !Boolean(
        await publicClient.readContract({ address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled' }),
      ))
      if (confirmed) {
        setRecipientProtectionEnabled(false)
        setRecipientNote('Direct payments can now go to any recipient.')
        localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'any')
      } else {
        setRecipientMode('protected')
        setRecipientNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setRecipientMode('protected')
      setRecipientNote('The transaction was not sent.')
    } finally { setRecipientBusy(false) }
  }

  async function protectRecipient() {
    setRecipientNote(null)
    if (!isValidAddress(recipient)) { setRecipientNote('Enter a valid recipient address.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setRecipientNote(WRONG_NETWORK); return }
    setRecipientBusy(true)
    try {
      const alreadyApproved = await publicClient.readContract({
        address: account!, abi: SETUP_ABI, functionName: 'payeeAllowlist', args: [recipient],
      }) as boolean
      if (!alreadyApproved) {
        await writeContractAsync({
          address: account!, abi: SETUP_ABI, functionName: 'setAllowlist',
          args: [recipient, true], chainId: REQUIRED_CHAIN_ID,
        })
        const approved = await pollUntil(async () => Boolean(
          await publicClient.readContract({
            address: account!, abi: SETUP_ABI, functionName: 'payeeAllowlist', args: [recipient],
          }),
        ))
        if (!approved) {
          setRecipientNote('Recipient approval is not confirmed. Protection was not enabled.')
          return
        }
      }
      if (!recipientProtectionEnabled) {
        await writeContractAsync({
          address: account!, abi: SETUP_ABI, functionName: 'setAllowlistEnabled',
          args: [true], chainId: REQUIRED_CHAIN_ID,
        })
      }
      const enabled = await pollUntil(async () => Boolean(
        await publicClient.readContract({ address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled' }),
      ))
      if (enabled) {
        setRecipientProtectionEnabled(true)
        setRecipientMode('protected')
        setRecipientNote('Recipient protection enabled.')
        localStorage.setItem(`leash.recipientMode.${account!.toLowerCase()}`, 'protected')
        localStorage.setItem(`leash.recipient.${account!.toLowerCase()}`, recipient)
      } else setRecipientNote('The recipient is approved, but protection has not been confirmed yet.')
    } catch {
      setRecipientNote('The requested policy change was not completed.')
    } finally { setRecipientBusy(false) }
  }

  async function addAgent() {
    setAgentNote(null)
    if (!isValidAddress(agent)) { setAgentNote('Enter a valid Celo address.'); return }
    if (connected && agent.toLowerCase() === connected.toLowerCase()) {
      setAgentNote('Use a separate agent wallet. The owner wallet must not also be the agent.')
      return
    }
    if (chainId !== REQUIRED_CHAIN_ID) { setAgentNote(WRONG_NETWORK); return }
    setAgentBusy(true)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setOperator',
        args: [agent, true], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'operators', args: [agent],
        }),
      ))
      if (confirmed) {
        setAgentAuthorized(true)
        setAgentNote('Agent wallet authorized.')
        localStorage.setItem(`leash.agent.${account!.toLowerCase()}`, agent)
        // Authorization and balance are separate observations. If this read
        // fails, Refresh balances remains available; do not claim the write
        // was not sent after it was already observed on chain.
        try { setAgentBalance(await readBalance(agent)) } catch { setAgentBalance(null) }
      } else setAgentNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      setAgentNote('The transaction was not sent.')
    } finally { setAgentBusy(false) }
  }

  async function refreshBalances() {
    if (!account) return
    setCheckingBalances(true)
    setError(null)
    try {
      const [policyBalance, operatorBalance] = await Promise.all([
        readBalance(account),
        agentAuthorized && isValidAddress(agent) ? readBalance(agent) : Promise.resolve(null),
      ])
      setProtectedBalance(policyBalance)
      setAgentBalance(operatorBalance)
    } catch {
      setError('Could not refresh balances from Celo. Check your connection and try again.')
    } finally { setCheckingBalances(false) }
  }

  async function fund(target: FundingTarget) {
    const destination = target === 'protected' ? account : (isValidAddress(agent) ? agent : null)
    const amountInput = target === 'protected' ? protectedAmount : agentGasAmount
    const setNote = target === 'protected' ? setProtectedFundNote : setAgentFundNote
    setNote(null)
    if (!destination) { setNote('The destination address is not ready.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }
    let amount: bigint
    try {
      amount = parseAmount(amountInput, DECIMALS)
      if (amount === 0n) throw new RangeError('Enter an amount greater than 0.')
    } catch (e) {
      setNote((e as Error).message)
      return
    }
    setFundingTarget(target)
    try {
      const before = await readBalance(destination)
      await writeContractAsync({
        address: TOKEN, abi: ERC20_ABI, functionName: 'transfer',
        args: [destination, amount], chainId: REQUIRED_CHAIN_ID,
      })
      let nextBalance = before
      const confirmed = await pollUntil(async () => {
        nextBalance = await readBalance(destination)
        return nextBalance > before
      })
      if (confirmed) {
        if (target === 'protected') setProtectedBalance(nextBalance)
        else setAgentBalance(nextBalance)
        setNote(target === 'protected' ? 'Protected funds added.' : 'Agent gas added.')
      } else setNote('Sent, but the balance has not changed yet. Check the transaction before trying again.')
    } catch {
      setNote('The transfer was not sent.')
    } finally { setFundingTarget(null) }
  }

  return (
    <main className={`${PAGE} py-12`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BrandLink large />
          <h1 className="mt-5" style={{ ...HEADING, fontSize: 'var(--t-title)' }}>
            Set up a protected agent account
          </h1>
          <p className="mt-2" style={{ ...PROSE, maxWidth: '62ch', color: 'var(--dim)' }}>
            Create the account, decide what the agent may spend, then give it permission and funds.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ActionLink href="/accounts">My accounts</ActionLink>
          <NetworkBadge />
        </div>
      </header>

      <nav aria-label="Setup progress" className="mt-8">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((step) => {
            const done = stageDone(step.id)
            const unlocked = stageUnlocked(step.id)
            const current = activeStage === step.id
            return (
              <li key={step.id}>
                <button
                  type="button" disabled={!unlocked} aria-current={current ? 'step' : undefined}
                  onClick={() => setActiveStage(step.id)}
                  className="w-full rounded p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ minHeight: 72, background: current ? 'var(--panel)' : 'transparent',
                    border: `1px solid ${current ? 'var(--line-control)' : 'var(--line)'}`, outlineColor: 'var(--text)' }}
                >
                  <span className="num text-xs" style={{ color: done ? 'var(--ok)' : 'var(--dim)' }}>
                    {done ? '✓' : `0${step.id}`}
                  </span>
                  <span className="block text-sm mt-1" style={{ color: current ? 'var(--text)' : 'var(--dim)' }}>
                    <span className="sm:hidden">{step.short}</span>
                    <span className="hidden sm:inline">{step.title}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {error && <p role="alert" className="mt-5 text-sm" style={{ color: 'var(--bad)' }}>{error}</p>}
      {restoreNote && <p role="alert" className="mt-5 text-sm" style={{ color: 'var(--bad)' }}>{restoreNote}</p>}

      {activeStage === 1 && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 1 of 4</Label>
          <h2 className="mt-2" style={HEADING}>Create your protected account</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            This account holds the agent&apos;s budget. You remain its owner and control every protection setting.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 mt-5">
            {[
              ['Owner wallet', 'Controls policy and recovery'],
              ['Protected account', 'Holds the spending budget'],
              ['Agent wallet', 'Spends only within policy'],
            ].map(([title, copy]) => (
              <div key={title} className="p-3" style={STATUS_BOX}>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>{copy}</p>
              </div>
            ))}
          </div>
          <details className="mt-5 text-sm" style={{ color: 'var(--dim)' }}>
            <summary className="cursor-pointer" style={{ color: 'var(--text)' }}>What you need before creating</summary>
            <ul className="mt-3 ml-5 list-disc space-y-2">
              <li>An owner wallet on Celo with a little CELO for transaction fees.</li>
              <li>USDC on Celo for the protected budget and agent gas.</li>
              <li>A separate wallet address controlled by your AI agent.</li>
            </ul>
          </details>
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            {!isConnected ? <ConnectButton /> : account ? (
              <div>
                <p className="text-sm" style={{ color: 'var(--ok)' }}>✓ Protected account created</p>
                <div className="mt-2 max-w-full overflow-x-auto">
                  <Address address={account} copy explorer full className="num text-sm" />
                </div>
                <Button variant="primary" className="mt-4" onClick={() => setActiveStage(2)}>
                  Continue to protection
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <ConnectButton />
                  <span className="text-sm" style={{ color: 'var(--dim)' }}>Owner wallet connected</span>
                </div>
                <p className="text-sm mt-4" style={{ color: 'var(--bad)' }}>
                  The owner is permanent. Use a wallet you will keep secure; it must not be the agent wallet.
                </p>
                <Button variant="primary" className="mt-3" disabled={deploying || restoring} onClick={() => void deploy()}>
                  {deploying ? 'Creating…' : 'Create protected account'}
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {activeStage === 2 && account && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 2 of 4</Label>
          <h2 className="mt-2" style={HEADING}>Set protection</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            These limits are enforced by the account on Celo, even if the agent&apos;s prompt or code fails.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 mt-5">
            <label>
              <Label className="block">Maximum per payment</Label>
              <div className="relative mt-2">
                <input className="num field w-full p-3 pr-16" aria-label="Maximum payment in USDC"
                  inputMode="decimal" value={perTx}
                  onChange={(event) => { setPerTx(event.target.value); setLimitsNote(null) }} disabled={limitsBusy} />
                <span className="absolute right-3 top-3 text-sm" style={{ color: 'var(--dim)' }}>USDC</span>
              </div>
            </label>
            <label>
              <Label className="block">Maximum per day</Label>
              <div className="relative mt-2">
                <input className="num field w-full p-3 pr-16" aria-label="Daily spending limit in USDC"
                  inputMode="decimal" value={daily}
                  onChange={(event) => { setDaily(event.target.value); setLimitsNote(null) }} disabled={limitsBusy} />
                <span className="absolute right-3 top-3 text-sm" style={{ color: 'var(--dim)' }}>USDC</span>
              </div>
            </label>
          </div>
          <div className="p-4 mt-4 text-sm" style={STATUS_BOX}>
            Your agent may spend up to <span className="num">{perTx || '—'} USDC</span> per payment and{' '}
            <span className="num">{daily || '—'} USDC</span> per UTC day.
          </div>
          <Button variant="primary" className="mt-4" disabled={limitsBusy || limitsConfirmed} onClick={() => void setLimits()}>
            {limitsBusy ? 'Saving…' : limitsConfirmed ? 'Limits saved' : 'Save limits'}
          </Button>
          {limitsNote && <p role="status" className="text-sm mt-2"
            style={{ color: noteColor(limitsNote, 'Protection limits saved.') }}>{limitsNote}</p>}

          <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Recipient protection</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>Optional for direct payments.</p>
              </div>
              <Label>Optional</Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <button type="button" aria-pressed={recipientMode === 'any'} disabled={recipientBusy}
                onClick={() => void chooseAnyRecipient()}
                className="rounded p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: recipientMode === 'any' ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span className="text-sm font-semibold">Any recipient</span>
                <span className="block text-xs mt-1" style={{ color: 'var(--dim)' }}>Best for agents with changing payees.</span>
              </button>
              <button type="button" aria-pressed={recipientMode === 'protected'} disabled={recipientBusy}
                onClick={() => { setRecipientMode('protected'); setRecipientNote(null) }}
                className="rounded p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: recipientMode === 'protected' ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span className="text-sm font-semibold">Approved recipients only</span>
                <span className="block text-xs mt-1" style={{ color: 'var(--dim)' }}>Best when payees are known in advance.</span>
              </button>
            </div>
            {recipientMode === 'protected' && (
              <div className="mt-4">
                <Label className="block">Approved recipient address</Label>
                <input className="num field w-full mt-2 p-3" aria-label="Approved recipient address"
                  placeholder="0x…" value={recipient}
                  onChange={(event) => { setRecipient(event.target.value); setRecipientNote(null) }} disabled={recipientBusy} />
                <Button variant="ghost" className="mt-3" disabled={recipientBusy} onClick={() => void protectRecipient()}>
                  {recipientBusy ? 'Saving protection…' : recipientProtectionEnabled ? 'Approve another recipient' : 'Approve & enable'}
                </Button>
                <p className="text-xs mt-2" style={{ color: 'var(--dim)' }}>
                  Enabling for the first time requires two wallet confirmations: approve the address, then enable protection.
                </p>
              </div>
            )}
            {recipientNote && <p role="status" className="text-sm mt-3" style={{
              color: recipientNote === 'Recipient protection enabled.' ||
                recipientNote === 'Direct payments can now go to any recipient.' ? 'var(--ok)' : 'var(--bad)',
            }}>{recipientNote}</p>}
            <p className="text-sm mt-4" style={{ color: 'var(--bad)' }}>
              Recipient protection covers direct account payments only. Funds moved to the agent wallet for gas or x402 are outside this restriction.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            <Button variant="ghost" onClick={() => setActiveStage(1)}>Back</Button>
            <Button variant="primary" disabled={!limitsConfirmed || !recipientReady || recipientBusy}
              onClick={() => setActiveStage(3)}>Continue to agent</Button>
          </div>
        </Panel>
      )}

      {activeStage === 3 && account && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 3 of 4</Label>
          <h2 className="mt-2" style={HEADING}>Add & fund your agent</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Authorize a separate agent wallet, then fund the two balances it needs to operate.
          </p>
          <div className="mt-5">
            <h3 className="text-sm font-semibold">1. Authorize agent wallet</h3>
            {!agentAuthorized ? (
              <>
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  The agent can request payments within policy. It cannot change limits, pause the account or recover all funds.
                </p>
                <Label className="block mt-4">Agent wallet address</Label>
                <input className="num field w-full mt-2 p-3" aria-label="Agent wallet address"
                  placeholder="0x…" value={agent}
                  onChange={(event) => { setAgent(event.target.value); setAgentNote(null) }} disabled={agentBusy} />
                <Button variant="primary" className="mt-3" disabled={agentBusy} onClick={() => void addAgent()}>
                  {agentBusy ? 'Authorizing…' : 'Authorize agent'}
                </Button>
              </>
            ) : (
              <div className="p-4 mt-3" style={STATUS_BOX}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm" style={{ color: 'var(--ok)' }}>✓ Agent wallet authorized</p>
                  <Address address={agent} copy explorer className="num text-sm" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 mt-4 text-xs" style={{ color: 'var(--dim)' }}>
                  <p>✓ Can request policy-checked payments</p>
                  <p>— Cannot change protection settings</p>
                  <p>— Cannot pause or resume the account</p>
                  <p>— Cannot sweep the protected balance</p>
                </div>
              </div>
            )}
            {agentNote && <p role="status" className="text-sm mt-2"
              style={{ color: noteColor(agentNote, 'Agent wallet authorized.') }}>{agentNote}</p>}
          </div>

          {agentAuthorized && (
            <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">2. Fund both balances</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>Each transfer is confirmed separately in your owner wallet.</p>
                </div>
                <Button variant="ghost" disabled={checkingBalances} onClick={() => void refreshBalances()}>
                  {checkingBalances ? 'Checking…' : 'Refresh balances'}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <div className="p-4" style={STATUS_BOX}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Protected account</h4>
                    <span className="text-xs" style={{ color: readiness.protectedFundsDetected ? 'var(--ok)' : 'var(--dim)' }}>
                      {readiness.protectedFundsDetected ? 'Ready' : 'Required'}
                    </span>
                  </div>
                  <p className="num mt-3">{protectedBalance === null ? 'Checking…' : `${formatAmount(protectedBalance, DECIMALS)} USDC`}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--dim)' }}>Spending budget protected by your limits.</p>
                  <Label className="block mt-4">Amount to add</Label>
                  <input className="num field w-full mt-2 p-2" aria-label="USDC to add to protected account"
                    inputMode="decimal" value={protectedAmount}
                    onChange={(event) => { setProtectedAmount(event.target.value); setProtectedFundNote(null) }} disabled={fundingTarget !== null} />
                  <Button variant="ghost" className="mt-3" disabled={fundingTarget !== null} onClick={() => void fund('protected')}>
                    {fundingTarget === 'protected' ? 'Sending…' : 'Add protected funds'}
                  </Button>
                  {protectedFundNote && <p className="text-xs mt-2"
                    style={{ color: noteColor(protectedFundNote, 'Protected funds added.') }}>{protectedFundNote}</p>}
                </div>

                <div className="p-4" style={STATUS_BOX}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Agent wallet</h4>
                    <span className="text-xs" style={{ color: readiness.agentGasReady ? 'var(--ok)' : 'var(--dim)' }}>
                      {readiness.agentGasReady ? 'Ready' : 'Required'}
                    </span>
                  </div>
                  <p className="num mt-3">{agentBalance === null ? 'Checking…' : `${formatAmount(agentBalance, DECIMALS)} USDC`}</p>
                  <p className="text-xs mt-2" style={{ color: readiness.agentGasReady ? 'var(--dim)' : 'var(--bad)' }}>
                    {agentBalance === null ? 'USDC pays Celo transaction fees.' :
                      `About ${agentTransactionsLeft} ${agentTransactionsLeft === 1 ? 'transaction' : 'transactions'} available.`}
                  </p>
                  <Label className="block mt-4">USDC for gas</Label>
                  <input className="num field w-full mt-2 p-2" aria-label="USDC to add to agent wallet for gas"
                    inputMode="decimal" value={agentGasAmount}
                    onChange={(event) => { setAgentGasAmount(event.target.value); setAgentFundNote(null) }} disabled={fundingTarget !== null} />
                  <Button variant="ghost" className="mt-3" disabled={fundingTarget !== null} onClick={() => void fund('agent')}>
                    {fundingTarget === 'agent' ? 'Sending…' : 'Add agent gas'}
                  </Button>
                  {agentFundNote && <p className="text-xs mt-2"
                    style={{ color: noteColor(agentFundNote, 'Agent gas added.') }}>{agentFundNote}</p>}
                </div>
              </div>
              <p className="text-sm mt-4" style={{ color: 'var(--bad)' }}>
                Keep only a small gas float in the agent wallet. Those funds are controlled by the agent and are outside recipient protection.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            <Button variant="ghost" onClick={() => setActiveStage(2)}>Back</Button>
            <Button variant="primary" disabled={!readiness.ready} onClick={() => setActiveStage(4)}>Review setup</Button>
            {!readiness.ready && agentAuthorized && <span className="text-xs" style={{ color: 'var(--dim)' }}>
              Both balances must be ready before the agent can activate.
            </span>}
          </div>
        </Panel>
      )}

      {activeStage === 4 && account && readiness.ready && confirmedLimits && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 4 of 4</Label>
          <h2 className="mt-2" style={HEADING}>Your agent account is ready</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            The on-chain protections, agent permission and both operating balances have been verified.
          </p>
          <div className="p-4 mt-5" style={{ ...STATUS_BOX, borderColor: 'var(--ok)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>Ready on Celo</p>
            <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
              Hand the account address to your agent when you are ready to connect its runtime.
            </p>
          </div>
          <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2 mt-6 text-sm">
            <div><dt style={{ color: 'var(--dim)' }}>Protected account</dt>
              <dd className="mt-1"><Address address={account} copy explorer className="num" /></dd></div>
            <div><dt style={{ color: 'var(--dim)' }}>Agent wallet</dt>
              <dd className="mt-1"><Address address={agent} copy explorer className="num" /></dd></div>
            <div><dt style={{ color: 'var(--dim)' }}>Maximum per payment</dt>
              <dd className="num mt-1">{formatAmount(confirmedLimits.perTx, DECIMALS, 2)} USDC</dd></div>
            <div><dt style={{ color: 'var(--dim)' }}>Maximum per day</dt>
              <dd className="num mt-1">{formatAmount(confirmedLimits.daily, DECIMALS, 2)} USDC</dd></div>
            <div><dt style={{ color: 'var(--dim)' }}>Protected balance</dt>
              <dd className="num mt-1">{formatAmount(protectedBalance!, DECIMALS)} USDC</dd></div>
            <div><dt style={{ color: 'var(--dim)' }}>Agent gas</dt>
              <dd className="num mt-1">{agentTransactionsLeft} {agentTransactionsLeft === 1 ? 'transaction' : 'transactions'} available</dd></div>
            <div className="sm:col-span-2"><dt style={{ color: 'var(--dim)' }}>Direct-payment recipients</dt>
              <dd className="mt-1">{recipientProtectionEnabled ? 'Approved addresses only' : 'Any address — recipient protection is not enabled'}</dd></div>
          </dl>
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            <h3 className="text-sm font-semibold">What happens next</h3>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Open the dashboard to monitor spending or change protection. Connecting an SDK or MCP runtime is a separate integration journey and is not required to complete this setup.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <ActionLink href={`/a/${account}`} variant="primary">Open dashboard</ActionLink>
              <Button variant="ghost" onClick={() => setActiveStage(3)}>Review funding</Button>
            </div>
          </div>
        </Panel>
      )}
    </main>
  )
}
