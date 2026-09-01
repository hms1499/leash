import { createPublicClient, http, parseAbi } from 'viem'
import { celo } from 'viem/chains'

const DIRECTORY = process.env.FEE_CURRENCY_DIRECTORY as `0x${string}`
if (!DIRECTORY) throw new Error('set FEE_CURRENCY_DIRECTORY')

const abi = parseAbi([
  'function getCurrencies() view returns (address[])',
])

const client = createPublicClient({ chain: celo, transport: http() })

const currencies = await client.readContract({
  address: DIRECTORY,
  abi,
  functionName: 'getCurrencies',
})

console.log('whitelisted fee currencies:', currencies)
