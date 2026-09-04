import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { createConfig, injected } from 'wagmi'

export const RPC_URL =
  process.env.NEXT_PUBLIC_CELO_RPC_URL ?? 'https://forno.celo.org'

/** Read path. Used by every page, including with no wallet connected. */
export const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC_URL),
})

/**
 * Injected only, and no wallet-selection modal.
 *
 * MiniPay is an in-app browser that injects window.ethereum itself; a modal
 * asking which wallet to use is both wrong there and a recognisable template
 * everywhere else.
 */
export const wagmiConfig = createConfig({
  chains: [celo],
  connectors: [injected()],
  transports: { [celo.id]: http(RPC_URL) },
  // Required under the App Router. Without it wagmi rehydrates its persisted
  // connection synchronously during render, so a returning visitor whose
  // wallet was already connected gets a hydration mismatch the first time a
  // component branches on `isConnected`.
  ssr: true,
})

/** True inside the MiniPay in-app browser, which auto-connects. */
export function isMiniPay(): boolean {
  if (typeof window === 'undefined') return false
  const eth = (window as { ethereum?: { isMiniPay?: boolean } }).ethereum
  return Boolean(eth?.isMiniPay)
}

/**
 * Every write in this app is a transaction against a contract on Celo. wagmi
 * will not assert this for us: writeContract/deployContract call
 * getConnectorClient with assertChainId:false and pass `chain: null` to viem
 * unless an explicit chainId is given, so a wallet left on another network
 * signs and broadcasts there. Passing this to every write turns that into a
 * clean rejection; the callers check it first so the message can say what to
 * do about it.
 */
export const REQUIRED_CHAIN_ID = celo.id

/**
 * Explicit gas limit for the deployment, because a browser wallet asked to
 * estimate one may simply fail.
 *
 * Measured 2026-09-04: OKX Wallet on Celo showed "Network fee estimation
 * unsuccessful", a Network fee of `--`, and a Confirm button that could not be
 * pressed. The request it received carried only `data` and `from` -- viem adds
 * nothing Celo-specific, and the transaction itself is sound: `cast estimate
 * --create` and viem's `estimateGas` both returned 797,607 for it against
 * mainnet, from that same wallet, which held 12.5 CELO. With no `gas` in the
 * request the wallet had nothing to fall back on when its own estimator came
 * back empty, so a working deployment was unreachable.
 *
 * 1,200,000 is the measured 797,607 with half again as much room. Unused gas
 * is refunded, so an over-estimate costs nothing; `sdk/src/policyClient.ts`
 * carries the same reasoning and the price of getting it wrong.
 */
export const DEPLOY_GAS = 1_200_000n

export const WRONG_NETWORK =
  'Your wallet is on another network. Switch it to Celo — the badge in the header does it — and try again.'
