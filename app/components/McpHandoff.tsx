'use client'

import { useState } from 'react'
import {
  ATTRIBUTION_TAG_PLACEHOLDER, buildMcpJson, FEE_ADAPTER, isAttributionTag,
} from '../lib/mcpJson.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'

const GUIDE = 'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md'
const TAG_GUIDE = `${GUIDE}#where-attribution_tag-comes-from`

export default function McpHandoff({ account, token }: {
  account: `0x${string}`
  token: `0x${string}`
}) {
  const [tag, setTag] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const trimmed = tag.trim()
  /**
   * Derived here, never accepted as a prop.
   *
   * It WAS a prop, and that is precisely what let two callers disagree about
   * one block: /setup substituted the placeholder, the landing page did not,
   * and the component's own doc claimed the component did (a46fa52). Three
   * accounts of one behaviour, two of them wrong. isAttributionTag is the
   * single rule -- the same regex mcp/src/config.ts checks at startup -- and
   * displayTag inside buildMcpJson decides what actually reaches the file, so
   * this value only chooses which sentence to print.
   */
  const tagStatus = trimmed === '' ? 'missing'
    : isAttributionTag(trimmed) ? 'ok' : 'invalid'

  const block = buildMcpJson({
    account, token, feeAdapter: FEE_ADAPTER, attributionTag: trimmed,
  })

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Add this to your agent&apos;s .mcp.json</Label>
      <h3 className="mt-2 text-sm font-semibold">Connect your agent runtime</h3>
      <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
        Optional — your account is already protected and working without it.
      </p>

      <pre
        className="num text-xs mt-4 p-3 overflow-x-auto"
        style={{ background: 'var(--well)', borderRadius: 4 }}
      >
        {block}
      </pre>

      <Button
        variant="primary"
        className="mt-3"
        onClick={() => {
          void (async () => {
            try {
              // Await the write: a denied permission, an insecure context, or
              // an unfocused document all reject silently otherwise, and
              // "Copied" would be a lie about the one artifact this task
              // exists to deliver.
              await navigator.clipboard.writeText(block)
              setCopyFailed(false)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              setCopied(false)
              setCopyFailed(true)
            }
          })()
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {copyFailed && (
        <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
          Copy failed — select the block and copy manually.
        </p>
      )}

      <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
        {/* Label renders a styled span, not a <label>, so the input carries
            its own aria-label -- the pattern the rest of the wizard uses. */}
        <Label className="block">Attribution tag (optional)</Label>
        <input
          className="num field w-full mt-2 p-3"
          aria-label="Attribution tag"
          placeholder={ATTRIBUTION_TAG_PLACEHOLDER}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
        {tagStatus === 'ok' && (
          <p className="text-sm mt-2" style={{ color: 'var(--ok)' }}>
            ✓ That is the shape the server accepts. It is in the block above.
          </p>
        )}
        {tagStatus === 'invalid' && (
          <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
            That is not the shape of an attribution tag, so the block above
            still carries the placeholder rather than your value. It must be{' '}
            <code>celo_</code> and exactly twelve lowercase hex characters. The
            MCP server checks the same rule at startup and exits before your
            agent&apos;s first tool call, which surfaces only as
            &ldquo;server failed to connect&rdquo;.
          </p>
        )}
        {tagStatus === 'missing' && (
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Leave it blank and the block carries{' '}
            <code>{ATTRIBUTION_TAG_PLACEHOLDER}</code>, which the server
            refuses on purpose — a placeholder it would accept looks configured
            and then misattributes every transaction. Registering with Celo
            Builders issues one; outside a hackathon,{' '}
            <code>printf &apos;celo_%s\n&apos; &quot;$(openssl rand -hex 6)&quot;</code>{' '}
            is enough.{' '}
            <a href={TAG_GUIDE} target="_blank" rel="noreferrer"
              style={{ color: 'var(--text)', textDecoration: 'underline' }}>
              Where tags come from
            </a>
          </p>
        )}
      </div>

      <p className="text-sm mt-5" style={{ color: 'var(--bad)' }}>
        Replace <code>OPERATOR_PK</code> with your agent wallet&apos;s private key
        yourself. This site never asks for it and never sees it. It is a hot key:
        whoever holds it can spend up to your limits.
      </p>
      <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
        This runs the published <code>leash-agentpay</code> package through{' '}
        <code>npx</code>. Node.js 20 or newer is required.{' '}
        <a href={GUIDE} target="_blank" rel="noreferrer"
          style={{ color: 'var(--text)', textDecoration: 'underline' }}>
          Full setup guide
        </a>
      </p>
    </Panel>
  )
}
