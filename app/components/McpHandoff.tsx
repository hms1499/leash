'use client'

import { useState } from 'react'
import { buildMcpJson, type McpHandoff as Handoff } from '../lib/mcpJson.js'

export default function McpHandoff({
  handoff, tagStatus = 'ok',
}: {
  handoff: Handoff
  /**
   * Whether ATTRIBUTION_TAG in the block above is real. 'missing' and
   * 'invalid' both ship the `celo_yourtag` placeholder, but they are
   * different mistakes: one person has not filled the field in, the other
   * believes they have.
   */
  tagStatus?: 'ok' | 'missing' | 'invalid'
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const block = buildMcpJson(handoff)

  return (
    <div className="panel p-4">
      <p className="label">Add this to your agent&apos;s .mcp.json</p>
      <pre
        className="num text-xs mt-2 p-3 overflow-x-auto"
        style={{ background: 'var(--well)', borderRadius: 4 }}
      >
        {block}
      </pre>
      <button
        className="btn-primary mt-3"
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
      </button>
      {copyFailed && (
        <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
          Copy failed — select the block and copy manually.
        </p>
      )}
      <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
        Replace <code>OPERATOR_PK</code> with your agent wallet&apos;s private key
        yourself. This site never asks for it and never sees it. It is a hot key:
        whoever holds it can spend up to your limits.
      </p>
      {tagStatus === 'missing' && (
        <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
          You left the attribution tag blank, so <code>ATTRIBUTION_TAG</code> is
          the placeholder <code>celo_yourtag</code>. Replace it with your own tag
          before running your agent — leaving it in silently voids your x402
          attribution; nothing errors, the leaderboard simply reads zero.
        </p>
      )}
      {tagStatus === 'invalid' && (
        <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
          That is not the shape of an attribution tag, so the block above still
          carries the placeholder rather than your value. The MCP server checks
          the same rule at startup and exits before your agent&apos;s first
          tool call, which surfaces only as &ldquo;server failed to
          connect&rdquo;.
        </p>
      )}
      <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
        Point <code>args</code> at your own checkout of the Leash repository.
      </p>
    </div>
  )
}
