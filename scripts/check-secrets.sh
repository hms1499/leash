#!/usr/bin/env bash
# Blocks committing .env files or anything shaped like a private key or
# BIP-39 mnemonic. The repo is public; a leaked key is drained within
# seconds.
#
# WHAT THIS DOES NOT CATCH (a pre-commit regex is not a guarantee):
#   - a secret split across multiple lines or built up at runtime
#   - a secret embedded in base64, JSON, or other encoded/escaped form
#   - API tokens, session cookies, or other secret shapes that are not a
#     64-hex string or a 12/15/18/21/24-word mnemonic
#   - anything committed with `git commit --no-verify`
#   - a private key padded into a LONGER unbroken hex run. Both hex rules
#     below match a run of exactly 64 hex digits, so `0x<key><4 more hex>`
#     slips past. The alternative — matching any 64-hex substring of a longer
#     run — makes every committed calldata dump, ABI encoding, signature and
#     domain separator a false positive, which in a chain repo means the guard
#     is bypassed as a matter of routine and then protects nothing. Evading it
#     this way takes deliberate effort; tripping over it did not.
#   - a real 0x+64hex private key that is ITSELF immediately preceded by a
#     tx/txn/hash label or sits inside an explorer .../tx/<value> URL (the
#     exact shape a real proof-tx hash also has). This project is required
#     to record real proof-tx hashes in its own docs, and those hashes are
#     indistinguishable from a private key by shape alone; the exception
#     below lets a tx-labelled value through so the guard is not routinely
#     bypassed with --no-verify on exactly its highest-value commits. The
#     exception is evaluated per VALUE, not per line — a second, unlabelled
#     64-hex value on the same line gets no exemption. A key-ish line never
#     gets this exception at all (see the rule below).
# Treat this as a safety net for the common accident, not a security
# boundary. Review diffs before committing sensitive-looking changes.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

fail=0

for f in $staged; do
  case "$f" in
    .env|.env.*|*/.env|*/.env.*)
      if [ "$f" != ".env.example" ] && [ "${f##*/}" != ".env.example" ]; then
        echo "BLOCKED: refusing to commit $f" >&2
        fail=1
      fi
      ;;
  esac
done

added=$(git diff --cached -U0 -- . ':!*.lock' ':!pnpm-lock.yaml' | grep -E '^\+' | grep -vE '^\+\+\+' || true)

# A 0x-prefixed 64-hex string is a private key unless it is all zeros.
#
# Exception, evaluated per VALUE (not per line): a value is exempt only
# when it is itself immediately preceded by a tx/txn/hash label (allowing
# up to 10 chars of whitespace/colon/equals between the label and the
# value — e.g. "Proof tx: 0x...", "hash=0x...") or sits directly after
# "/tx/" in an explorer URL (".../tx/0x..."). A second 64-hex value
# elsewhere on the same line — labelled or not — gets no exemption from
# this, because the check re-extracts the value out of each exempt match
# and only what is captured that way counts as exempt. Also: this project
# is required to record real proof-tx hashes in its own docs
# (spikes/README.md's "Proof tx:" field, docs/deployments.md, a later
# task's mainnet attribution proof), and a tx hash is 0x+64hex just like a
# key — without this, the guard would block precisely the highest-value
# commits in this plan and train routine --no-verify use.
#
# Count every non-zero 0x+64hex value present, then count how many of
# those same values appear as the tail of an exempt (label- or
# URL-adjacent) match. If any value isn't accounted for by the exempt set,
# something un-exempted is staged — block. (Key-ish lines, e.g.
# OWNER_PK=0x..., are also blocked here whenever the value isn't itself
# tx-labelled, which it structurally can't be when a label like "tx" only
# appears after the value — see case (e) in the report. The bare-hex rule
# below additionally, independently blocks any key-ish line regardless.)
# Each pipeline below ends with `|| true`: under `set -o pipefail`, an
# early grep in the chain finding zero matches (the normal case — no hex
# at all, or no exempt hex at all) makes the whole pipeline exit non-zero,
# which `set -e` would otherwise treat as a script error and abort before
# reaching the comparison below. `|| true` neutralises that while leaving
# the piped-through stdout (and so the counts) untouched.
total_hex_count=$( (printf '%s\n' "$added" \
  | grep -oE '0x[0-9a-fA-F]{64,}' \
  | awk 'length($0) == 66' \
  | grep -vE '^0x0{64}$' \
  | wc -l | tr -d ' ') || true)
exempt_hex_count=$( (printf '%s\n' "$added" \
  | grep -oiE '(https?://[^[:space:]]*/tx/0x[0-9a-fA-F]{64,}|\b(tx|txn|hash)\b[[:space:]:=]{0,10}0x[0-9a-fA-F]{64,})' \
  | grep -oE '0x[0-9a-fA-F]{64,}' \
  | awk 'length($0) == 66' \
  | grep -vE '^0x0{64}$' \
  | wc -l | tr -d ' ') || true)
[ -z "$total_hex_count" ] && total_hex_count=0
[ -z "$exempt_hex_count" ] && exempt_hex_count=0
if [ "$total_hex_count" -ne "$exempt_hex_count" ]; then
  echo "BLOCKED: a 0x-prefixed 64-hex value that looks like a private key is staged." >&2
  echo "If it is a transaction hash or a real constant, commit with --no-verify." >&2
  fail=1
fi

# A bare (no 0x) 64-hex string on a line that assigns to a key-ish
# identifier (KEY, PK, PRIVATE, SECRET, MNEMONIC, SEED...). Some wallet
# exports produce raw hex keys with no 0x prefix, so the rule above alone
# would miss them. Scoped to key-ish assignment lines (not every 64-hex
# string anywhere) to avoid false positives on lockfile hashes and
# unrelated hex/base content.
if printf '%s\n' "$added" \
     | grep -iE '(KEY|PK|PRIVATE|SECRET|MNEMONIC|SEED)[A-Za-z0-9_]*[[:space:]]*[:=]' \
     | grep -E '(^|[^0-9a-fA-F])(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)' \
     | grep -vE '(^|[^0-9a-fA-F])(0x)?0{64}([^0-9a-fA-F]|$)' >/dev/null 2>&1; then
  echo "BLOCKED: a 64-hex value on a key-like assignment line is staged." >&2
  echo "If it is not actually a secret, commit with --no-verify." >&2
  fail=1
fi

# A BIP-39 mnemonic (12/15/18/21/24 lowercase words) assigned to a
# MNEMONIC/SEED/SEED_PHRASE/PHRASE-style variable. Only checks lines shaped
# like an assignment to one of these names — it does not scan free prose
# elsewhere in the diff (this repo's docs would false-positive on that).
while IFS= read -r line; do
  [ -z "$line" ] && continue
  value=$(printf '%s' "$line" | sed -E 's/^\+[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')
  case "$value" in
    ''|*[!a-zA-Z\ ]*) continue ;;
  esac
  word_count=$(printf '%s' "$value" | tr -s ' ' '\n' | grep -cE '^[a-z]+$' || true)
  case "$word_count" in
    12|15|18|21|24)
      echo "BLOCKED: a $word_count-word value on a mnemonic/seed-like assignment line is staged." >&2
      echo "If it is not actually a seed phrase, commit with --no-verify." >&2
      fail=1
      ;;
  esac
done <<EOF
$(printf '%s\n' "$added" | grep -iE '^\+[[:space:]]*(export[[:space:]]+)?(MNEMONIC|SEED|SEED_PHRASE|PHRASE)[A-Za-z0-9_]*[[:space:]]*[:=]' || true)
EOF

exit $fail
