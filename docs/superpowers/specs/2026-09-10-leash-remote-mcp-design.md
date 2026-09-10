# Leash — Remote MCP over HTTP (Design Spec)

**Date:** 2026-09-10
**Status:** Approved. Not yet implemented.
**Supersedes nothing.** Additive to `2026-09-06-leash-npm-distribution-design.md`:
the stdio bin that document describes keeps its exact behaviour, and this one
adds a second transport beside it.
**Deadline context:** hackathon closes 2026-09-14 09:00 GMT. Estimated ~1.5 days.

---

## 1. The problem

`leash-agentpay` speaks one transport, hardcoded:

```ts
await server.connect(new StdioServerTransport())   // mcp/src/index.ts
```

stdio means a process spawned on the user's own machine. Claude Code and Claude
Desktop can do that. **claude.ai cannot** — a web client has no way to run
`npx`, and its Connectors UI has no `command` field, only a URL. So the artifact
the setup wizard hands out today, a `.mcp.json` containing that `command`/`args`
block, is unusable on the web surface. There is nowhere to paste it.

The result is that the whole product is invisible to anyone who uses Claude in a
browser, which is most people who use Claude.

## 2. What we are building

A second transport in the same package, behind a `--http` flag, that a user
**self-hosts** and adds to claude.ai as a custom connector. The five
configuration values stay exactly what they are today; only their delivery
mechanism changes, from a JSON file an agent runtime reads to environment a
server reads.

### 2.1 Why self-hosted rather than hosted by us

A hosted endpoint means `OPERATOR_PK` sits in our environment, which makes us
custodian of other people's money. The on-chain caps bound the loss — that is
the project's whole thesis — but "we hold your key and the contract limits the
damage" is a different product from "you hold your key". This spec is the
second one.

A hosted variant for demo purposes, using the maintainer's own wallet on the
already-deployed `app/`, is a separate deliverable and is **out of scope here.**

## 3. Authentication: the constraint that shaped everything

This section records research rather than choices, because three documented
facts eliminated most of the design space.

| Auth type | Availability, per Anthropic's connector docs |
|---|---|
| `oauth_dcr` (OAuth 2.0 + Dynamic Client Registration) | Supported out of the box |
| `oauth_cimd` | Supported out of the box |
| `static_headers` (fixed bearer / API key) | **Beta, and entered by an organization administrator only** |
| `none` (authless) | Supported |

1. **A static bearer token is not available to an individual user.** The
   `static_headers` field is org-admin-only, so a Pro user adding a custom
   connector cannot supply one. Header auth is therefore not an option for our
   audience.
2. **A token in the URL is prohibited.** Anthropic's docs call a credential in
   the connector URL "a security vulnerability", and the MCP authorization
   specification explicitly prohibits access tokens in the URI query string.
   URLs land in server logs, proxies and browsing history. An earlier draft of
   this design proposed `/mcp/<token>`; it is rejected on this basis.
3. **Authless is technically supported and here unacceptable.** The audience for
   this deliverable is strangers running their own real money. An unauthenticated
   endpoint means anyone who learns the URL spends up to the caps, with the caps
   as the only brake. That inverts the pitch.

What remains is OAuth. Two further facts from the same docs shape the
implementation:

- **Anthropic's outbound traffic comes from `160.79.104.0/21`.** Useful as
  defence in depth, but only for the MCP endpoint — the consent page is opened
  by the user's own browser, from the user's own IP.
- **OAuth discovery, registration and token endpoints have a 10-second
  timeout.** Ours touch no chain, so this is comfortable, but it forbids ever
  putting an RPC read on the token path.

### 3.1 We do not write the OAuth server

`@modelcontextprotocol/sdk` — already a dependency — ships `mcpAuthRouter`,
which serves `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource<path>`, `/authorize`, `/register`,
`/token` and `/revoke`, with rate limiting and S256 PKCE validation included.
We implement only the `OAuthServerProvider` interface (seven methods) and an
`OAuthRegisteredClientsStore`.

That router is Express-based. **This costs no new dependency:** `express@^5`,
`express-rate-limit`, `pkce-challenge`, `cors` and `jose` are already hard
dependencies of `@modelcontextprotocol/sdk` at the version this package pins.
Verified in `mcp/node_modules/@modelcontextprotocol/sdk/package.json`.

Hand-rolling the authorization server on the framework-free
`webStandardStreamableHttp` transport was considered and rejected. Its only real
advantage is reuse in a future Vercel route, and the part that would be reused —
the provider, where the security lives — is transport-agnostic either way. What
it would buy us is the chance to get OAuth subtly wrong on an endpoint that
spends money.

