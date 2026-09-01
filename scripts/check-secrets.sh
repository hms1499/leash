#!/usr/bin/env bash
# Blocks committing .env files or anything shaped like a private key.
# The repo is public; a leaked key is drained within seconds.
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

# A 0x-prefixed 64-hex string is a private key unless it is all zeros.
if git diff --cached -U0 | grep -nE '^\+.*0x[0-9a-fA-F]{64}' \
     | grep -vE '0x0{64}' >/dev/null 2>&1; then
  echo "BLOCKED: a 64-hex value that looks like a private key is staged." >&2
  echo "If it is a transaction hash or a real constant, commit with --no-verify." >&2
  fail=1
fi

exit $fail
