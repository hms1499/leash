export const spendPolicyAccountAbi = [
  {
    type: 'function', name: 'remainingToday', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' },
      { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'day', type: 'uint64' },
    ],
  },
  {
    type: 'function', name: 'execute', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'topUpOperator', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  // Error definitions for SpendPolicyAccount.sol's full revert surface.
  //
  // These MUST be present in this ABI (not just the function selectors above)
  // for `preCheck`'s decoding to work: viem's `simulateContract` decodes a
  // revert's custom-error name and args by matching the returned 4-byte
  // selector against `error`-typed entries in the ABI it was called with. A
  // function-only ABI here would make every policy rejection decode to
  // `undefined` and surface as `unknown_policy_error`, silently defeating
  // `describePreCheckFailure`.
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'NotOperator', inputs: [] },
  { type: 'error', name: 'ContractPaused', inputs: [] },
  {
    type: 'error', name: 'TokenNotConfigured',
    inputs: [{ name: 'token', type: 'address' }],
  },
  {
    type: 'error', name: 'PerTxCapExceeded',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'cap', type: 'uint256' },
    ],
  },
  {
    type: 'error', name: 'DailyCapExceeded',
    inputs: [
      { name: 'spentToday', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'cap', type: 'uint256' },
    ],
  },
  {
    type: 'error', name: 'PayeeNotAllowed',
    inputs: [{ name: 'payee', type: 'address' }],
  },
  { type: 'error', name: 'TransferFailed', inputs: [] },
] as const
