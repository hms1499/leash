#!/usr/bin/env bash
# Task 10 — deploy SpendPolicyAccount to Celo mainnet and verify the source.
#
# Refuses to run twice. A second run would deploy a SECOND contract at a new
# address, and the first one would still be holding whatever was sent to it.
# If a run dies part-way, do NOT re-run this script: use
#   cd contracts && forge script script/Deploy.s.sol --rpc-url celo --resume
# which continues the transactions already broadcast instead of starting over.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

R="${CELO_RPC_URL:-https://forno.celo.org}"

if [ -f docs/deployments.md ] && grep -qE '0x[0-9a-fA-F]{40}' docs/deployments.md; then
  echo "ABORT: docs/deployments.md already records a deployment:"
  grep -E 'SpendPolicyAccount' docs/deployments.md
  echo "Re-running would deploy a second, separate contract. Delete that line"
  echo "deliberately if you really mean to redeploy."
  exit 1
fi

echo "owner    $OWNER"
echo "operator $OPERATOR"
printf 'balance  '; cast balance "$OWNER" --rpc-url "$R" --ether
echo

echo "==> simulating first"
cd contracts
OWNER="$OWNER" OPERATOR="$OPERATOR" forge script script/Deploy.s.sol \
  --rpc-url celo --sender "$OWNER" 2>&1 | grep -E "SpendPolicyAccount:|owner |operator |Estimated amount"

echo
echo "==> broadcasting"
# --slow sends each transaction only after the previous one confirms. forno is
# load-balanced and answers inconsistently right after a broadcast; sending the
# constructor and setOperator back to back invites the second to be built
# against a node that has not seen the first.
OWNER="$OWNER" OPERATOR="$OPERATOR" forge script script/Deploy.s.sol \
  --rpc-url celo --broadcast --slow --private-key "$OWNER_PK" \
  --verify \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=42220" \
  --etherscan-api-key "$CELOSCAN_KEY" \
  --retries 10 --delay 15
