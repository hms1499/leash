import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export type GeneratedAgentWallet = {
  address: `0x${string}`
  privateKey: `0x${string}`
}

/**
 * A fresh keypair for the agent, made in the reader's browser.
 *
 * This replaces `cast wallet new`, which the wizard used to print in two
 * places. `cast` is Foundry, docs/quickstart.md never installs it, and its
 * eight steps are Node, npx, Claude Code, a folder, the JSON, the key, start,
 * check -- so a reader who did exactly as told met `command not found: cast`
 * with nothing to do about it, after five mainnet transactions they had
 * already paid for. That is the worst place in the funnel to put a wall.
 *
 * Generating it here is a deliberate loosening of what mcpJson.ts called "the
 * one value this app must never learn", and it is worth being exact about what
 * was traded:
 *
 * - The key is made by `crypto.getRandomValues` inside the tab and never
 *   crosses the network. No route, no server component, no log sees it.
 * - It never goes into localStorage, so it survives exactly as long as the
 *   tab does. The UI says "shown once" and agentKey.test.ts holds that to it.
 * - It never reaches the copied `.mcp.json`. The user still pastes it in
 *   themselves, which is the moment they learn that file is now a secret.
 * - What it does cost: a key that used to exist only on the user's disk now
 *   exists in a page that loads wagmi and viem. An XSS or a poisoned
 *   dependency could reach it. The mitigation is the product itself -- this
 *   key is deliberately low-value, holding gas money and no authority beyond
 *   asking the contract to spend inside a policy the owner set.
 *
 * Anyone who already has a wallet keeps the paste-an-address path. This is an
 * offer, not a funnel.
 */
export function generateAgentWallet(): GeneratedAgentWallet {
  const privateKey = generatePrivateKey()
  return { address: privateKeyToAccount(privateKey).address, privateKey }
}

/**
 * A generated key, and the owner wallet that was connected when it was made.
 *
 * Held with its wallet for the reason lib/walletNote.ts gives: React does not
 * remount on an account switch, so state outlives the wallet it was about.
 */
export type HeldAgentKey = { privateKey: `0x${string}`; wallet: string } | null

/**
 * The key to put on screen, or null.
 *
 * Both checks are needed. The wallet check keeps it from the next person at a
 * shared browser. The agent check keeps it from sitting beside an agent it
 * does not control -- the restore path replaces `agent` on a wallet switch,
 * and a key shown beside the wrong address gets pasted into OPERATOR_PK.
 */
export function keyToShow(
  held: HeldAgentKey,
  connected: string | null | undefined,
  agent: string,
): `0x${string}` | null {
  if (!held || !connected || !agent) return null
  if (held.wallet.toLowerCase() !== connected.toLowerCase()) return null
  const controls = privateKeyToAccount(held.privateKey).address
  return controls.toLowerCase() === agent.toLowerCase() ? held.privateKey : null
}
