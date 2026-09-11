'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import McpHandoff from '../../../components/McpHandoff'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import NetworkBadge from '../../../components/NetworkBadge'
import AppHeader from '../../../components/ui/AppHeader'
import Label from '../../../components/ui/Label'
import Panel from '../../../components/ui/Panel'
import Button from '../../../components/ui/Button'
import Shell from '../../../components/ui/Shell'
import { PAGE } from '../../../components/ui/page'
import LimitsDrawer from '../../../components/LimitsDrawer'
import StopButton from '../../../components/StopButton'
import AgentPanel from '../../../components/AgentPanel'
import AgentAccessPanel from '../../../components/AgentAccessPanel'
import AccountSwitcher from '../../../components/AccountSwitcher'
import { AccountOverview, SecurityPolicy } from '../../../components/DashboardOverview'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress } from '../../../lib/address.js'
import { canEdit } from '../../../lib/policy.js'
import { publicClient } from '../../../lib/chain.js'
import { accountDeployBlock, migrateLegacyAccount } from '../../../lib/accountRegistry.js'
import { readLocal } from '../../../lib/browserStorage.js'

// USDC on Celo mainnet. The token the policy is denominated in; the UI treats
// stablecoins as 1:1 with the dollar, and that assumption lives here in the UI
// and never in the contract.
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const SYMBOL = 'USDC'
const DEMO_ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'
const DEMO_OPERATOR = '0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6'

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

  // The deploy receipt's block is the correct floor for a log scan. It lives
  // on the account's registry entry; the legacy singleton is migrated first.
  //
  // The spec also says this can be "carried in the URL". It deliberately is
  // not: a `?fromBlock=` a stranger controls could hide every spend from
  // whoever opened the link, which is the same attacker-controllable-input
  // shape the operator check already refuses to trust.
  //
  // Read in an effect, not during render: localStorage does not exist on the
  // server and touching it in the render body is a hydration mismatch.
  const [deployBlock, setDeployBlock] = useState<bigint | undefined>(undefined)
  const { address: connected } = useAccount()
  useEffect(() => {
    try {
      const owner = state.owner ?? connected
      if (owner) migrateLegacyAccount(localStorage, owner)
      setDeployBlock(accountDeployBlock(localStorage, owner, address))
    } catch {
      // A browser with storage blocked simply scans the whole window.
    }
  }, [address, connected, state.owner])

  const feed = useFeed(address, TOKEN, deployBlock)
  const isOwner = canEdit(state.owner, connected)
  const [agentTransactionsLeft, setAgentTransactionsLeft] = useState<number | null>(null)
  const updateAgentGasStatus = useCallback((left: number | null) => {
    setAgentTransactionsLeft(left)
  }, [])

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
  // A LIST, not one address. `operators` is a mapping and cannot be
  // enumerated, so this is assembled from OperatorChanged history and then
  // verified entry by entry against operators() -- see the effect below.
  const [operators, setOperators] = useState<readonly `0x${string}`[]>([])
  const [operatorCheckFailed, setOperatorCheckFailed] = useState(false)
  const [operatorResolving, setOperatorResolving] = useState(true)

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
      // readLocal, not localStorage: storage THROWS rather than returning
      // null in Safari private mode and blocked third-party contexts. Raw, it
      // rejected resolve() before its own try block, so none of the three
      // setState calls below ever ran -- operatorResolving stayed true and the
      // panel said "Checking operator access on chain…" forever, with no error
      // path and no retry.
      const fromSetup = readLocal(`leash.agent.${address.toLowerCase()}`)
      // The public proof account is intentionally a stable product fixture.
      // Its grant event eventually falls outside the 24-hour activity window,
      // so keep its candidate beside the account constant. This is not trusted
      // authorization: operators() below still verifies it on every load.
      const fromPublicProof = address.toLowerCase() === DEMO_ACCOUNT.toLowerCase()
        ? DEMO_OPERATOR
        : null
      // A spend proves the operator is real and working, so it wins. Failing
      // that, who the owner authorised: without this an account set up but not
      // yet used — what the wizard leaves behind — never showed its agent at
      // all. The query parameter stays last and stays untrusted; operators()
      // below is what decides, either way.
      // Deduplicated case-insensitively: the same address routinely arrives
      // from several of these at once -- a spend row, the wizard's note of it,
      // and the OperatorChanged log that authorised it are all the same wallet.
      const seen = new Set<string>()
      const candidates: `0x${string}`[] = []
      for (const value of [...feed.operatorCandidates, fromFeed, fromSetup, fromPublicProof, fromQuery]) {
        if (typeof value !== 'string' || !isValidAddress(value)) continue
        const key = value.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        candidates.push(value)
      }
      if (candidates.length === 0) {
        if (!cancelled) {
          setOperators([])
          setOperatorCheckFailed(false)
          setOperatorResolving(false)
        }
        return
      }
      if (!cancelled) setOperatorResolving(true)
      try {
        // Every candidate is checked, and the order is preserved:
        // feed.operatorCandidates is newest-authorisation-first, so the first
        // survivor is the one a single-agent account expects to see.
        const verified = await Promise.all(candidates.map(async (candidate) => ({
          candidate,
          ok: await publicClient.readContract({
            address, abi: OPERATOR_ABI, functionName: 'operators', args: [candidate],
          }) as boolean,
        })))
        if (cancelled) return
        const next = verified.filter((v) => v.ok).map((v) => v.candidate)
        // Keep the previous array when nothing changed. This effect re-runs on
        // every feed poll, and a fresh array each time would hand every
        // downstream consumer a new identity four times a second for a value
        // that did not move.
        setOperators((prev) =>
          prev.length === next.length && prev.every((o, i) => o === next[i]) ? prev : next)
        setOperatorCheckFailed(false)
        setOperatorResolving(false)
      } catch {
        // Fail closed, and closed means EMPTY: a failed check must never
        // render the panel as if it had verified an address, since that is
        // exactly the phishing shape this check exists to prevent. Promise.all
        // rejects on the first failure, so a partially-read list is not a
        // list -- setOperatorCheckFailed starts the 8-second retry above.
        if (!cancelled) {
          setOperators([])
          setOperatorCheckFailed(true)
          setOperatorResolving(false)
        }
      }
    }
    // Fail closed on anything resolve() did not anticipate. A rejected
    // resolve() left every one of its setState calls unmade, which renders as
    // "still checking" and never resolves. setOperatorCheckFailed(true) is
    // what starts the 8-second retry above, so a transient failure heals.
    void resolve().catch(() => {
      if (cancelled) return
      setOperators([])
      setOperatorCheckFailed(true)
      setOperatorResolving(false)
    })
    return () => { cancelled = true }
    // operatorCandidates belongs here: on an account that has been configured
    // but never used it is the only thing that changes, so leaving it out
    // would keep the panel hidden for exactly the case it was added for. It is
    // a new array each render, so it is joined into a string to compare by
    // value -- an array identity would re-run this effect on every feed poll.
  }, [feed.rows, feed.operatorCandidates.join(','), address, retry])

  // Gas is a property of one wallet, so the panel below reads operators[0].
  const gasOperator = operators[0] ?? null
  useEffect(() => {
    setAgentTransactionsLeft(null)
  }, [gasOperator])

  // History may still be backfilling after a candidate has already passed
  // operators(). Once the operator is verified, activity loading must not
  // keep the whole account stuck in a misleading "Verifying" state.
  const operatorLoading = operators.length === 0 && (feed.isLoading || operatorResolving)

  return (
    <main>
      {/* Everything on this band obeys the bright-ground rule: --bg only.
          Mixing --text at 3.16 with --bg at 5.10 was the state this was left
          in when the invisible-badge bug was fixed in a hurry. AppHeader
          propagates the ground to the brand so nothing here re-derives it. */}
      <AppHeader
        band={state.paused ? 'danger' : 'panel'}
        actions={
          <>
            <AccountSwitcher current={address} />
            {connected && <NetworkBadge onDangerBand={state.paused} />}
            {isOwner && (
              <StopButton
                account={address}
                paused={state.paused}
                isOwner={isOwner}
                loading={state.isLoading}
                onChanged={state.refetch}
              />
            )}
            <ConnectButton />
          </>
        }
      />

      {state.error && state.updatedAt === null ? (
        <div className={`${PAGE} py-6`} role="alert">
          <Panel className="p-6">
            <Label className="block" style={{ color: 'var(--bad)' }}>
              Could not read this protected account
            </Label>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Celo did not return a complete account state. The account may still
              be active, so no balance or spending limit is shown as zero.
            </p>
            <Button variant="ghost" className="mt-3" onClick={state.refetch}>
              Try again
            </Button>
          </Panel>
        </div>
      ) : (
        <>
          <div className={`${PAGE} py-6 space-y-3`}>
            {state.error && state.updatedAt !== null && (
              <div role="alert">
                <Panel className="p-4">
                  <p className="text-sm" style={{ color: 'var(--bad)' }}>
                    Could not refresh the account. Showing the last confirmed values.
                  </p>
                </Panel>
              </div>
            )}
            <AccountOverview
              account={address}
              owner={state.owner}
              connected={connected}
              paused={state.paused}
              loading={state.isLoading}
              updatedAt={state.updatedAt}
              daily={state.daily}
              perTx={state.perTx}
              balance={state.balance}
              allowlistEnabled={state.allowlistEnabled}
              operator={gasOperator}
              operatorLoading={operatorLoading}
              agentTransactionsLeft={agentTransactionsLeft}
            />
          </div>

          {/* Keep the dominant figure aligned with the dashboard column. A
              previous full-bleed band made empty/error states look like their
              background had escaped the component. */}
          <div className={PAGE}>
            <div
              data-testid="spending-meter-card"
              className="overflow-hidden"
              style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-surface)' }}
            >
              <Meter
                daily={state.daily}
                remaining={state.remaining}
                perTx={state.perTx}
                decimals={DECIMALS}
                symbol={SYMBOL}
                balance={state.balance}
                allowlistEnabled={state.allowlistEnabled}
                paused={state.paused}
                loading={state.isLoading}
                dominant
              />
            </div>
          </div>

          <div className={`${PAGE} py-6 space-y-3`}>
            <div id="policy-controls" className="scroll-mt-6 space-y-3">
              {!state.isLoading && (
                <SecurityPolicy
                  daily={state.daily}
                  perTx={state.perTx}
                  allowlistEnabled={state.allowlistEnabled}
                  decimals={DECIMALS}
                  symbol={SYMBOL}
                />
              )}
              {isOwner && (
                <LimitsDrawer
                  account={address}
                  token={TOKEN}
                  decimals={DECIMALS}
                  symbol={SYMBOL}
                  perTx={state.perTx}
                  daily={state.daily}
                  allowlistEnabled={state.allowlistEnabled}
                  loading={state.isLoading}
                  onSaved={state.refetch}
                />
              )}
            </div>
            <div id="agent-management" className="scroll-mt-6 space-y-3">
              <AgentAccessPanel
                account={address}
                operators={operators}
                operatorLoading={operatorLoading}
                isOwner={isOwner}
                onAgentGranted={(next) => {
                  setOperators((prev) => (prev.includes(next) ? prev : [next, ...prev]))
                  state.refetch()
                }}
                onAgentRevoked={(gone) => {
                  setOperators((prev) => prev.filter((o) => o.toLowerCase() !== gone.toLowerCase()))
                  state.refetch()
                }}
              />
              {gasOperator && isValidAddress(gasOperator) && (
                <div id="agent-funds" className="scroll-mt-6">
                  <AgentPanel
                    account={address} operator={gasOperator} token={TOKEN}
                    decimals={DECIMALS} symbol={SYMBOL} isOwner={isOwner}
                    protectedBalance={state.balance}
                    onRefuelled={state.refetch}
                    onGasStatusChange={updateAgentGasStatus}
                  />
                </div>
              )}
              {/* Owner only, and isOwner comes from owner() read off the chain
                  by useAccountState -- never from ?operator=, which is
                  attacker-controllable. A visitor cannot use this block
                  anyway: it needs the operator's private key. gasOperator has
                  been through operators(), so it is safe to name. */}
              {isOwner && (
                <McpHandoff
                  account={address} token={TOKEN}
                  operator={gasOperator}
                />
              )}
            </div>
            {operators.length === 0 && operatorCheckFailed && (
              <Label className="block" style={{ color: 'var(--bad)' }}>
                Could not verify the agent wallet — still trying.
              </Label>
            )}
            {/* The heading moved inside Feed: five branches each built their
                own Panel, so a heading out here could not align with any of
                them -- at 375px it sat on the page gutter while the panel's
                content sat 24px further in. */}
            <section className="pt-3">
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
            </section>
          </div>
        </>
      )}
    </main>
  )
}
