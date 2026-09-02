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
import { fetchTool } from './tools/fetch.js'

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
    {
      name: 'leash_fetch',
      description:
        'Call an HTTP resource that charges per request over x402, paying from the agent wallet. Funds are drawn through the on-chain policy first, so a request the policy refuses never happens. Use quote_only to see the price without paying.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The 402-gated URL.' },
          method: { type: 'string', description: 'HTTP method. Defaults to POST.' },
          body: { type: 'string', description: 'Raw JSON request body as a string. The body sets the price.' },
          max_amount: { type: 'string', description: 'Ceiling in whole token units, e.g. "0.05". A higher quote is refused.' },
          quote_only: { type: 'boolean', description: 'Return the price without paying.' },
        },
        required: ['url', 'max_amount'],
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
      case 'leash_fetch': {
        const { quote, payForResource } = await import('@leash/sdk')
        return toolOk(await fetchTool(
          {
            config,
            quote: (a) => quote(a),
            payForResource: async (a) => payForResource({
              ...a,
              leash,
              account,
              feeBalances: await feeBalances(),
            }),
          },
          req.params.arguments as never,
        ))
      }
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
