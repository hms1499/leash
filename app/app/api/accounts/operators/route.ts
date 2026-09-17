import { NextResponse } from 'next/server'
import { isValidAddress } from '../../../../lib/address.js'
import { etherscanLogsUrl, operatorChangesFromExplorer } from '../../../../lib/agentDiscovery.js'
import { liveOperators, type OperatorChange } from '../../../../lib/feed.js'

type ExplorerResponse = {
  status?: string
  message?: string
  result?: unknown
}

const PAGE_SIZE = 1000
const MAX_PAGES = 10

/**
 * Who this account has authorised, newest first, revoked ones excluded.
 * Candidates only: the caller checks each against operators().
 * Same shape and same key as /api/accounts/discover.
 */
export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account') ?? ''
  if (!isValidAddress(account)) {
    return NextResponse.json({ error: 'A valid account address is required.' }, { status: 400 })
  }

  // Server-only, as in the discover route: the key is the product's rate limit.
  const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.CELOSCAN_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Operator discovery is not configured.',
      code: 'DISCOVERY_NOT_CONFIGURED',
    }, { status: 503 })
  }

  try {
    const changes: OperatorChange[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetch(etherscanLogsUrl(account, apiKey, page), {
        headers: { accept: 'application/json' },
        next: { revalidate: 60 },
      })
      if (!response.ok) throw new Error(`Explorer returned ${response.status}`)
      const body = await response.json() as ExplorerResponse
      // Measured 2026-09-17: an account with no such logs answers exactly this.
      if (body.status === '0' && body.message === 'No records found') break
      if (body.status !== '1' || !Array.isArray(body.result)) {
        throw new Error(typeof body.result === 'string' ? body.result : 'Invalid explorer response')
      }
      changes.push(...operatorChangesFromExplorer(body.result, account))
      if (body.result.length < PAGE_SIZE) break
    }
    return NextResponse.json({ operators: liveOperators(changes) }, {
      // Short: a just-authorised agent is remembered locally by the tab that
      // authorised it; this serves the other devices.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch {
    return NextResponse.json({ error: 'Celo operator history is temporarily unavailable.' }, { status: 502 })
  }
}
