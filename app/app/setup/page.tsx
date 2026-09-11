'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useDeployContract, useWriteContract } from 'wagmi'
import ConnectButton from '../../components/ConnectButton'
import McpHandoff from '../../components/McpHandoff'
import NetworkBadge from '../../components/NetworkBadge'
import Address from '../../components/ui/Address'
import ActionLink from '../../components/ui/ActionLink'
import AppHeader from '../../components/ui/AppHeader'
import Panel from '../../components/ui/Panel'
import Label, { LABEL_STYLE } from '../../components/ui/Label'
import { PROSE, SUBHEAD, TITLE } from '../../components/ui/prose'
import Button from '../../components/ui/Button'
import {
  publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK, DEPLOY_GAS, ERC20_TRANSFER_GAS,
  SET_ALLOWLIST_ENABLED_GAS, SET_ALLOWLIST_GAS, SET_OPERATOR_GAS, SET_POLICY_GAS,
} from '../../lib/chain.js'
import { isValidAddress } from '../../lib/address.js'
import { formatDisplayAmount, parseAmount, validateLimits } from '../../lib/policy.js'
import { transactionsLeft } from '../../lib/gasFloat.js'
import {
  afterFailedRead, balanceValue, describeBalance, firstSetupStage, setupReadiness,
  type BalanceRead, type SetupStage,
} from '../../lib/setup.js'
import { pollUntil } from '../../lib/confirm.js'
import { readLocal, writeLocal } from '../../lib/browserStorage.js'
import { describeDeployReceipt } from '../../lib/deploy.js'
import { PAGE, PANEL_GRID } from '../../components/ui/page'
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

/**
 * Where focus lands when the wizard changes step. Every stage carries it on
 * the one element that says what this step is -- its heading, or on the
 * recovery branch that has no heading, the sentence explaining why.
 */
const STAGE_HEADING_ID = 'stage-heading'

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
/** A --well box holding a choice is a control, not a surface: --r-box, not
 *  --r-surface. The 6px here was the only radius in the app on no scale at
 *  all. design-system.md §10. */
const STATUS_BOX: React.CSSProperties = {
  background: 'var(--well)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-box)',
}

type RecipientMode = 'any' | 'protected'
type ConfirmedLimits = { perTx: bigint; daily: bigint }
type FundingTarget = 'protected' | 'agent'

/**
 * Variadic because a single operation has more than one non-failure outcome:
 * "already authorised, nothing was sent" is not an error, and matching one
 * exact string painted it in --bad. AgentAccessPanel marks its own successes
 * with a leading tick instead; both spellings are load-bearing strings, and
 * either way a reworded message must not silently turn red.
 */
function noteColor(note: string | null, ...successes: string[]): string {
  return note !== null && successes.includes(note) ? 'var(--ok)' : 'var(--bad)'
}

