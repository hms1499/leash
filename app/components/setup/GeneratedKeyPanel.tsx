'use client'

import { useState } from 'react'
import Label from '../ui/Label'
import Button from '../ui/Button'
import { DATA, PROSE } from '../ui/prose'
import { STATUS_BOX } from './chrome.js'

/**
 * The private key of a wallet this tab generated, shown for as long as the tab
 * is open.
 *
 * Rendered in step 3, where it is made, and again in step 4, where the reader
 * copies the .mcp.json it belongs in. Sending them back a step to fetch a
 * secret they were shown once is how a secret gets written somewhere worse.
 *
 * It is NOT passed to McpHandoff: the dashboard renders that same component
 * for accounts whose keys this app has never held, and a prop would invite a
 * caller to fill it.
 */
export default function GeneratedKeyPanel({ privateKey }: { privateKey: `0x${string}` }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  return (
    <div className="p-6 mt-6" style={{ ...STATUS_BOX, borderColor: 'var(--bad)' }}>
      <Label className="block">Agent private key — shown once</Label>
      {/* .num for the same reason every other key-shaped value on this page
          carries it: tabular-nums, and a 66-character token that must not
          reflow. break-all because it has nowhere legal to break. */}
      <p className="num mt-3 break-all" style={{ ...DATA, color: 'var(--text)' }}>{privateKey}</p>
      <Button
        variant="ghost"
        className="mt-3"
        onClick={() => {
          void (async () => {
            try {
              // Awaited for the same reason McpHandoff awaits its copy: a
              // denied permission or an insecure context rejects silently, and
              // "Copied" would be a lie about a value the reader cannot get back.
              await navigator.clipboard.writeText(privateKey)
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
        {copied ? 'Copied' : 'Copy key'}
      </Button>
      {copyFailed && (
        <p className="mt-2" style={{ ...PROSE, color: 'var(--bad)' }}>
          Copy failed — select the key above and copy it manually.
        </p>
      )}
      <p className="mt-6" style={{ ...PROSE, color: 'var(--dim)' }}>
        Generated in this browser and sent nowhere. It is not saved — close or
        reload this tab and it is gone, and no one can recover it for you. Save
        it now, then paste it into <code>OPERATOR_PK</code> when you set up your
        agent runtime.
      </p>
      <p className="mt-2" style={{ ...PROSE, color: 'var(--bad)' }}>
        This is a hot key: whoever holds it can spend up to your limits. It
        cannot change those limits, pause the account, or take the protected
        balance.
      </p>
    </div>
  )
}
