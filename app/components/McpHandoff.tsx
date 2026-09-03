'use client'

import { useState } from 'react'
import { buildMcpJson, type McpHandoff as Handoff } from '../lib/mcpJson.js'

export default function McpHandoff({ handoff }: { handoff: Handoff }) {
  const [copied, setCopied] = useState(false)
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
          void navigator.clipboard.writeText(block)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
        Replace <code>OPERATOR_PK</code> with your agent wallet&apos;s private key
        yourself. This site never asks for it and never sees it. It is a hot key:
        whoever holds it can spend up to your limits.
      </p>
      <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
        Point <code>args</code> at your own checkout of the Leash repository.
      </p>
    </div>
  )
}