export default function Onboard() {
  const { address: connected, isConnected, chainId } = useAccount()
  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  const [activeStage, setActiveStage] = useState<SetupStage>(1)
  /**
   * Which stage the previous render showed. `null` on the first one, because
   * a page that grabs focus as it loads has taken it from wherever the reader
   * actually was -- the address bar, or the top of the document they meant to
   * read from the start.
   */
  const shownStage = useRef<SetupStage | null>(null)

  /**
   * Move focus to the new step's heading when the step changes.
   *
   * Every panel below the stepper is replaced wholesale on a step change and
   * focus stayed on the button that caused it, so a screen reader was told
   * nothing about a screen that had entirely changed -- and a keyboard user
   * carried on tabbing from the stepper through four buttons to reach content
   * that was already in front of them. This also fires on the automatic
   * resets: a disconnected wallet drops the wizard to step 1, and that is a
   * change the reader did not ask for and most needs to hear about.
   */
  useEffect(() => {
    if (shownStage.current === null) { shownStage.current = activeStage; return }
    if (shownStage.current === activeStage) return
    shownStage.current = activeStage
    // The panel for the new stage mounts in the same commit, so the element
    // is there by the time an effect runs. If a branch renders without one --
    // the loading shape of a stage -- doing nothing is right: leaving focus
    // where it is beats throwing it to the document body.
    document.getElementById(STAGE_HEADING_ID)?.focus()
  }, [activeStage])
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

  const [protectedBalance, setProtectedBalance] = useState<BalanceRead>({ status: 'reading' })
  const [agentBalance, setAgentBalance] = useState<BalanceRead>({ status: 'reading' })
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
  // balanceValue, so a read that FAILED counts exactly as one that has not
  // happened: readiness is a positive observation of the chain, and step 4
  // must not unlock on a figure nobody has seen.
  const agentBalanceValue = balanceValue(agentBalance)
  const agentTransactionsLeft = agentBalanceValue === null ? 0 : transactionsLeft(agentBalanceValue)
  const readiness = setupReadiness({
    account, limitsConfirmed, agentAuthorized,
    protectedBalance: balanceValue(protectedBalance), agentTransactionsLeft,
  })
  const protectedBalanceRead = describeBalance(protectedBalance, DECIMALS)
  const agentBalanceRead = describeBalance(agentBalance, DECIMALS)
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
    // Storage can throw rather than return null (Safari private mode, blocked
    // third-party contexts). Unguarded, the throw escaped this effect and left
    // `account` null with nothing said -- which is the same screen as "start
    // here", so the failure was invisible rather than wrong. A browser that
    // cannot remember anything simply starts at step 1, which is correct.
    try {
      const accounts = migrateLegacyAccount(localStorage, connected)
      if (new URLSearchParams(window.location.search).get('new') === '1') {
        setAccount(null)
        setActiveStage(1)
        return
      }
      const savedAddr = readLocal('leash.account')
      const savedOwner = readLocal('leash.accountOwner')
      if (savedAddr && isValidAddress(savedAddr) && savedOwner?.toLowerCase() === connected.toLowerCase()) {
        setAccount(savedAddr)
      } else if (accounts[0]) {
        setAccount(accounts[0].address)
      } else {
        setAccount(null)
        setActiveStage(1)
      }
    } catch {
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
    // A different account's figures are not this one's, so both go back to
    // 'reading' rather than being carried across.
    setProtectedBalance({ status: 'reading' })
    setAgentBalance({ status: 'reading' })
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
          // formatDisplayAmount, not formatAmount: the latter truncates, and
          // these strings are both what Save writes back AND what
          // readiness.limitsConfirmed compares against confirmedLimits. A
          // truncated pre-fill made those two disagree, which sent
          // firstSetupStage to stage 4 while the render's guard refused it --
          // and no stage block matched, so the wizard body went blank.
          setPerTx(formatDisplayAmount(nextLimits.perTx, DECIMALS, 2))
          setDaily(formatDisplayAmount(nextLimits.daily, DECIMALS, 2))
          setConfirmedLimits(nextLimits)
        }
        setProtectedBalance({ status: 'ok', value: policyBalance })
        setRecipientProtectionEnabled(listEnabled)
        setRecipientMode(listEnabled ? 'protected' : 'any')
        const savedRecipient = readLocal(`leash.recipient.${account.toLowerCase()}`)
        if (savedRecipient && isValidAddress(savedRecipient)) setRecipient(savedRecipient)

        let authorized = false
        let operatorBalance: bigint | null = null
        const savedAgent = readLocal(`leash.agent.${account.toLowerCase()}`)
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
              if (!cancelled) setAgentBalance({ status: 'ok', value: operatorBalance })
            } catch {
              // The authorization was independently verified. A transient
              // token-balance read must not send the user back to account creation.
              // It says so on screen now instead of reading as "Checking…".
              // Flatly 'failed', not afterFailedRead: this effect reset the
              // balance a few lines above, so there is no earlier figure to keep.
              if (!cancelled) setAgentBalance({ status: 'failed' })
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
        // A receipt is not a success. See describeDeployReceipt: a reverted
        // creation still carries a contractAddress, and saving it left a junk
        // account behind and then blamed the next failed read on the network.
        const outcome = describeDeployReceipt(receipt, hash)
        if (!outcome.ok) { setError(outcome.message); return }
        setAccount(outcome.address)
        savePolicyAccount(localStorage, connected!, {
          address: outcome.address, deployBlock: receipt.blockNumber.toString(),
        })
        selectPolicyAccount(localStorage, connected!, outcome.address)
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
        args: [TOKEN, parsed.perTx, parsed.daily], chainId: REQUIRED_CHAIN_ID, gas: SET_POLICY_GAS,
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
        args: [false], chainId: REQUIRED_CHAIN_ID, gas: SET_ALLOWLIST_ENABLED_GAS,
      })
      const confirmed = await pollUntil(async () => !Boolean(
        await publicClient.readContract({ address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled' }),
      ))
      if (confirmed) {
        setRecipientProtectionEnabled(false)
        setRecipientNote('Direct payments can now go to any recipient.')
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
      // Neither write below would run, and the pollUntil that follows them was
      // already true before this function was called -- so it reported
      // "Recipient protection enabled." for a transaction that never existed.
      // lib/policy.ts refuses a no-op limits save for exactly this reason: a
      // confirmation poll satisfied on its first iteration confirms nothing.
      if (alreadyApproved && recipientProtectionEnabled) {
        setRecipientNote('That recipient is already approved and protection is already on — nothing to change.')
        return
      }
      if (!alreadyApproved) {
        await writeContractAsync({
          address: account!, abi: SETUP_ABI, functionName: 'setAllowlist',
          args: [recipient, true], chainId: REQUIRED_CHAIN_ID, gas: SET_ALLOWLIST_GAS,
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
          args: [true], chainId: REQUIRED_CHAIN_ID, gas: SET_ALLOWLIST_ENABLED_GAS,
        })
      }
      const enabled = await pollUntil(async () => Boolean(
        await publicClient.readContract({ address: account!, abi: SETUP_ABI, functionName: 'allowlistEnabled' }),
      ))
      if (enabled) {
        setRecipientProtectionEnabled(true)
        setRecipientMode('protected')
        setRecipientNote('Recipient protection enabled.')
        writeLocal(`leash.recipient.${account!.toLowerCase()}`, recipient)
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
      // Ask the chain before writing to it. Two things depended on this and
      // neither worked:
      //
      // - Resuming. The wizard learns its agent from localStorage alone, so a
      //   different browser, a cleared origin, or Safari private mode restored
      //   a finished account with no agent and asked the owner to authorise
      //   one they had already authorised -- a second transaction, paid for,
      //   that changed nothing. Pasting the address they already have is now
      //   enough, because operators() is what answers.
      // - Truthfulness. setOperator on an existing operator is a no-op, so the
      //   pollUntil below was ALREADY true before the call: a wallet that
      //   silently dropped the write would still have been reported as
      //   "authorized". lib/policy.ts documents the same trap for limits.
      //
      // AgentAccessPanel.grantAccess has refused a duplicate all along. Two
      // implementations of one operation must not disagree (CLAUDE.md).
      //
      // Its own try: the catch below says "The transaction was not sent",
      // which would be a wrong account of a failed READ -- it reads as a
      // rejected signature rather than an unreachable node, and nothing has
      // been asked of the wallet at this point.
      let alreadyAuthorized: boolean
      try {
        alreadyAuthorized = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'operators', args: [agent],
        }) as boolean
      } catch {
        setAgentNote('Could not check this wallet against the account on Celo. Nothing was sent; check your connection and try again.')
        return
      }
      if (alreadyAuthorized) {
        setAgentAuthorized(true)
        setAgentNote('That wallet is already an authorised agent on this account. Nothing was sent.')
        writeLocal(`leash.agent.${account!.toLowerCase()}`, agent)
        try {
          setAgentBalance({ status: 'ok', value: await readBalance(agent) })
        } catch { setAgentBalance((prev) => afterFailedRead(prev)) }
        return
      }
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setOperator',
        args: [agent, true], chainId: REQUIRED_CHAIN_ID, gas: SET_OPERATOR_GAS,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'operators', args: [agent],
        }),
      ))
      if (confirmed) {
        setAgentAuthorized(true)
        setAgentNote('Agent wallet authorized.')
        writeLocal(`leash.agent.${account!.toLowerCase()}`, agent)
        // Authorization and balance are separate observations. If this read
        // fails, Refresh balances remains available; do not claim the write
        // was not sent after it was already observed on chain.
        try {
          setAgentBalance({ status: 'ok', value: await readBalance(agent) })
        } catch { setAgentBalance((prev) => afterFailedRead(prev)) }
      } else setAgentNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      setAgentNote('The transaction was not sent.')
    } finally { setAgentBusy(false) }
  }

  async function refreshBalances() {
    if (!account) return
    setCheckingBalances(true)
    setError(null)
    // allSettled, not all: these are two independent reads of two different
    // addresses, and Promise.all rejects on the first failure -- so a flaky
    // read of the agent's balance discarded the protected balance that had
    // just come back fine, and both columns went to the same "Checking…".
    const wantsAgent = agentAuthorized && isValidAddress(agent)
    try {
      const [policy, operator] = await Promise.allSettled([
        readBalance(account),
        wantsAgent ? readBalance(agent) : Promise.resolve(null),
      ])
      setProtectedBalance((prev) => policy.status === 'fulfilled'
        ? { status: 'ok', value: policy.value } : afterFailedRead(prev))
      // Left alone when there is no agent yet: 'reading' is the truth then, and
      // the funding panel it appears in is not rendered until one is authorised.
      if (wantsAgent) {
        setAgentBalance((prev) => operator.status === 'fulfilled' && operator.value !== null
          ? { status: 'ok', value: operator.value } : afterFailedRead(prev))
      }
      if (policy.status === 'rejected' || operator.status === 'rejected') {
        setError('Could not read every balance from Celo. Anything still shown is the last figure the chain gave; try again in a moment.')
      }
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
      // Read rather than discovered from a revert. wagmi does not simulate, so
      // a transfer larger than the wallet holds is signed, lands, reverts and
      // costs gas -- and then reads as a slow chain, because the destination
      // balance genuinely did not change. One balanceOf turns that into a
      // sentence. This matters most on a wallet nobody has used before.
      const available = await readBalance(connected!)
      if (available < amount) {
        setNote(`Your wallet holds ${formatDisplayAmount(available, DECIMALS)} USDC, less than the ${formatDisplayAmount(amount, DECIMALS)} you asked to send. Nothing was sent.`)
        return
      }
      const before = await readBalance(destination)
      await writeContractAsync({
        address: TOKEN, abi: ERC20_ABI, functionName: 'transfer',
        args: [destination, amount], chainId: REQUIRED_CHAIN_ID, gas: ERC20_TRANSFER_GAS,
      })
      let nextBalance = before
      const confirmed = await pollUntil(async () => {
        nextBalance = await readBalance(destination)
        return nextBalance > before
      })
      if (confirmed) {
        if (target === 'protected') setProtectedBalance({ status: 'ok', value: nextBalance })
        else setAgentBalance({ status: 'ok', value: nextBalance })
        setNote(target === 'protected' ? 'Protected funds added.' : 'Agent gas added.')
      } else setNote('Sent, but the balance has not changed yet. Check the transaction before trying again.')
    } catch {
      setNote('The transfer was not sent.')
    } finally { setFundingTarget(null) }
  }

  return (
    <>
      {/* The wordmark was `large` here and nowhere else -- a --t-title brand
          directly above a --t-title page heading, which is two elements
          claiming the same rank. AppHeader renders it at one size on every
          screen. */}
      <AppHeader
        actions={
          <>
            <ActionLink href="/accounts">My accounts</ActionLink>
            <NetworkBadge />
          </>
        }
      />
      <main className={`${PAGE} py-12`}>
        <header>
          <h1 style={TITLE}>
            Set up a protected agent account
          </h1>
          <p className="mt-2" style={{ ...PROSE, maxWidth: '62ch', color: 'var(--dim)' }}>
            Create the account, decide what the agent may spend, then give it permission and funds.
          </p>
        </header>

      <nav aria-label="Setup progress" className="mt-8">
        <ol className="grid grid-cols-12 gap-2">
          {STEPS.map((step) => {
            const done = stageDone(step.id)
            const unlocked = stageUnlocked(step.id)
            const current = activeStage === step.id
            return (
              <li key={step.id} className="col-span-6 md:col-span-3">
                <button
                  type="button" disabled={!unlocked} aria-current={current ? 'step' : undefined}
                  onClick={() => setActiveStage(step.id)}
                  className="motion-press w-full p-3 text-left focus-ring disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ minHeight: 72, borderRadius: 'var(--r-box)',
                    background: current ? 'var(--panel)' : 'transparent',
                    border: `1px solid ${current ? 'var(--line-control)' : 'var(--line)'}`, outlineColor: 'var(--text)' }}
                >
                  <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: done ? 'var(--ok)' : 'var(--dim)' }}>
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

      {/* One region, not two. Both were assertive and adjacent, so a failed
          read and a failed write landing together interrupted each other and
          a reader heard a fragment of each. They say different things --
          §5's "Read failed" and its wallet-rejection line -- and both are
          worth hearing whole. `mt-6` because this is a block between blocks
          (§3); the two `mt-5` it replaces were off the scale. */}
      {(error || restoreNote) && (
        <div role="alert" className="mt-6">
          {error && <p className="text-sm" style={{ color: 'var(--bad)' }}>{error}</p>}
          {restoreNote && (
            <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>{restoreNote}</p>
          )}
        </div>
      )}

      {activeStage === 1 && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 1 of 4</Label>
          <h2 id={STAGE_HEADING_ID} tabIndex={-1} className="mt-2" style={HEADING}>Create your protected account</h2>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            This account holds the agent&apos;s budget. You remain its owner and control every protection setting.
          </p>
          <div className={`${PANEL_GRID} mt-5`}>
            {[
              ['Owner wallet', 'Controls policy and recovery'],
              ['Protected account', 'Holds the spending budget'],
              ['Agent wallet', 'Spends only within policy'],
            ].map(([title, copy]) => (
              <div key={title} className="col-span-12 md:col-span-4 p-3" style={STATUS_BOX}>
                <p style={SUBHEAD}>{title}</p>
                <p className="mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>{copy}</p>
              </div>
            ))}
          </div>
          <details className="mt-5 text-sm" style={{ color: 'var(--dim)' }}>
            <summary className="motion-press control-text cursor-pointer focus-ring"
              style={{ borderRadius: 'var(--r-mark)', color: 'var(--text)', outlineColor: 'var(--text)' }}>
              What you need before creating
            </summary>
            <ul className="mt-3 ml-5 list-disc space-y-2" style={PROSE}>
              <li>
                An owner wallet on Celo with a little CELO for transaction fees.
                Roughly 0.25 CELO covers this whole setup; the owner is permanent,
                so use a wallet you will keep.
              </li>
              <li>
                USDC on Celo for the protected budget and agent gas. The agent
                wallet needs <strong>no CELO at all</strong> — it pays gas in USDC.
              </li>
              <li>
                A separate wallet for your agent. You will paste its{' '}
                <strong>address</strong> here, and later you will need its{' '}
                <strong>private key</strong> to connect an agent runtime — so
                generate one you can export, for example with{' '}
                <code>cast wallet new</code>. Do not use your owner wallet.
              </li>
            </ul>
          </details>
          <div className="mt-5 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
            {!isConnected ? <ConnectButton /> : account ? (
              <div>
                <p className="text-sm" style={{ color: 'var(--ok)' }}>✓ Protected account created</p>
                <div className="mt-2 max-w-full overflow-x-auto">
                  <Address address={account} copy explorer full className="num" />
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
          <h2 id={STAGE_HEADING_ID} tabIndex={-1} className="mt-2" style={HEADING}>Set protection</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            These limits are enforced by the account on Celo, even if the agent&apos;s prompt or code fails.
          </p>
          <div className={`${PANEL_GRID} mt-5`}>
            <label className="col-span-12 md:col-span-6">
              <Label className="block">Maximum per payment</Label>
              <div className="relative mt-2">
                <input className="num field w-full p-3 pr-16" aria-label="Maximum payment in USDC"
                  inputMode="decimal" value={perTx}
                  onChange={(event) => { setPerTx(event.target.value); setLimitsNote(null) }} disabled={limitsBusy} />
                <span className="absolute right-3 top-3 text-sm" style={{ color: 'var(--dim)' }}>USDC</span>
              </div>
            </label>
            <label className="col-span-12 md:col-span-6">
              <Label className="block">Maximum per day</Label>
              <div className="relative mt-2">
                <input className="num field w-full p-3 pr-16" aria-label="Daily spending limit in USDC"
                  inputMode="decimal" value={daily}
                  onChange={(event) => { setDaily(event.target.value); setLimitsNote(null) }} disabled={limitsBusy} />
                <span className="absolute right-3 top-3 text-sm" style={{ color: 'var(--dim)' }}>USDC</span>
              </div>
            </label>
          </div>
          <div className="p-6 mt-4 text-sm" style={STATUS_BOX}>
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
                <h3 style={SUBHEAD}>Recipient protection</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>Optional for direct payments.</p>
              </div>
              <Label>Optional</Label>
            </div>
            <div className={`${PANEL_GRID} mt-4`}>
              <button type="button" aria-pressed={recipientMode === 'any'} disabled={recipientBusy}
                onClick={() => void chooseAnyRecipient()}
                className="motion-press col-span-12 md:col-span-6 p-6 text-left focus-ring disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: recipientMode === 'any' ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span style={SUBHEAD}>Any recipient</span>
                <span className="block mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>Best for agents with changing payees.</span>
              </button>
              <button type="button" aria-pressed={recipientMode === 'protected'} disabled={recipientBusy}
                onClick={() => { setRecipientMode('protected'); setRecipientNote(null) }}
                className="motion-press col-span-12 md:col-span-6 p-6 text-left focus-ring disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: recipientMode === 'protected' ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span style={SUBHEAD}>Approved recipients only</span>
                <span className="block mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>Best when payees are known in advance.</span>
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
                <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
                  Enabling for the first time requires two wallet confirmations: approve the address, then enable protection.
                </p>
              </div>
            )}
            {recipientNote && <p role="status" className="text-sm mt-3" style={{
              color: noteColor(recipientNote,
                'Recipient protection enabled.',
                'Direct payments can now go to any recipient.',
                'That recipient is already approved and protection is already on — nothing to change.'),
            }}>{recipientNote}</p>}
            <p className="text-sm mt-4" style={{ color: 'var(--bad)' }}>
              Recipient protection covers direct account payments only. Funds moved to the agent wallet for gas or x402 are outside this restriction.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
            <Button variant="ghost" onClick={() => setActiveStage(1)}>Back</Button>
            <Button variant="primary" disabled={!limitsConfirmed || !recipientReady || recipientBusy}
              onClick={() => setActiveStage(3)}>Continue to agent</Button>
          </div>
        </Panel>
      )}

      {activeStage === 3 && account && (
        <Panel as="section" className="p-6 mt-6">
          <Label className="block">Step 3 of 4</Label>
          <h2 id={STAGE_HEADING_ID} tabIndex={-1} className="mt-2" style={HEADING}>Add & fund your agent</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Authorize a separate agent wallet, then fund the two balances it needs to operate.
          </p>
          <div className="mt-5">
            <h3 style={SUBHEAD}>1. Authorize agent wallet</h3>
            {!agentAuthorized ? (
              <>
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  The agent can request payments within policy. It cannot change limits, pause the account or recover all funds.
                </p>
                {/* Said here as well as in step 1: someone who created this
                    wallet in a browser extension can finish the whole wizard
                    before discovering that connecting a runtime needs the key,
                    not the address. */}
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  Paste the address. Connecting an agent runtime later needs this
                  wallet&apos;s <strong>private key</strong>, so use one you can
                  export — <code>cast wallet new</code> prints both.
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
              <div className="p-6 mt-3" style={STATUS_BOX}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm" style={{ color: 'var(--ok)' }}>✓ Agent wallet authorized</p>
                  <Address address={agent} copy explorer className="num" />
                </div>
                <div className={`${PANEL_GRID} mt-4`} style={{ ...PROSE, color: 'var(--dim)' }}>
                  <p className="col-span-12 md:col-span-6">✓ Can request policy-checked payments</p>
                  <p className="col-span-12 md:col-span-6">— Cannot change protection settings</p>
                  <p className="col-span-12 md:col-span-6">— Cannot pause or resume the account</p>
                  <p className="col-span-12 md:col-span-6">— Cannot sweep the protected balance</p>
                </div>
              </div>
            )}
            {agentNote && <p role="status" className="text-sm mt-2"
              style={{ color: noteColor(agentNote, 'Agent wallet authorized.',
                'That wallet is already an authorised agent on this account. Nothing was sent.') }}>{agentNote}</p>}
          </div>

          {agentAuthorized && (
            <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 style={SUBHEAD}>2. Fund both balances</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>Each transfer is confirmed separately in your owner wallet.</p>
                </div>
                <Button variant="ghost" disabled={checkingBalances} onClick={() => void refreshBalances()}>
                  {checkingBalances ? 'Checking…' : 'Refresh balances'}
                </Button>
              </div>
              <div className={`${PANEL_GRID} mt-4`}>
                <div className="col-span-12 md:col-span-6 p-6" style={STATUS_BOX}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 style={SUBHEAD}>Protected account</h4>
                    <span style={{ ...LABEL_STYLE, color: readiness.protectedFundsDetected ? 'var(--ok)' : 'var(--dim)' }}>
                      {readiness.protectedFundsDetected ? 'Ready' : 'Required'}
                    </span>
                  </div>
                  <p className="num mt-3" style={{ color: protectedBalanceRead.failed ? 'var(--bad)' : undefined }}>
                    {protectedBalanceRead.text}
                  </p>
                  <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
                    {protectedBalanceRead.failed
                      ? 'Try Refresh balances to read it again.'
                      : 'Spending budget protected by your limits.'}
                  </p>
                  <Label className="block mt-4">Amount to add</Label>
                  <input className="num field w-full mt-2 p-2" aria-label="USDC to add to protected account"
                    inputMode="decimal" value={protectedAmount}
                    onChange={(event) => { setProtectedAmount(event.target.value); setProtectedFundNote(null) }} disabled={fundingTarget !== null} />
                  <Button variant="ghost" className="mt-3" disabled={fundingTarget !== null} onClick={() => void fund('protected')}>
                    {fundingTarget === 'protected' ? 'Sending…' : 'Add protected funds'}
                  </Button>
                  {protectedFundNote && <p className="mt-2"
                    style={{ ...PROSE, color: noteColor(protectedFundNote, 'Protected funds added.') }}>{protectedFundNote}</p>}
                </div>

                <div className="col-span-12 md:col-span-6 p-6" style={STATUS_BOX}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 style={SUBHEAD}>Agent wallet</h4>
                    <span style={{ ...LABEL_STYLE, color: readiness.agentGasReady ? 'var(--ok)' : 'var(--dim)' }}>
                      {readiness.agentGasReady ? 'Ready' : 'Required'}
                    </span>
                  </div>
                  <p className="num mt-3" style={{ color: agentBalanceRead.failed ? 'var(--bad)' : undefined }}>
                    {agentBalanceRead.text}
                  </p>
                  <p className="mt-2" style={{ ...PROSE, color: readiness.agentGasReady ? 'var(--dim)' : 'var(--bad)' }}>
                    {agentBalanceRead.failed ? 'Try Refresh balances to read it again.'
                      : agentBalanceValue === null ? 'USDC pays Celo transaction fees.'
                      : `About ${agentTransactionsLeft} ${agentTransactionsLeft === 1 ? 'transaction' : 'transactions'} available.`}
                  </p>
                  <Label className="block mt-4">USDC for gas</Label>
                  <input className="num field w-full mt-2 p-2" aria-label="USDC to add to agent wallet for gas"
                    inputMode="decimal" value={agentGasAmount}
                    onChange={(event) => { setAgentGasAmount(event.target.value); setAgentFundNote(null) }} disabled={fundingTarget !== null} />
                  <Button variant="ghost" className="mt-3" disabled={fundingTarget !== null} onClick={() => void fund('agent')}>
                    {fundingTarget === 'agent' ? 'Sending…' : 'Add agent gas'}
                  </Button>
                  {agentFundNote && <p className="mt-2"
                    style={{ ...PROSE, color: noteColor(agentFundNote, 'Agent gas added.') }}>{agentFundNote}</p>}
                </div>
              </div>
              <p className="text-sm mt-4" style={{ color: 'var(--bad)' }}>
                Keep only a small gas float in the agent wallet. Those funds are controlled by the agent and are outside recipient protection.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
            <Button variant="ghost" onClick={() => setActiveStage(2)}>Back</Button>
            <Button variant="primary" disabled={!readiness.ready} onClick={() => setActiveStage(4)}>Review setup</Button>
            {!readiness.ready && agentAuthorized && <span style={{ ...PROSE, color: 'var(--dim)' }}>
              Both balances must be ready before the agent can activate.
            </span>}
          </div>
        </Panel>
      )}

      {/* Every stage guard is a conjunction, so any disagreement between
          firstSetupStage's inputs and the readiness this render derives leaves
          no block matching and the body blank -- with steps 3 and 4 disabled by
          stageUnlocked, which is a dead end with no way forward. A truncating
          pre-fill caused exactly that for a sub-cent cap. The cause is fixed
          above; this makes the shape non-fatal. */}
      {activeStage === 4 && !(account && readiness.ready && confirmedLimits) && (
        <Panel as="section" className="p-6 mt-6">
          <p id={STAGE_HEADING_ID} tabIndex={-1} className="text-sm" style={{ color: 'var(--bad)' }}>
            This account&apos;s setup could not be summarised. Go back a step to
            check its limits, agent and balances.
          </p>
          <Button variant="ghost" className="mt-3" onClick={() => setActiveStage(3)}>
            Back to step 3
          </Button>
        </Panel>
      )}

      {activeStage === 4 && account && readiness.ready && confirmedLimits && (
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
              <dd className="mt-1"><Address address={account} copy explorer className="num" /></dd></div>
            <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Agent wallet</dt>
              <dd className="mt-1"><Address address={agent} copy explorer className="num" /></dd></div>
            <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Maximum per payment</dt>
              <dd className="num mt-1">{formatDisplayAmount(confirmedLimits.perTx, DECIMALS, 2)} USDC</dd></div>
            <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Maximum per day</dt>
              <dd className="num mt-1">{formatDisplayAmount(confirmedLimits.daily, DECIMALS, 2)} USDC</dd></div>
            <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Protected balance</dt>
              <dd className="num mt-1">{protectedBalanceRead.text}</dd></div>
            <div className="col-span-12 md:col-span-6"><dt style={{ color: 'var(--dim)' }}>Agent gas</dt>
              <dd className="num mt-1">{agentTransactionsLeft} {agentTransactionsLeft === 1 ? 'transaction' : 'transactions'} available</dd></div>
            <div className="col-span-12"><dt style={{ color: 'var(--dim)' }}>Direct-payment recipients</dt>
              <dd className="mt-1">{recipientProtectionEnabled ? 'Approved addresses only' : 'Any address — recipient protection is not enabled'}</dd></div>
          </dl>
          <div className="mt-6">
            {/* agent is a verified operator by this point: readiness.ready
                gates this whole stage on addAgent's operators() check. */}
            <McpHandoff
              account={account} token={TOKEN}
              operator={isValidAddress(agent) ? agent as `0x${string}` : null}
              defaultOpen
            />
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
              <Button variant="ghost" onClick={() => setActiveStage(3)}>Review funding</Button>
            </div>
          </div>
        </Panel>
      )}
      </main>
    </>
  )
}