Requiring the user to bring an external identity provider was also rejected: it
forces a stranger to stand up an IdP before they can pay for anything, which
destroys the `npx`-and-go property that the npm work exists to provide.

## 4. Architecture

```
mcp/src/
  index.ts        argv parse → stdio or http. ~20 lines.
  server.ts       createLeashServer(config): Server        ← extracted from index.ts
  config.ts       + loadHttpConfig(env, argv)
  mutex.ts        serialises writes
  http/
    app.ts        express app: mcpAuthRouter + guarded POST /mcp + POST /consent
    provider.ts   LeashOAuthProvider implements OAuthServerProvider
    grants.ts     persistence at ~/.leash/grants.json, mode 0600
    consent.ts    one inline HTML template; no templating dependency
    anthropicIps.ts  optional 160.79.104.0/21 guard, /mcp only
```

`createLeashServer` is the single seam both transports share. There must not be
a second copy of the tool list — CLAUDE.md's rule that two implementations of
one operation must not behave differently is enforced here structurally, not by
discipline, and §8 adds a test that fails if they ever diverge.

Extracting it changes no behaviour for existing CLI and Desktop users. The
`test:bundle` suite, which packs the tarball and starts the bin, is what
guarantees that.

## 5. Configuration

| | |
|---|---|
| `--http [port]` | Default 8787. Absent → stdio, byte-for-byte today's behaviour |
| `LEASH_PUBLIC_URL` | **Required in http mode.** The public https **origin**, no path — e.g. `https://x.trycloudflare.com`. Neither the origin nor the scheme is derivable from inside the process |
| `--host` | Default `127.0.0.1`, which is what turns on the SDK's DNS-rebinding protection |
| `--anthropic-only` | Opt-in IP guard on `/mcp` |

Three URLs derive from that origin and must not be confused:

| | |
|---|---|
| Issuer / authorization server | `LEASH_PUBLIC_URL` itself — the origin |
| Resource server, i.e. **what the user pastes into Claude** | `${LEASH_PUBLIC_URL}/mcp` |
| Protected resource metadata, served by the router | `${LEASH_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp` |

The `resource` field inside that metadata document must equal the middle row
character for character. `mcpAuthRouter` derives the metadata path from the
`resourceServerUrl` it is given, so passing it `${LEASH_PUBLIC_URL}/mcp` is what
makes all three agree; §11's `app.test.ts` asserts it rather than trusting it.

`--anthropic-only` is **off by default on purpose.** Hardwiring a CIDR into a
published bin is precisely the class of failure this repo has already paid for
elsewhere: the day Anthropic adds a range, every connector breaks silently and
the user has no way to read the cause off the symptom. Documented and
recommended, never assumed.

### 5.1 A deployed host is the primary path, not the tunnel

An earlier draft of this spec documented laptop-plus-tunnel as *the* way to run
this, and buried a deploy target as an aside. That has it backwards, and the
symptom was visible in the walkthrough: three terminal commands and two
copy-pastes wedged into the middle of an otherwise browser-only journey.

The terminal step is not a UX blemish to polish. It is what optimising for the
wrong host looks like. Anyone running an agent wallet with real money in it
wants the server always-on; a laptop that sleeps and a quick tunnel whose URL
changes every run are the properties of a demo, not of a deployment.

So the documented order is:

1. **Deploy it somewhere** (Fly, Railway, Render, any container host). The
   platform issues a stable URL *before* the process starts, so
   `LEASH_PUBLIC_URL` is simply that URL — there is no ordering constraint,
   nothing to copy between terminals, and no terminal at all: the five values
   and the public URL go into the platform's environment UI, and the pairing
   code is read out of the platform's log viewer. This path ships as a
   `Dockerfile` plus one documented deploy config.
2. **Local with a tunnel** — for trying it out, and for developing on it.

### 5.2 The tunnel ordering constraint, on the local path only

Because `LEASH_PUBLIC_URL` must be known at startup, and a `trycloudflare.com`
URL is random per run, the tunnel has to be started *before* the server. This is
inherent, not incidental, and the local walkthrough must lead with it rather
than let a user discover it from a metadata mismatch.

### 5.3 `connect`: one line instead of a hand-authored `.env`

On the local path, asking a user to transcribe five variables into a file they
create by hand is a step where one wrong character produces an error message
about something else. The wizard therefore emits a single command, and the bin
grows a `connect` subcommand to accept it:

```
npx -y leash-agentpay connect \
  --account 0x… --token 0x… --fee-adapter 0x… --tag celo_…
```

Those four are public values and are safe in shell history. The operator key is
**not** a flag: `connect` prompts for it on stdin with echo off, so it never
reaches argv, `ps`, or the shell's history file. It asks for the public URL the
same way.

