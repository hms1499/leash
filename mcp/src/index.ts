#!/usr/bin/env -S npx tsx
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { privateKeyToAccount } from 'viem/accounts'
import { LeashClient } from '@leash/sdk'
import { loadConfig } from './config.js'
import { toolError, toolOk } from './errors.js'
import { statusTool } from './tools/status.js'
import { payTool } from './tools/pay.js'

const config = loadConfig(process.env)
const account = privateKeyToAccount(config.operatorPk)
const leash = new LeashClient({
  account,
  accountAddress: config.accountAddress,
  attributionTag: config.attributionTag,
  rpcUrl: config.rpcUrl,
})

/**
 * The operator's real balance of the fee adapter.
 *
 * Read rather than assumed: `pickFeeAdapter` picks the adapter with the largest
 * balance and throws `NoFundedFeeAdapterError` when every one is empty, so
 * handing it a made-up figure would turn "the wallet cannot pay for gas" into a
 * transaction that fails at the node instead. Adapters answer `balanceOf` and
 * rescale to 18 decimals; see T0.1 in `spikes/README.md`.
 */
async function feeBalances(): Promise<ReadonlyMap<`0x${string}`, bigint>> {
  return new Map([[config.feeAdapter, await leash.operatorBalance(config.feeAdapter)]])
}

const server = new Server(
  { name: 'leash', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'leash_status',
      description:
        'Report the agent wallet: remaining daily allowance, caps, balances, and when the allowance resets. Call this before spending.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'leash_pay',
      description:
        'Pay a Celo address from the agent wallet. The on-chain policy enforces a per-transaction cap, a daily cap and, when enabled, a payee allowlist. A refusal returns the numbers needed to retry correctly.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient Celo address, 0x-prefixed.' },
          amount: { type: 'string', description: 'Amount in whole token units, e.g. "0.25".' },
        },
        required: ['to', 'amount'],
        additionalProperties: false,
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    switch (req.params.name) {
      case 'leash_status':
        return toolOk(await statusTool({ leash: leash as never, config }))
      case 'leash_pay':
        return toolOk(await payTool(
          { leash: leash as never, config, feeBalances: await feeBalances() },
          req.params.arguments as { to: string; amount: string },
        ))
      default:
        return toolError('unknown_tool', `no tool named ${req.params.name}`)
    }
  } catch (err) {
    return toolError(
      'internal_error',
      err instanceof Error ? err.message : String(err),
      { suggestion: 'Check the server logs and the LEASH_* environment variables.' },
    )
  }
})

await server.connect(new StdioServerTransport())
