import { NextResponse } from 'next/server'
import { isValidAddress } from '../../../../lib/address.js'
import {
  deploymentCandidates,
  etherscanTransactionsUrl,
  type ExplorerTransaction,
} from '../../../../lib/accountDiscovery.js'

type ExplorerResponse = {
  status?: string
  message?: string
  result?: unknown
}

const PAGE_SIZE = 1000
const MAX_PAGES = 10

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get('owner') ?? ''
  if (!isValidAddress(owner)) {
    return NextResponse.json({ error: 'A valid owner address is required.' }, { status: 400 })
  }

  // This must stay server-only. An explorer key is not a signing secret, but
  // exposing it would let anyone consume the product's rate limit.
  const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.CELOSCAN_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Account discovery is not configured.',
      code: 'DISCOVERY_NOT_CONFIGURED',
    }, { status: 503 })
  }

  try {
    const transactions: ExplorerTransaction[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetch(etherscanTransactionsUrl(owner, apiKey, page), {
        headers: { accept: 'application/json' },
        next: { revalidate: 300 },
      })
      if (!response.ok) throw new Error(`Explorer returned ${response.status}`)
      const body = await response.json() as ExplorerResponse
      if (body.status === '0' && body.message === 'No transactions found') break
      if (body.status !== '1' || !Array.isArray(body.result)) {
        throw new Error(typeof body.result === 'string' ? body.result : 'Invalid explorer response')
      }
      transactions.push(...body.result as ExplorerTransaction[])
      if (body.result.length < PAGE_SIZE) break
    }

    const accounts = deploymentCandidates(transactions, owner)
    return NextResponse.json({
      accounts,
      // Ten full pages means the history was deliberately bounded. A known
      // account remains directly reachable through its address route.
      historyTruncated: transactions.length >= PAGE_SIZE * MAX_PAGES,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ error: 'Celo account history is temporarily unavailable.' }, { status: 502 })
  }
}