The two paths therefore use the mechanism each is actually suited to, and the
difference is worth stating in the docs rather than hiding:

| | Where the key lives | Survives a restart |
|---|---|---|
| Deployed host, `--http` | The platform's secret store | Yes |
| Local, `connect` | The process's memory only, never on disk | No — it prompts again |
| Local, `.env` + `--http` | A file you wrote | Yes |

`connect` not writing a key to disk is a feature, not an omission. Whether a
private key gets persisted is the user's decision to make deliberately, not a
side effect of the shortest path through our documentation.

## 6. The consent flow

1. Claude issues `GET /authorize?…`. The SDK handler validates the request and
   calls `provider.authorize()`.
2. The provider stores the authorization parameters **server-side** under a
   random `request_id` and renders a form carrying only that id. Nothing about
   `redirect_uri`, `code_challenge` or `resource` travels through a hidden form
   field. A hidden field is attacker-controllable input, and this repo's rule is
   that attacker-controllable input never gates anything that matters.
3. The user pastes the pairing code. `POST /consent` compares it in constant
   time, under a rate limit.
4. On a match, mint an authorization code bound to
   `{clientId, redirectUri, codeChallenge, resource}`, single-use, 60-second
   TTL, then `302` to the redirect URI.
5. `POST /token`: the SDK validates S256 PKCE; the provider exchanges the code
   for an access token (1 hour, **memory only**) and a refresh token
   (**rotating**, hashed to disk).
6. Every `/mcp` request passes `requireBearerAuth`, which answers an
   unauthenticated call with `401` and a
   `WWW-Authenticate: Bearer resource_metadata="…"` header. The 401 is required:
   Claude does not honour that header on a 200.

### 6.1 The pairing code

Generated fresh on every start, printed to **stderr — never stdout**, because
stdout is the JSON-RPC channel in stdio mode and writing to it would corrupt
the other transport.

It gates the issuing of *new* grants only. That is what makes the persistence
choice in §7 work: a restart loses access tokens but keeps refresh tokens, Claude
refreshes reactively on the next 401, and the user is not asked to pair again.

### 6.2 What OAuth gives back

The public URL stops being a credential. Under the rejected token-in-URL design
it would have been a bearer capability, in the same category as the x402 poll
URL that CLAUDE.md forbids committing or logging. With OAuth it is an ordinary
URL: loggable, pasteable, committable.

## 7. Persistence

`~/.leash/grants.json`, mode `0600`: registered clients, and refresh tokens
stored as hashes. Access tokens are never written down.

A corrupt or unreadable grant file **fails loudly at startup.** Starting anyway
with zero grants would present as "Claude broke my connector" to a user whose
actual problem is a damaged file, and the cause would be unreadable from the
symptom.

## 8. Two hazards that are not about OAuth

**Nonce collision.** `LeashClient` does not manage transaction nonces; viem
queries the node on each send. Over stdio one client calls in sequence and this
never surfaced. Over HTTP two concurrent tool calls both read nonce *N* and one
replaces the other. CLAUDE.md already records the lesson in its neighbouring
form — "retry, re-reading the nonce between attempts" — so this is a known-priced
hazard, not a hypothetical. All writes serialise through `mutex.ts`.

**stderr, not stdout.** Stated in §6.1; repeated here because it is the kind of
line that gets refactored away by someone who does not know why it is there.

## 9. Error paths

Tool-level failures keep the existing `errors.ts` contract: JSON carrying an
`error` code and one actionable `suggestion`.

Transport and auth failures are **real HTTP statuses** — 401, 403, 429 — and are
never wrapped as tool errors. An unauthenticated agent must see a 401 so Claude
runs its refresh; wrapped as an `internal_error` it would instead send the agent
to debug `LEASH_*` variables that are all correct. `fetch.ts` carries a comment
recording that exact bug from the `quote_only` path, and this is the same defect
one layer down.

## 10. The wizard hands out the wrong artifact

`app/`'s setup wizard ends by handing the user a `.mcp.json`. For a web user
that file has no destination, so this deliverable is not finished in `mcp/`
alone.

The wizard's final stage needs two tabs:

- **Claude Code / Desktop** — the `.mcp.json` block as it is today.
- **Claude web** — the deployed-host path first, and the local one-liner second.

### 10.1 What the Claude web tab shows

**Deploy it (recommended).** The five values to paste into the host's
environment UI, plus `LEASH_PUBLIC_URL` set to the URL that host gives out.
Nothing here is a terminal command.

**Or run it locally.** The single `connect` line from §5.3, with the four public
values already substituted, ready to copy:

