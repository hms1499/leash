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
if printf '%s\n' "$added" | grep -E '0x[0-9a-fA-F]{64}' \
     | grep -vE '0x0{64}' >/dev/null 2>&1; then
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
