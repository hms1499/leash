#!/usr/bin/env bash
# Step 3 of Task 5: mint the operator EOA's ERC-8004 identity on Celo mainnet.
#
# Safe to re-run. Every state-changing step is guarded by an on-chain check, and
# the transaction hash is captured from the broadcast itself before any receipt
# is polled -- a receipt that cannot be read must never be mistaken for a
# transaction that did not happen.
#
# Prints addresses, tx hashes and the agentId. Never prints a private key.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

R="${CELO_RPC_URL:-https://forno.celo.org}"
REGISTRY=0x8004a169fb4a3325136eb29fa0ceb6d2e539a432
TOKEN_URI=https://raw.githubusercontent.com/hms1499/leash/main/agent-card.json
# How much CELO the operator must hold before the mint is attempted. This is a
# RESERVE, not the price: the node rejects a transaction unless the sender can
# cover gasLimit * maxFeePerGas up front, and cast pads the estimate by 1.5x and
# sets maxFeePerGas to roughly twice the base fee. The reserve is therefore
# about 3x what the transaction actually costs, and the difference is refunded.
# Computed live rather than hardcoded, because Celo's base fee moves.
gas_reserve_wei() {
  local est base
  est=$(cast estimate "$REGISTRY" "register(string)" "$TOKEN_URI" --from "$OPERATOR" --rpc-url "$R")
  base=$(cast base-fee --rpc-url "$R")
  # est * 1.5 (cast's limit padding) * base * 2 (cast's maxFeePerGas) * 1.4 (headroom)
  python3 -c "print(int($est * 1.5 * $base * 2 * 1.4))"
}

# Broadcast without waiting, then poll for the receipt ourselves. cast send's
# built-in wait asks a load-balanced RPC for a receipt the instant the tx is
# broadcast; a node that has not seen it yet answers null and cast turns that
# into a hard error, discarding the hash of a transaction that is already live.
send_and_wait() {
  # `local hash=$(...)` would swallow a broadcast failure: the exit status of
  # that line is local's, not the substitution's, so set -e never fires and the
  # loop below polls an empty hash for two minutes. Declare, then assign.
  local hash
  hash=$(cast send "$@" --async)
  if [ -z "$hash" ]; then
    echo "    broadcast produced no tx hash - aborting without polling" >&2
    return 1
  fi
  echo "    tx $hash" >&2
  for _ in $(seq 1 60); do
    local r; r=$(cast rpc eth_getTransactionReceipt "$hash" --rpc-url "$R" 2>/dev/null || echo null)
    if [ "$r" != "null" ] && [ -n "$r" ]; then echo "$r"; return 0; fi
    sleep 2
  done
  echo "    TIMED OUT waiting for receipt. The tx above may still land; check it" >&2
  echo "    before re-running: cast receipt $hash --rpc-url $R" >&2
  return 1
}

# eth_getTransactionReceipt returns hex, and a reverted transaction still
# produces a receipt. Treat status 0x0 as fatal rather than reading empty logs.
check_ok() {
  local st; st=$(echo "$1" | jq -r '.status')
  printf '    status %s  gasUsed %s  block %s\n' \
    "$([ "$st" = "0x1" ] && echo success || echo "REVERTED ($st)")" \
    "$(cast to-dec "$(echo "$1" | jq -r '.gasUsed')")" \
    "$(cast to-dec "$(echo "$1" | jq -r '.blockNumber')")"
  [ "$st" = "0x1" ] || { echo "    ABORT: transaction reverted on chain." >&2; exit 1; }
}

echo "registry   $REGISTRY"
echo "operator   $OPERATOR"
echo "tokenURI   $TOKEN_URI"
echo

echo "==> 1/3 operator gas"
NEED=$(gas_reserve_wei)
BAL=$(cast balance "$OPERATOR" --rpc-url "$R")
echo "    need $(cast from-wei "$NEED") CELO reserve, have $(cast from-wei "$BAL") CELO"
if [ "$(echo "$BAL >= $NEED" | bc)" -eq 1 ]; then
  echo "    sufficient - skipping funding"
else
  TOPUP=$(python3 -c "print($NEED - $BAL)")
  echo "    topping up $(cast from-wei "$TOPUP") CELO from owner"
  check_ok "$(send_and_wait "$OPERATOR" --value "$TOPUP" --private-key "$OWNER_PK" --rpc-url "$R")"
  echo "    operator now $(cast from-wei "$(cast balance "$OPERATOR" --rpc-url "$R")") CELO"
fi

echo
echo "==> 2/3 mint"
OWNED=$(cast call "$REGISTRY" "balanceOf(address)(uint256)" "$OPERATOR" --rpc-url "$R")
if [ "$OWNED" != "0" ]; then
  echo "    ABORT: operator already owns $OWNED agent identity/identities."
  echo "    Nothing minted. Find the id on https://8004scan.io and use it."
  exit 1
fi
RECEIPT=$(send_and_wait "$REGISTRY" "register(string)" "$TOKEN_URI" \
  --private-key "$OPERATOR_PK" --rpc-url "$R")
check_ok "$RECEIPT"

# ERC-721 Transfer(address,address,uint256): tokenId is the 4th topic. The
# topic is derived at runtime rather than pasted in: a literal 0x+64hex event
# topic is indistinguishable from a private key to the pre-commit secret
# guard, and committing it would mean bypassing that guard with --no-verify.
TRANSFER_TOPIC=$(cast keccak "Transfer(address,address,uint256)")
AGENT_ID=$(cast to-dec "$(echo "$RECEIPT" \
  | jq -r --arg t "$TRANSFER_TOPIC" '[.logs[] | select(.topics[0]==$t)][0].topics[3]')")
if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" = "null" ]; then
  echo "    Could not read the agentId from the receipt logs." >&2
  echo "    The mint itself succeeded; recover the id from the tx above." >&2
  exit 1
fi

echo
echo "==> 3/3 result"
echo "    agentId          $AGENT_ID"
echo "    ownerOf(agentId) $(cast call "$REGISTRY" 'ownerOf(uint256)(address)' "$AGENT_ID" --rpc-url "$R")"
echo "    tokenURI         $(cast call "$REGISTRY" 'tokenURI(uint256)(string)' "$AGENT_ID" --rpc-url "$R")"
echo "    erc8004Url       https://8004scan.io/agents/celo/$AGENT_ID"
echo -n "    operator left    "; cast balance "$OPERATOR" --rpc-url "$R" --ether
