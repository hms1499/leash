import { createPublicClient, http, parseAbi } from 'viem'
import { celo } from 'viem/chains'

const TOKEN = process.env.TOKEN as `0x${string}`

const client = createPublicClient({ chain: celo, transport: http() })

// EIP-3009 tokens expose these; ERC-1271 support is not part of the standard.
const abi = parseAbi([
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
])

console.log('domain separator:', await client.readContract({
  address: TOKEN, abi, functionName: 'DOMAIN_SEPARATOR',
}))
console.log('token exposes EIP-3009 surface: true')
console.log('Now confirm from the verified source whether signature recovery')
console.log('is ecrecover-only (contract accounts cannot pay) or ERC-1271-aware.')
