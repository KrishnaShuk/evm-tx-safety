# Test Context Report — EVM TX Safety v0.6

**Read-only analysis.** Sources: `README.md`, `CHANGELOG.md`, `AGENTS.md`,
`packages/core/src/**`, `apps/cli/src/index.ts`, `apps/web/app/api/analyze/route.ts`,
and `packages/core/test/**`. Statements are based on code, not README claims.
“UNSURE” marks anything not confirmed from code. Tests were not re-run for this
report (read-only); the sample outputs below were produced with an in-memory
mock JSON-RPC server.

---

## 1. EXISTING TESTS

There are **22** `node:test` tests in two files. All import the built core from
`packages/core/dist`, so a build is required before running them.

| # | File | Test name | What it checks | Category |
|---|---|---|---|---|
| 1 | `packages/core/test/core.test.mjs:59` | input detection distinguishes hash, raw calldata, and structured input | `detectInputKind` returns hash/calldata/structured | Other (input) |
| 2 | `core.test.mjs:65` | raw calldata requires a target | calldata string without `to` rejects; with `to` normalizes | Other (input) |
| 3 | `core.test.mjs:78` | decodes an unlimited USDC approval with intent and curated confidence | ERC-20 approve decode, MAX_UINT256, summary, confidence | Decoder |
| 4 | `core.test.mjs:87` | Permit2 approvals use the token parameter, not the Permit2 contract | Permit2 approve uses `token` param for symbol; unlimited detected | Decoder |
| 5 | `core.test.mjs:104` | unlimited approval to an unknown spender is DANGEROUS | UNLIMITED_APPROVAL + UNVERIFIED_SPENDER, score/passed | Safety rules |
| 6 | `core.test.mjs:114` | unlimited approval to a known router is a warning, not DANGEROUS | safe-spender allowlist suppresses UNVERIFIED_SPENDER | Safety rules |
| 7 | `core.test.mjs:122` | setApprovalForAll is ignored for a known marketplace operator | Seaport operator allowlist suppresses rule | Safety rules |
| 8 | `core.test.mjs:133` | setApprovalForAll to an unknown operator is HIGH | unknown operator → HIGH/DANGEROUS | Safety rules |
| 9 | `core.test.mjs:145` | transfer to an unknown contract is flagged | recipient contract flag triggers rule | Safety rules |
| 10 | `core.test.mjs:159` | hidden approvals inside a generic call are HIGH, but known spenders are skipped | HIDDEN_APPROVAL; Permit2 spender skipped | Safety rules |
| 11 | `core.test.mjs:197` | LOW-only findings produce WARNINGS and passed=false | gas-limit LOW → WARNINGS/passed false | Safety rules |
| 12 | `core.test.mjs:211` | reverts are DANGEROUS, unavailable simulations are not | revert → TX_WILL_REVERT; unavailable → only MEDIUM | Fail-safe/robustness |
| 13 | `core.test.mjs:246` | nested Multicall3 calls are decoded recursively | `aggregate3` child decoded as transfer | Decoder |
| 14 | `core.test.mjs:259` | Universal Router commands are decoded into typed sub-calls | `execute` V2 swap command decoded | Decoder |
| 15 | `core.test.mjs:275` | ERC-20 Transfer logs become balance changes | log → sender/recipient USDC deltas + event | Simulation |
| 16 | `core.test.mjs:302` | prestate and Tenderly state diffs are parsed | prestate balance/storage; Tenderly raw diff | Simulation |
| 17 | `core.test.mjs:320` | analyzeTx works without an RPC and marks simulation unavailable | no RPC → unavailable + WARNINGS | Fail-safe/robustness |
| 18 | `integration.test.mjs:113` | hash input + RPC fallback does not misclassify an unsupported trace | hash fetch, trace unsupported → RPC, still DANGEROUS | Simulation |
| 19 | `integration.test.mjs:135` | an RPC that reports the wrong chain is rejected | `eth_chainId` mismatch → CHAIN_MISMATCH | Fail-safe/robustness |
| 20 | `integration.test.mjs:153` | trace backend produces token balance and state diffs | callTracer logs + prestate → balances/state | Simulation |
| 21 | `integration.test.mjs:180` | Tenderly backend uses the account/project endpoint and asset changes | URL/body, asset changes, state diff | Simulation |
| 22 | `integration.test.mjs:245` | RPC URL policy blocks private hosts and allows the default registry | `assertSafeRpcUrl` private block/default allow | Fail-safe/robustness |

**No tests exist for the CLI, the Next.js API route, the web UI, or the
Tenderly/HTTP error branches beyond the happy path.** Categories represented:
Decoder 4, Simulation 5, Safety rules 7, Fail-safe/robustness 4, Other 2.

### Mock JSON-RPC server

`integration.test.mjs:21-111` defines `startRpc({ supportsTrace })`. It starts an
HTTP server on `127.0.0.1:0`, parses JSON bodies (single or batch), and returns
`{jsonrpc, id, result|error}`. It records every method in `state.requests`.

What it fakes:

| Method | Response |
|---|---|
| `eth_chainId` | `0x1` |
| `eth_call` | `0x` (success) |
| `eth_estimateGas` | `0x5208` (21000) |
| `eth_getCode` | contract code only for USDC, otherwise `0x` |
| `eth_getStorageAt` | 32 zero bytes |
| `eth_getTransactionByHash` | fixed approve tx with fake hash `0xabab…` |
| `debug_traceCall` (callTracer) | fixed USDC `Transfer` log + gas 50000 when enabled |
| `debug_traceCall` (prestateTracer) | fixed recipient balance 0x0 → 0x1 |
| anything else | JSON-RPC error `-32601` |

