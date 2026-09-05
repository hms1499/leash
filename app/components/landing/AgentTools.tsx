import Panel from '../ui/Panel'
import { PROSE } from '../ui/prose'
import McpHandoff from '../McpHandoff'
import type { McpHandoff as Handoff } from '../../lib/mcpJson.js'

/** The live demo account, so the block a reader copies is real except for the
 *  two values only they can supply: their agent's key and their own tag. */
const SAMPLE: Handoff = {
  account: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: '',
}

const TOOLS = [
  { name: 'leash_status', body: 'What is left today, what the caps are, when the allowance resets.' },
  { name: 'leash_pay', body: 'Pay a Celo address. Refused past the caps, and the refusal explains itself.' },
  { name: 'leash_fetch', body: 'Call an API that charges per request over x402 and pay for it. Quote first, with a ceiling you set.' },
]

export default function AgentTools() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <Panel key={t.name} className="p-6">
            <p className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--celo)' }}>{t.name}</p>
            <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{t.body}</p>
          </Panel>
        ))}
      </div>
      <p style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>
        That is the whole surface. Nothing here raises a limit, moves the money
        out, or adds another agent — those live on the contract behind the
        owner&apos;s key.
      </p>

      {/* Spec §5 item 5: show the block, and reuse McpHandoff rather than
          duplicating it. tagStatus="missing" is the truth here -- a stranger
          reading the landing page has no attribution tag yet, so the component
          ships its `celo_yourtag` placeholder and says so, which is exactly the
          mistake it was built to catch. The wizard at /setup passes the real
          values and 'ok'. */}
      <McpHandoff handoff={SAMPLE} tagStatus="missing" />
    </div>
  )
}