```
npx -y leash-agentpay connect --account 0x… --token 0x… --fee-adapter 0x… --tag celo_…
```

It prompts for the operator key and the public URL, so neither appears in the
block the wizard renders — which also means the wizard still never displays a
key, exactly as the `.mcp.json` tab never does.

### 10.2 The connector walkthrough

Common to both, and belonging in `docs/mcp-setup.md` too:

1. Start the server by whichever path above, and read the **pairing code** — off
   stderr locally, or out of the host's log viewer.
2. claude.ai → Settings → Connectors → Add custom connector.
3. Paste `<your URL>/mcp`. **Leave Advanced settings empty** — `/register`
   handles client registration, so there is no client ID or secret to supply.
4. Connect, then paste the pairing code on the consent page. That page is served
   by the machine running the server, which is worth saying out loud on it.
5. Enable the connector in a chat; `leash_status` is the cheapest thing to call
   first, because it spends nothing.

On the local path only, the tunnel must be running before the server starts
(§5.2), and a new tunnel URL means removing and re-adding the connector, because
the URL is part of the resource identity. The free plan allows one connector.
All of that belongs in the copy, not in a footnote.

This is copy, not logic, and it is cheap. It is also load-bearing: without it B
ships and nobody finds the door.

## 11. Testing

| Suite | What it pins |
|---|---|
| `provider.test.ts` | Wrong pairing code refused; code single-use; expiry refused; PKCE challenge returned matches what was stored; refresh rotates and the old refresh dies; unknown or expired access token refused |
| `grants.test.ts` | File written `0600`; reload restores grants; a corrupt file throws instead of starting empty |
| `app.test.ts` | `POST /mcp` with no token → 401 carrying `resource_metadata`; well-known documents carry a `resource` matching the resource server URL character for character; a wrong `Host` → 421, and `/healthz` answers outside every guard |
| `connect.test.ts` | `--operator-pk` refused as a flag; a missing or malformed flag named; a tag the server would refuse rejected one layer earlier; the secret prompt does not echo, and says which path to use when there is no TTY |
| `parity.test.ts` | The tool list is identical across both transports |
| `mutex.test.ts` | Two concurrent pays serialise |
| `bundle.test.ts` | Extended: `--http` starts and serves `/.well-known/oauth-authorization-server` |

The existing 29 unit tests and 3 bundle tests stay green. Secrets in tests are
generated at runtime, as `generatePrivateKey()` already is in `status.test.ts` —
`scripts/check-secrets.sh` blocks literals.

`test:gate` is untouched and still spends real money. It is not part of this
work.

## 12. Out of scope

CIMD; `static_headers`; the IP guard on by default; the hosted Vercel route;
multi-tenancy; per-user operator keys; KMS.

Two UX improvements were designed and **deliberately deferred**, so that the
next person to look at this does not mistake their absence for an oversight:

- **`--tunnel`, where the server spawns cloudflared and reads its own public URL
  back.** It would delete the ordering constraint and the second terminal
  outright. Deferred on two grounds: scraping a URL out of another program's
  stderr is brittle, and a tool that holds a private key downloading and
  executing a third-party binary is a trade that needs a deliberate decision,
  not a convenience default. If it is ever built, it must be opt-in and must use
  a `cloudflared` already on `PATH`.
- **Browser-session pairing instead of typing the code.** The CLI opens
  `<public-url>/pair?t=<one-time>` in the local browser, which sets an HttpOnly
  cookie on the same origin the consent page is served from; the consent page
  then shows a single Authorise button. This is arguably *better* security than
  a typed code — possession of a browser session on the host machine is exactly
  the principal we mean to authenticate — but it puts a one-time token in a URL,
  which §3 rejects elsewhere. It is defensible here (local to local, single-use,
  short TTL) and that argument deserves its own review rather than being smuggled
  in under a deadline. The typed code stays as the fallback for headless hosts in
  any case.

## 13. Risks

The code is the smaller half. The larger half is the **first real connection**:
standing up a tunnel, adding the connector on claude.ai, and debugging discovery
when it fails. Anthropic documents a quiet failure mode for exactly this — the
MCP server receives the initial request while the authorization server sees no
traffic at all, because no `WWW-Authenticate` pointer was returned and the
well-known paths 404. Budget a session for it rather than assuming a clean first
run.

The local path's limits are inherent and must be documented, not engineered
around: the machine has to stay awake, the tunnel has to stay up, and a new
tunnel URL means removing and re-adding the connector, because the URL is part
of the resource identity. Every one of those disappears on the deployed path,
which is why §5.1 makes that the primary one — the right response to this class
of friction was to change which host we document first, not to add machinery
that hides it.