It **cannot** fake token metadata (`symbol`, `decimals`, `balanceOf`),
`eth_getLogs`, receipts, or arbitrary contracts. Trace logs are fixed; known token
metadata comes from `config/chains.ts`; unknown tokens fall back to short
addresses.

Short example of a new test (same helper style):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTx } from "../dist/index.js";

test("benign RPC-only path", async () => {
  const { server, url } = await startRpc({ supportsTrace: false });
  try {
    const result = await analyzeTx({
      tx: { to: "0x1111111111111111111111111111111111111111", data: "0x", value: "1" },
      rpcUrl: url,
      chainId: 1,
      timeoutMs: 5000,
    });
    assert.equal(result.simulation.backend, "rpc");
    assert.equal(result.simulation.capabilities.balances, false);
  } finally {
    server.close();
  }
});
```

`startRpc` is local to `integration.test.mjs`; a new test must copy it or move it
to a shared helper. Extend its `switch` for new methods/addresses.

### Exact commands

All tests:

```bash
npm test
# equivalent: npm test --workspace=packages/core
# this runs: npm run build --workspace=packages/core && node --test test/*.test.mjs
```

One file (build first because tests import `../dist`):

```bash
npm run build --workspace=packages/core
node --test packages/core/test/core.test.mjs
# or:
node --test packages/core/test/integration.test.mjs
```

### Fixtures / recorded real data

**None.** There is no `fixtures/`, `testdata/`, or recorded-transaction
directory. All calldata is constructed in the tests. `examples/` contains two
synthetic JSON inputs (`examples/dangerous_tx.json`, `examples/safe_tx.json`);
neither is a mined transaction. No real transaction hash appears in tests or
docs — the only 32-byte hash is the fake `0xabab…` in
`integration.test.mjs:12`. Real addresses are used (USDC, Permit2, Uniswap,
Multicall3, Universal Router, Seaport, BAYC, Vitalik’s address), but no real
transaction hashes.

---

## 2. DECODER

### Curated ABIs/standards

From `packages/core/src/abi/abis.ts`:

- ERC-20 (`ERC20_ABI`, includes permit/increase/decreaseAllowance)
- ERC-721 (`ERC721_ABI`)
- ERC-1155 (`ERC1155_ABI`)
- WETH (`WETH_ABI`, ERC-20 + deposit/withdraw)
- Uniswap V2 Router (`UNISWAP_V2_ROUTER_ABI`)
- Uniswap V3 Router (`UNISWAP_V3_ROUTER_ABI`, exactInput/Output + multicall)
- Universal Router (`UNIVERSAL_ROUTER_ABI`, two `execute` overloads)
- Permit2 (`PERMIT2_ABI`: approve, permit, transferFrom, allowance)
- Multicall3 (`MULTICALL3_ABI`: aggregate, aggregate3, aggregate3Value, multicall)

The selector index is built from these interfaces in
`packages/core/src/abi/registry.ts:73-105`. Event decoding separately handles
ERC-20/721/1155 Transfer/Approval/ApprovalForAll, Permit2 Approval, Uniswap
V2/V3 Swap, WETH Deposit/Withdrawal (`packages/core/src/simulator/logs.ts`).

### Selector resolution order and confidence

`resolveSelector` (`abi/registry.ts:375-431`):

1. **Local curated selector table** (`getLocalResolution`) — returned first by
   default. Confidence `curated`.
2. **Target ABI** (`getTargetAbi`): known-contract curated ABI → Sourcify
   full/partial → proxy implementation ABI. A match is `verified` unless the
   target ABI itself is a curated known-contract ABI, which would be `curated`.
   In practice, this step is skipped for selectors already in the local table
   because local is checked first.
3. **OpenChain** signature database — confidence `registry`.
4. **4byte.directory** — confidence `unverified`; candidates are ranked and
   stored in `signatureCandidates`.
5. No result — `decodeCallData` assigns `unverified`, `functionSignature`
   undefined, `params: []`, type `Unknown`.

So `verified` requires a selector absent from the local table but present in a
Sourcify/proxy ABI. `registry`/`unverified` are public-signature fallbacks; they
do not prove the target contract’s ABI.

### Proxy and recursive decoding

**Proxy resolution** (`abi/registry.ts:267-306`) is attempted only when the
target has code and direct ABI lookup failed (`getTargetAbi:308-344`):

- EIP-1167 minimal proxy bytecode regex → implementation address.
- EIP-1967 implementation slot → implementation address.
- Beacon slot → `implementation()` call → implementation address.
- One hop only; no recursive proxy chains, no admin slot, no EIP-1967 beacon
  validation beyond the call.

**Recursive decoding** (`decoder/index.ts:313-356`):

- Multicall3 `aggregate`, `aggregate3`, `aggregate3Value`: each tuple’s target +
  calldata is decoded recursively; `aggregate3Value` child `value` is not
  surfaced on the child.
- `multicall`: the last array argument is treated as the payload list (works for
  Uniswap V3 multicall and Multicall3 `multicall(bytes[])`); target is the same
  contract.
- Universal Router `execute`: commands byte per input; `decodeUniversalExecute`
  (line 300) produces one child per command, max 20.
- Limits: `MAX_CALL_DEPTH = 3` and `MAX_CHILDREN = 20`
  (`decoder/index.ts:39-40`); recursion stops when `depth >= 3`; address
  collection is capped at 16 (`collectAddresses:427`).

**Permit2/EIP-2612:** these are ABI-decoded as calls, not expanded into a call
tree. EIP-2612 `permit` is in the ERC-20 ABI; Permit2 `approve`/`permit`/
`transferFrom` are in the Permit2 ABI. Permit2 tuple fields are flattened into
params such as `permitSingle.details.amount`.

### Unknown selector, malformed calldata, selector clashes

- **Unknown selector:** local → target ABI → OpenChain → 4byte. If all fail:
  `signatureConfidence: "unverified"`, no `functionSignature`, no params,
  `type: "Unknown"`. `UNVERIFIED_FUNCTION` does **not** fire because it requires
  a signature.
- **Malformed calldata:** `normalizeInput`/`normalizeData` rejects non-`0x`,
  non-hex, and odd-length data with `INVALID_INPUT` (`inputs.ts:42-55`).
  Non-empty even hex shorter than 4 bytes (other than `0x`) becomes an unknown
  selector; ABI decode failure
  leaves the signature but `params: []` (`decoder/index.ts:89-97`, `358-410`).
- **ERC-20/721 selector clashes:** `0x23b872dd` is `transferFrom(address,address,
  uint256)` for ERC-20/721/1155; `0x095ea7b3` is shared by ERC-20 `approve` and
  ERC-721 `approve`. `classifyCall` (`decoder/index.ts:113-142`) uses
  `getKnownToken(chainId,target)?.kind` to choose ERC-721/1155 when the target is
  registered; otherwise it defaults to ERC-20. Arbitrary NFTs not in the registry
  can therefore be labelled ERC-20. `setApprovalForAll` is always typed
  `ERC-721 Approval`, even for ERC-1155. `safeTransferFrom` uses the signature
  length/known kind.

### Partially decoded cases and representation

- Universal Router `PERMIT2_PERMIT` (0x0a), `PERMIT2_PERMIT_BATCH` (0x0e),
  `PERMIT2_TRANSFER_FROM_BATCH` (0x0f) have no `types` in
  `UNIVERSAL_COMMANDS` (`decoder/index.ts:153-217`). They still produce a child
  with `command: "PERMIT2_PERMIT"` (etc.), `type: "Permit"`/`"ERC-20 Transfer"`,
  `confidence: "verified"`, `params: []`. No permit fields are decoded.
- Unknown Universal Router commands produce `command: "UNKNOWN_0x.."`,
  `type: "Unknown"`, `confidence: "unverified"`, `params: []`.
- V2/V3 swap commands decode recipient/amounts/path, but V3 path is reduced to
  token addresses only (no fee tiers); V2 path is a token list.
- `PERMIT2_TRANSFER_FROM` (0x0d) decodes token/recipient/amount.
- Multicall3 `aggregate3Value` child value is not attached to the child call.
- Top-level Permit2 `permit` tuple is flattened; no signature verification.

---

## 3. SIMULATION

### Backends and selection

The third backend is the **RPC backend** (`simulateViaRpc` in
`simulator/rpc.ts`): it uses `eth_call` to determine success/revert and
`eth_estimateGas` for gas. It is not a state-diff simulation. `types.ts` also
contains a legacy `"eth_call"` backend literal, but no current code path emits it.

`simulateTx` (`simulator/index.ts:23-122`) builds a tenderly config from options
+ env (`TENDERLY_ACCESS_KEY`, `TENDERLY_ACCOUNT`, `TENDERLY_PROJECT`). Selection:

| Requested | Order |
|---|---|
| `auto` | Tenderly configured (`key && account && project`) → `tenderly, trace, rpc`; otherwise `trace, rpc` |
| `tenderly` | `tenderly, trace, rpc` (even if not configured) |
| `trace` | `trace, rpc` |
| `rpc` | `rpc` only |

Any backend error/`BackendUnavailable` falls through to the next; notes are
accumulated. If all fail, the result is `status: "unavailable"`, `backend:
"none"`, `error` = last failure, capabilities all false, and notes from every
attempt. `trace` is tried before `rpc` in auto mode because it can produce diffs.

### Capabilities flags (exact)

| Backend | success | gas | balances | approvals | stateChanges | events | trace |
|---|---|---|---|---|---|---|---|
| RPC (`rpc.ts:88-103`) | `true` always | `gasKnown` (estimateGas succeeded) | false | false | false | false | false |
| Trace (`trace.ts:142-158`) | `true` | `gasUsed > 0` | true | true | `stateChangesAvailable` (prestate succeeded; default on) | true | true |
| Tenderly (`tenderly.ts:244-260`) | `true` | `resolvedGas > 0` | true | true | `stateChanges.length > 0` | true | true |
| None (`common.ts:68-96`) | false | false | false | false | false | false | false |

Important: `capabilities.success` means “this backend can determine the outcome,”
not “the transaction succeeded.” Tenderly/trace set `balances`, `approvals`,
`events`, and `trace` unconditionally even when their arrays are empty. RPC sets
`balances`/`approvals`/`stateChanges`/`events` false.

### Failure → status mapping

`status` is `success | revert | unavailable`; `success` (the boolean) is true
only for `status: "success"` (`types.ts:173-215`).

| Condition | Result |
|---|---|
| RPC `eth_call` throws `isRevertError` (`CALL_EXCEPTION`, `UNPREDICTABLE_GAS_LIMIT`, message `execution reverted`/`reverted with reason`/`VM Exception`) | `revert`, reason decoded (`rpc.ts:45-56`; `errors.ts:31-39`) |
| RPC `eth_call` timeout | fallback; if final, `unavailable` `RPC_TIMEOUT` |
| RPC other error / no provider | fallback; final `unavailable` (`RPC_ERROR`) |
| RPC `eth_call` succeeds but `estimateGas` fails | `success`, `gasUsed: 0`, `capabilities.gas: false`, note (`rpc.ts:64-78`) |
| Trace `debug_traceCall` unsupported (`isUnsupportedRpcError`) | fallback; final `unavailable` if no RPC |
| Trace other RPC error | fallback; final `unavailable` |
| Trace root has `error` matching `isTransactionLevelError` (insufficient funds/nonce/replacement/underpriced/already known) | fallback; final `unavailable` (`trace.ts:70-74`; `common.ts:162-167`) |
| Trace root has any other `error` | `revert` |
| Trace `prestateTracer` fails | underlying success/revert, `stateChangesAvailable: false`, note; not unavailable |
| Tenderly missing key/account/project | fallback; final `unavailable` |
| Tenderly HTTP/fetch/invalid JSON/missing `transaction` | fallback; final `unavailable` |
| Tenderly `transaction.status` false + transaction-level reason | fallback; final `unavailable` (`tenderly.ts:204-214`) |
| Tenderly `transaction.status` false otherwise | `revert` |
| Tenderly `status` true (or missing with no error_message) | `success` (`normalizeStatus:117-125`) |
| All backends fail | `unavailable`, `backend: "none"`, error last failure, notes |

`SimulationResult.backend` also includes the legacy literal `"eth_call"` in
`types.ts`, but no current code path produces it; actual values are `"tenderly"`,
`"trace"`, `"rpc"`, or `"none"`.

`decodeRevertReason` decodes `Error(string)`, `Panic(uint256)`, or a custom
selector from error data; otherwise it trims the provider message
(`common.ts:103-148`).

### Data present/absent

| Data | Tenderly | Trace | RPC |
|---|---|---|---|
| outcome / revert reason | yes | yes | yes |
| gas used/limit/percent | yes if resolved | yes if gasUsed > 0 | gas if estimate succeeded |
| balance changes | asset_changes, else logs + call value | logs + call value transfers | none |
| approvals | logs | logs | none |
| state diffs | `raw_state_diff`/`state_diff` | prestate diff | none |
| events | logs | logs | none |
| internal call tree | not surfaced (used only for value/logs) | not surfaced (used only for value/logs) | none |
| decoded calls | decoder (`decoded.calls`), not simulation | same | same |
| gas price | request value | request value | request value |
| notes | yes | yes | yes |

Tenderly’s asset/balance docs describe ERC-20/ERC-721; the parser also accepts
other type strings but this is not documented by Tenderly.

---

## 4. SAFETY RULES

`runSafetyChecks` (`checker/index.ts:475-529`) evaluates 15 rules. It catches
exceptions per rule (returns []), deduplicates by `rule:message`, sorts by
severity, then scores.

| Rule ID | Severity | Exact trigger | Needs | Implementation | Existing test |
|---|---|---|---|---|---|
| `UNLIMITED_APPROVAL` | HIGH if spender unknown; MEDIUM if safe-spender allowlist | Any approval/Permit call with amount containing `MAX_UINT256`/MAX_UINT256 decimal **or** MAX_UINT160 decimal; amount found by `amount`, `value`, `_value`, `details.amount` | decoded calls | `checker/index.ts:93-117`; `isUnlimited:62-69` | “decodes an unlimited USDC approval…”, “Permit2 approvals…”, “unlimited approval to an unknown spender…”, “unlimited approval to a known router…” |
| `UNVERIFIED_SPENDER` | MEDIUM | Approval/Permit spender not in chain safe-spender allowlist; skipped if spender entity `isContract === false` (handled by EOA rule) | decoded + entities (RPC `getCode`) | `:119-142` | “unlimited approval to an unknown spender…” |
| `APPROVAL_TO_EOA` | HIGH | Approval/Permit spender entity `isContract === false` | decoded + entities (`getCode`) | `:144-168` | none |
| `SET_APPROVAL_FOR_ALL` | HIGH | Any call with `functionName === "setApprovalForAll"` or type `ERC-721 Approval`, `approved !== "false"`, operator not in safe-operator allowlist | decoded | `:170-194` | “setApprovalForAll is ignored…”, “…to an unknown operator is HIGH” |
| `HIDDEN_APPROVAL` | HIGH | `simulation.approvals.length > 0`, top-level type not approval/permit/ERC-721 Approval, spender not safe | simulation.approvals (trace/Tenderly) | `:196-225` | “hidden approvals inside a generic call…” |
| `TRANSFER_TO_UNKNOWN_CONTRACT` | MEDIUM | Type in ETH/ERC-20/721/1155 transfer; recipient entity `isContract === true` and `known !== true` | decoded + entities (`getCode`), no simulation | `:232-260` | “transfer to an unknown contract is flagged” |
| `UNEXPECTED_TRANSFER` | MEDIUM | Type `Generic Contract Call` or `Multicall`; event name `Transfer`; event `from` equals decoded.from; recipient entity contract and not known | simulation.events + entities | `:262-288` | none |
| `HIGH_VALUE_TRANSFER` | MEDIUM at ≥1 native; HIGH at ≥10 native | `BigInt(decoded.valueWei) >= 1e18` (HIGH at `>= 1e19`) | decoded | `:290-312`; constants `:17-18` | none |
| `ZERO_ADDRESS_TARGET` | HIGH | `decoded.to` is zero, or any address param equals zero except names ending `spender`/`operator`/`owner` | decoded | `:314-342` | none |
| `TX_WILL_REVERT` | HIGH | `simulation.status === "revert"` | status | `:344-359` | “reverts are DANGEROUS…” |
| `SIMULATION_UNAVAILABLE` | MEDIUM | `simulation.status === "unavailable"` | status | `:361-376` | “reverts are…unavailable…”, “analyzeTx works without an RPC…” |
| `GAS_LIMIT_TOO_LOW` | LOW | status `success`, gasUsed > 0, gasLimit > 0, `gasLimit/gasUsed < 1.1` | gas | `:378-396` | “LOW-only findings…” |
| `HIGH_GAS_LIMIT` | LOW | `simulation.gasLimit >= 2_000_000` (does not check status) | gasLimit | `:416-431` | none |
| `HIGH_GAS_PRICE` | MEDIUM | gas price = `simulation.gasPriceWei ?? decoded.gasPriceWei`; fires when `> 200 gwei` (strict `>`) | gas price | `:398-414` | none |
| `UNVERIFIED_FUNCTION` | LOW | `signatureConfidence === "unverified"` **and** `functionSignature` exists | decoded | `:433-452` | none |

Notes:
- `HIGH_VALUE_TRANSFER` applies to any transaction with native `valueWei`, not
  only `ETH Transfer`.
- `HIGH_GAS_LIMIT` can fire on an `unavailable` simulation because
  `unavailableResult` sets a gasLimit from the request (or 21000).
- `UNVERIFIED_FUNCTION` does not fire when no signature was resolved; that case
  can remain SAFE.
- `UNVERIFIED_SPENDER`/`APPROVAL_TO_EOA` depend on `entities[...].isContract`,
  which requires an RPC `eth_getCode`; without a provider these stay `undefined`
  and neither EOA rule fires.

---

## 5. SCORING AND VERDICT

`runSafetyChecks` (`checker/index.ts:501-529`):

- `hasHigh = warnings.some(severity === "HIGH")`
- `score = hasHigh ? "DANGEROUS" : warnings.length > 0 ? "WARNINGS" : "SAFE"`
- `passed = warnings.length === 0`
- `riskScore = max(SEVERITY_POINTS[severity])` over warnings; HIGH=90,
  MEDIUM=50, LOW=15; **not cumulative**. `0` when no warnings. In practice the
  maximum is 90, although `types.ts`/handoff docs say 0–100.
- Because SAFE requires `warnings.length === 0`, `score === "SAFE"` and
  `passed === true` are equivalent in the current code. There is no SAFE with
  `passed === false`.

### Key question

**(a) Can verdict be SAFE / `passed === true` when simulation is `unavailable`?**
**No.** `simulationUnavailableRule` (`checker/index.ts:361-376`) emits a MEDIUM
warning for every unavailable result. `score` becomes WARNINGS and `passed`
false. Covered by tests #12 and #17.

**(b) Can verdict be SAFE / `passed === true` with RPC-only and no balance/
approval/state diffs?**
**Yes, if no other rule fires.** `simulateViaRpc` sets `balances`, `approvals`,
`stateChanges`, `events` to false (`rpc.ts:88-103`), but `runSafetyChecks` has no
capability-based warning. A benign ETH/token transfer with a successful RPC
`eth_call`, no risky decoded fields, and no gas-price/limit issue yields no
warnings → SAFE/passed true despite missing diffs. **No existing test covers
this**; the RPC-fallback test (#18) uses an unlimited approval, so it is
DANGEROUS for unrelated reasons.

**(c) Can verdict be SAFE / `passed === true` when decoding is partial or
confidence is `unverified`?**
- **Unverified with a signature:** `UNVERIFIED_FUNCTION` fires (LOW) →
  WARNINGS/passed false (`checker/index.ts:433-452`). The rule checks only
  `"unverified"`, so `registry` confidence (OpenChain) is **not** flagged.
- **Unverified without a signature:** the rule returns [] (`if
  (!functionSignature) return []`), so no warning; if simulation succeeds and no
  other rule fires, SAFE/passed true. `decodeCallData` sets exactly this state
  when all selector lookups fail (`decoder/index.ts:398-410`).
- **Partially decoded calls** (e.g., Universal Router `PERMIT2_PERMIT` child with
  `params: []`, or partial nested decoding) are represented as normal calls with
  verified/curated confidence and no “partial” warning. They can be SAFE/passed
  true if no rule fires.
- **No existing test** covers unverified-without-signature or partial-decode
  SAFE outcomes.

---

## 6. SURFACES

### CLI (`apps/cli/src/index.ts`)

Flags on `check`:

`-f/--file`, `--tx`, `--to`, `--from`, `--data`, `--value`, `--gas-limit`,
`--gas-price`, `--nonce`, `--chain-id`, `--rpc`, `--simulation
auto|tenderly|trace|rpc`, `--tenderly-key`, `--tenderly-account`,
`--tenderly-project`, `--timeout`, `--json`, `--fail-on
safe|warnings|dangerous`.

Input modes:
- `--file`: JSON read; uses `parsed.tx ?? parsed` (no schema validation).
- `--tx`: hash, signed hex, or calldata. Calldata needs `--to`.
- Inline `--to/--data` (plus optional `--from/--value/--gas-limit/--gas-price/
  --nonce`): builds a structured object.
- `--chain-id` explicit wins; otherwise an object/file `chainId`; otherwise 1.
- `--rpc` optional; defaults to the chain’s public RPC.

`--fail-on` (default `dangerous`): ranks SAFE=0, WARNINGS=1, DANGEROUS=2 and
exits 1 when `scoreRank >= failOnRank`. Therefore `safe` always exits 1,
`warnings` exits 1 for WARNINGS/DANGEROUS, `dangerous` only for DANGEROUS. The
check occurs **after** output; invalid `--fail-on` exits 2 after printing.

Exit codes: **0** success, **1** fail-on threshold, **2** analysis/argument
error (also invalid `--simulation`/`--fail-on`, missing input, fatal error).
`--json` prints the full `AnalysisResult`; human output prints decoded fields,
call tree, simulation status/backend/coverage, balance/approval/state summaries,
backend notes, and safety risk/warnings.

### API (`POST /api/analyze`, `apps/web/app/api/analyze/route.ts`)

Request body read by the route:

```json
{
  "tx": "hash | signed hex | calldata | object",
  "rpcUrl": "https://…",
  "chainId": 1,
  "tenderlyKey": "optional",
  "tenderlyAccount": "optional",
  "tenderlyProject": "optional",
  "simulationBackend": "auto | tenderly | trace | rpc"
}
```

**The route does not read a top-level `to` field.** For raw-calldata strings it
passes no `to`, so `normalizeInput` will reject with “A `to` address is
required.” Use `tx: {to, data}` instead. This differs from `README.md:68-79`,
which shows a top-level `to`.

Validations:
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Auth first: if `API_TOKEN` set, exact `Authorization: Bearer <token>`; else 401
  `UNAUTHORIZED`.
- Rate limit: in-memory map, 20 requests / 60 s per IP (first
  `x-forwarded-for` value, else `x-real-ip`, else `unknown`); 429
  `RATE_LIMITED` with `retryAfter`.
- `content-length > 100_000` → 413 `INVALID_INPUT`; string `tx` > 200_000 or
  object `JSON.stringify(tx)` > 200_000 → 413.
- JSON must parse; body must be object; `tx` must be string/object; `rpcUrl`
  required string ≤2048; `chainId` integer in the six supported chains.
- `assertSafeRpcUrl`: HTTPS unless `ALLOW_HTTP_RPC=true`; blocks
  localhost/private/link-local; default host allowlist + `ALLOWED_RPC_HOSTS`;
  `ALLOW_CUSTOM_RPC=true` allows other public hosts with DNS private-IP checks.
- `tenderlyKey` truncated to 256 chars; account/project to 128; invalid
  `simulationBackend` is silently coerced to `auto`.
- No validation of the `tx` object shape; arrays pass `typeof === "object"`.
- No state-change override; fixed `timeoutMs: 20000`; no-store response.

Error shape: `{ "error": string, "code": string }` (rate limit adds
`retryAfter`). Status mapping (`statusForCode`):
`INVALID_INPUT`/`CHAIN_MISMATCH` 400; `TX_NOT_FOUND` 404; `UNAUTHORIZED` 401;
`RPC_NOT_ALLOWED` 403; `RATE_LIMITED` 429; `RPC_TIMEOUT` 504; other
`AnalysisError` 502; non-`AnalysisError` 500 `INTERNAL`. Body/tx-too-large uses
413 directly.

Known API limitations: in-memory rate limit is per process and bypassable by
spoofing `x-forwarded-for`; a chunked request without `content-length` is not
bounded by the 100 KB check; allowlisted hosts are not DNS-resolved for private
IPs (only custom hosts are).

---

## 7. READY-TO-USE SAMPLE DATA

Produced on 2026-10-22 (system output timestamps UTC) with an inline Node script
and the same mock JSON-RPC pattern as `integration.test.mjs`. No mainnet network
was used. Outputs are trimmed: `calls`/`entities` details, event topics/data, and
some repeated fields are omitted; the shown values are actual.

### Sample 1 — benign ERC-20 transfer (trace backend)

Input: `to=USDC`, `from=Vitalik`, `data=transfer(0x1111…, 1000000)`, gasLimit
200000; mock `debug_traceCall` returns one USDC Transfer log and prestate.
Result: `simulation.status=success`, `backend=trace`, balances −1/+1 USDC,
state balance 0x0→0x1, `safety: SAFE`, `riskScore 0`.

```json
{
  "decoded": {
    "type": "ERC-20 Transfer",
    "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "chainId": 1,
    "contractName": "USD Coin",
    "functionSignature": "transfer(address,uint256)",
    "signatureConfidence": "curated",
    "summary": "Send 1 USDC to 0x1111…1111.",
    "params": [
      { "name": "to", "type": "address", "value": "0x1111111111111111111111111111111111111111" },
      { "name": "amount", "type": "uint256", "value": "1000000" }
    ],
    "valueEth": "0.0", "valueWei": "0", "gasLimit": "200000", "txTypeEIP": "Legacy"
  },
  "simulation": {
    "status": "success", "success": true, "gasUsed": 50000, "gasLimit": 200000,
    "gasUsedPercent": 25, "backend": "trace",
    "balanceChanges": [
      { "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "token": "USDC", "delta": "-1", "deltaRaw": "-1000000", "kind": "erc20", "decimals": 6, "direction": "out" },
      { "address": "0x1111111111111111111111111111111111111111", "token": "USDC", "delta": "+1", "deltaRaw": "1000000", "kind": "erc20", "decimals": 6, "direction": "in" }
    ],
    "approvals": [],
    "stateChanges": [ { "address": "0x1111111111111111111111111111111111111111", "kind": "balance", "before": "0x0", "after": "0x1" } ],
    "events": [ { "name": "Transfer", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "params": { "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "to": "0x1111111111111111111111111111111111111111", "value": "1", "token": "USDC" } } ],
    "revertReason": null,
    "capabilities": { "success": true, "gas": true, "balances": true, "approvals": true, "stateChanges": true, "events": true, "trace": true },
    "notes": []
  },
  "safety": { "passed": true, "score": "SAFE", "riskScore": 0, "warnings": [] },
  "meta": { "version": "0.6.0", "chainId": 1, "chainName": "Ethereum Mainnet", "nativeSymbol": "ETH", "inputKind": "structured", "durationMs": 85, "timestamp": "2026-10-22T19:54:38.099Z", "notes": [] }
}
```

### Sample 2 — unlimited approve, RPC fallback (DANGEROUS)

Input: `approve(0xbadbad…, MAX_UINT256)` on USDC, gasLimit 200000; mock trace
unsupported, so RPC `eth_call` + `estimateGas` (21000). Mock `eth_getCode`
returns EOA (`0x`) for the spender.

```json
{
  "decoded": {
    "type": "ERC-20 Approve",
    "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "chainId": 1, "contractName": "USD Coin",
    "functionSignature": "approve(address,uint256)",
    "signatureConfidence": "curated",
    "summary": "Approve an unlimited amount of USDC for 0xbaDB…badb.",
    "params": [
      { "name": "spender", "type": "address", "value": "0xbaDBAdbADbaDBADBAdBaDbaDbadBAdbaDbaDbadb" },
      { "name": "amount", "type": "uint256", "value": "MAX_UINT256 (unlimited)" }
    ],
    "valueEth": "0.0", "valueWei": "0", "gasLimit": "200000", "txTypeEIP": "Legacy"
  },
  "simulation": {
    "status": "success", "success": true, "gasUsed": 21000, "gasLimit": 200000,
    "gasUsedPercent": 11, "backend": "rpc",
    "balanceChanges": [], "approvals": [], "stateChanges": [], "events": [],
    "revertReason": null,
    "capabilities": { "success": true, "gas": true, "balances": false, "approvals": false, "stateChanges": false, "events": false, "trace": false },
    "notes": [
      "RPC-only simulation executes eth_call/eth_estimateGas; balance, approval, event, and state diffs require a trace or Tenderly backend.",
      "trace backend unavailable: This RPC does not expose debug_traceCall."
    ]
  },
  "safety": {
    "passed": false, "score": "DANGEROUS", "riskScore": 90,
    "warnings": [
      { "rule": "APPROVAL_TO_EOA", "severity": "HIGH", "message": "The approval target 0xbaDB…badb is an externally owned account, not a contract.", "confidence": "high", "evidence": { "spender": "0xbaDBAdbADbaDBADBAdBaDbaDbadBAdbaDbaDbadb" } },
      { "rule": "UNLIMITED_APPROVAL", "severity": "HIGH", "message": "Unlimited token approval granted to 0xbaDB…badb.", "confidence": "high", "evidence": { "spender": "0xbaDBAdbADbaDBADBAdBaDbaDbadBAdbaDbaDbadb", "amount": "MAX_UINT256 (unlimited)", "knownAs": null } }
    ]
  },
  "meta": { "version": "0.6.0", "chainId": 1, "chainName": "Ethereum Mainnet", "nativeSymbol": "ETH", "inputKind": "structured", "durationMs": 87, "timestamp": "2026-10-22T19:54:38.187Z", "notes": ["RPC-only simulation executes eth_call/eth_estimateGas; balance, approval, event, and state diffs require a trace or Tenderly backend.", "trace backend unavailable: This RPC does not expose debug_traceCall."] }
}
```

### Sample 3 — unavailable simulation (WARNINGS)

Input: structured ETH transfer of 1 wei to `0x1111…`, **no `rpcUrl`**.

```json
{
  "decoded": {
    "type": "ETH Transfer", "from": "unknown", "to": "0x1111111111111111111111111111111111111111",
    "chainId": 1, "signatureConfidence": "verified", "params": [],
    "summary": "Send 0.000000000000000001 ETH to 0x1111…1111.",
    "valueEth": "0.000000000000000001", "valueWei": "1", "gasLimit": "200000", "txTypeEIP": "Legacy"
  },
  "simulation": {
    "status": "unavailable", "success": false, "gasUsed": 0, "gasLimit": 21000,
    "gasUsedPercent": 0, "balanceChanges": [], "approvals": [], "stateChanges": [], "events": [],
    "revertReason": null, "backend": "none",
    "capabilities": { "success": false, "gas": false, "balances": false, "approvals": false, "stateChanges": false, "events": false, "trace": false },
    "error": { "code": "RPC_ERROR", "message": "No RPC backend is configured." },
    "notes": [
      "trace backend unavailable: No RPC backend is configured.",
      "rpc backend unavailable: No RPC backend is configured."
    ]
  },
  "safety": {
    "passed": false, "score": "WARNINGS", "riskScore": 50,
    "warnings": [ { "rule": "SIMULATION_UNAVAILABLE", "severity": "MEDIUM", "message": "Execution could not be simulated: No RPC backend is configured..", "confidence": "high", "evidence": { "code": "RPC_ERROR" } } ]
  },
  "meta": { "version": "0.6.0", "chainId": 1, "chainName": "Ethereum Mainnet", "nativeSymbol": "ETH", "inputKind": "structured", "durationMs": 2, "timestamp": "2026-10-22T19:54:38.190Z", "notes": ["trace backend unavailable: No RPC backend is configured.", "rpc backend unavailable: No RPC backend is configured."] }
}
```

### Real hashes/calldata in tests/docs

- No real transaction hashes. `integration.test.mjs:12` uses fake
  `0xabab…`; the mock returns a fixed approve for any hash.
- `examples/dangerous_tx.json` is a synthetic ABI-encoded USDC `approve`; its
  `to` uses non-checksummed mixed case but core accepts/normalizes it.
- `examples/safe_tx.json` is a synthetic ETH transfer to `0x1111…` with value
  1e12 wei.
- Tests use real contract addresses (USDC, Permit2, Uniswap V2, Multicall3,
  Universal Router, Seaport, BAYC) but no mined transaction data.

---

## 8. GAPS FOR TESTING

### Untested behaviours

- **No CLI tests** (flags, input modes, `--fail-on`, exit codes, JSON shape).
- **No API route tests** (auth, rate limit, body limits, chain/RPC validation,
  status codes, top-level `to` behavior, no-store).
- **No tests for 7 rules:** `APPROVAL_TO_EOA`, `UNEXPECTED_TRANSFER`,
  `HIGH_VALUE_TRANSFER`, `ZERO_ADDRESS_TARGET`, `HIGH_GAS_LIMIT`,
  `HIGH_GAS_PRICE`, `UNVERIFIED_FUNCTION`.
- **No test for RPC-only SAFE with missing diffs**; the key scoring question (b).
- **No test asserts `passed === true`** for any SAFE result (existing tests assert
  `passed === false` in #5/#11 or only `score === "SAFE"` in #20).
- **No test for unverified-without-signature or partially decoded SAFE**; key
  question (c).
- **No test for score/riskScore across all severity combinations**, cumulative
  deduplication, or the 90/50/15 max formula.
- **No test for unknown selector, malformed (even but <4-byte) calldata, ABI
  decode failure, or selector clashes (ERC-20/721/1155).**
- **No test for proxy resolution** (EIP-1167/1967/beacon), Sourcify/OpenChain/
  4byte failure, confidence `verified`/`registry`, or `signatureCandidates`.
- **No test for Universal Router partial commands** (`PERMIT2_PERMIT`,
  batch commands, unknown command) or `aggregate3Value` value handling.
- **No test for Tenderly error/fallback branches** (missing config, HTTP error,
  invalid JSON, transaction-level failure, missing `transaction_info`).
- **No test for trace transaction-level errors → unavailable**, prestate failure,
  or provider timeout.
- **No test for RPC URL policy variants** (`ALLOWED_RPC_HOSTS`,
  `ALLOW_CUSTOM_RPC`, DNS resolving private, HTTP allowed).
- **No fixture or recorded real mainnet transaction**; ABI lookups are not
  exercised against real Sourcify/OpenChain/4byte.

### Hard to test / network-dependent

- Sourcify, OpenChain, 4byte, and Tenderly require network; no fixtures/caches
  are committed. Tests would need recorded responses or a mock `fetch`.
- `debug_traceCall` is not supported by many public RPCs; tests must mock it.
- Tenderly requires account/project/key; no test uses real credentials.
- API rate-limit/auth tests need a running Next server or route handler harness.

### Looks buggy / inconsistent

1. **API top-level `to` is ignored.** `README.md:68-79` and
   `docs/ai-agent-guide.md` show a top-level `to`, but
   `apps/web/app/api/analyze/route.ts` never reads/passes it. Raw calldata via
   the API must use `tx: {to, data}`.
2. **Capabilities are not “what the backend actually produced.”**
   `AGENTS.md` says they report actual production. Tenderly sets
   `balances/approvals/events/trace: true` unconditionally
   (`tenderly.ts:244-260`), and trace does the same (`trace.ts:142-158`), even
   when arrays are empty or `transaction_info` is missing. RPC sets
   `success: true` even for a revert (it means outcome known).
3. **`HIGH_GAS_LIMIT` can fire on unavailable simulation** because it checks
   the request-derived gasLimit without checking status (`checker:416-431`);
   `unavailableResult` can carry a large request gasLimit.
4. **`UNVERIFIED_FUNCTION` misses unresolved signatures** because it requires
   `functionSignature` (`checker:436-437`); an unknown selector with no lookup
   result can be SAFE.
5. **Proxy resolution is skipped when a direct ABI exists but lacks the
   selector.** `getTargetAbi` returns a Sourcify ABI immediately and only tries
   the proxy implementation if direct Sourcify fails (`registry.ts:308-344`).
6. **ERC-20/721 ambiguity defaults to ERC-20** for unregistered NFT contracts
   (`classifyCall:113-142`); `setApprovalForAll` is always `ERC-721 Approval`.
7. **Tenderly `normalizeStatus` treats a missing status + missing error_message
   as success** (`tenderly.ts:117-125`); a malformed response could be reported
   as success.
8. **Sample 3 message has a double period** (“…configured..”) because the rule
   appends `.` to a message that already ends with `.` (`checker:365-372`).
9. **`riskScore` max is 90, not 100**, despite docs saying 0–100
   (`checker:517-519`; `types.ts` comment).
10. **API rate limit trust:** `x-forwarded-for` is trusted and the map is
    per-process; spoofing/multi-instance deployment bypasses the limit.
11. **API body limit bypass:** only `content-length` is checked; chunked bodies
    without that header are not bounded at 100 KB (the JSON/tx length checks are
    200 KB).
12. **`simulateViaRpc` can return success with gasUsed 0** if estimateGas fails
    after a successful eth_call (`rpc.ts:64-78`); no rule warns about unknown
    gas, so a SAFE verdict is possible.
13. **`normalizeAddress` accepts invalid mixed-case checksums** by lowercasing
    any 40-hex address (`inputs.ts:17-29`); intentional leniency but worth a
    test.
14. **CLI `--nonce 0` is dropped** because the inline builder uses
    `options.nonce ? Number(...) : undefined` (`apps/cli/src/index.ts:157-166`);
    nonce 0 becomes undefined.
15. **CLI `--file` has no schema validation**; an array or malformed object is
    passed to `analyzeTx` and may be treated as a deployment (`tx.data` absent).
16. **API authentication is checked before rate limiting**; failed bearer
    attempts are not rate-limited (`route.ts:82-87` before `:90-96`).

### UNSURE / not verifiable here

- Whether Etherscan has pre-sign simulation or approval warnings: interactive
  pages returned HTTP 403; left N/D in the comparison work.
- Whether Rabby supports pre-sign simulation/balance diffs: official
  README/docs do not describe it; left N/D.
- Which “TxExplain” project is intended (TELLProtocol/TXExplain vs
  txexplain.com); the comparison used TELLProtocol.
- Whether Tenderly’s missing `transaction_info` should be treated as success;
  code currently does.
- Real-world accuracy of Sourcify/OpenChain/4byte mappings cannot be tested
  without network fixtures.

---

## Final testing priorities

1. API route end-to-end tests: auth, 413/429/403/504 mappings, top-level vs
   structured `to`, chain mismatch, no-store.
2. RPC-only benign transaction: assert SAFE/passed true while capabilities are
   false (documents the key limitation).
3. Unknown selector/unverified signature cases: SAFE when no signature, WARNINGS
   when a signature exists; partial Universal Router command representation.
4. The seven untested safety rules, especially the exact 1/10 native and 200 gwei
   thresholds and `APPROVAL_TO_EOA`.
5. Tenderly/trace failure matrix: transaction-level errors → unavailable,
   prestate failure → success with state false, missing `transaction_info` →
   current behavior.
