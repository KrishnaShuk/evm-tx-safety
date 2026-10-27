# Project Context — EVM TX Safety

Handoff context for coding agents. Read this before changing code.

## What it is

Open-source (MIT), self-hostable pre-sign analyzer for EVM transactions:
**decode → simulate → safety-score**, delivered as a web app, CLI, and HTTP API.
Current version: **v0.6.0**.

## Status

- `npm run build` — green (core, CLI, web)
- `npm test` — **22/22 passing**
- `npm run lint` — green
- `npm run typecheck` — green
- `npm audit --omit=dev` — **0 vulnerabilities**
- Dev-only audit noise remains in the ESLint toolchain (`eslint-config-next` → fast-glob/braces); not shipped at runtime.
- All v0.6 work is currently **uncommitted** on `main`. Do not commit unless asked.
- The user redesigned the web UI (glass cards, mesh background); preserve it and add features additively.

## Stack

- Node 20.9+, TypeScript, npm workspaces
- Core: ethers v6 (no axios)
- Web: Next.js **16.4.2**, React **19**, Turbopack, vanilla CSS
- CLI: commander, chalk, ora
- Tests: `node:test` + local mock JSON-RPC server

## Layout

```
apps/web/                 Next app + POST /api/analyze
apps/cli/                 evm-safety check
packages/core/src/
  inputs.ts               hash | signed hex | calldata+to | object
  config/chains.ts        6 chains, token/spender/operator registries
  config/rpc.ts           RPC allowlist, private-IP blocking
  abi/                    curated ABIs, Sourcify/proxy, ranked selectors
  decoder/                recursive call decoding, plain-language summary
  simulator/              Tenderly, debug_traceCall, eth_call backends
  checker/                rule engine, evidence, scoring
  token/metadata.ts       symbol/decimals/kind resolution
  index.ts                analyzeTx + public module surface
packages/core/test/       22 tests, mock RPC
docs/ai-agent-guide.md    UI/API notes
README.md, CHANGELOG.md, feature_comparison.tex, LICENSE
```

## Core pipeline

`analyzeTx(options)`:

1. Validate chain + RPC scheme.
2. Create provider (`staticNetwork: true`), verify `eth_chainId` matches selection.
3. `normalizeInput` (hash needs RPC; signed hex parses locally; calldata needs `to`).
4. Run `decodeTx` and `simulateTx` in parallel.
5. `runSafetyChecks`.
6. Return `{ decoded, simulation, safety, meta }`; destroy provider.

Main exports: `analyzeTx`, `decodeTx`, `simulateTx`, `runSafetyChecks`,
`normalizeInput`, `detectInputKind`, `assertSafeRpcUrl`, `defaultRpcForChain`,
`getChain/listChains`, error classes, all types.

## Decoding

- Curated ABIs: ERC-20/721/1155, WETH, Uniswap V2/V3, Universal Router,
  Permit2, Multicall3.
- Unknown selectors: local → target ABI (Sourcify full/partial) → OpenChain →
  4byte. Every call carries `confidence`: `verified | curated | registry | unverified`.
- Proxy resolution: EIP-1967, EIP-1167, beacon.
- Recursive decoding: Multicall3 aggregate/aggregate3/aggregate3Value,
  Uniswap multicall, Universal Router commands, Permit2, EIP-2612.
- Output includes `summary` (plain language), `calls` tree, `entities`
  (contract/known/token flags), params, tx hash, EIP type.

## Simulation

Backend order (`simulationBackend: auto`):

1. **Tenderly** if `TENDERLY_ACCESS_KEY` + `TENDERLY_ACCOUNT` + `TENDERLY_PROJECT`
   (correct endpoint: `/api/v1/account/{account}/project/{project}/simulate`)
2. **Trace**: `debug_traceCall` with `callTracer` + `prestateTracer`
3. **RPC**: `eth_call` + `eth_estimateGas`

Semantics:
- `status: "success" | "revert" | "unavailable"`; `success` is true only for success.
- Infrastructure/transaction-level errors (RPC down, insufficient funds, nonce)
  become `unavailable`, **never** `TX_WILL_REVERT`.
- `capabilities` reports what the backend actually produced.
- RPC-only mode has no balance/approval/state diffs.

## Safety rules

`UNLIMITED_APPROVAL`, `UNVERIFIED_SPENDER`, `APPROVAL_TO_EOA`,
`SET_APPROVAL_FOR_ALL` (operator allowlist), `HIDDEN_APPROVAL`,
`TRANSFER_TO_UNKNOWN_CONTRACT`, `UNEXPECTED_TRANSFER`, `ZERO_ADDRESS_TARGET`,
`HIGH_VALUE_TRANSFER`, `TX_WILL_REVERT`, `SIMULATION_UNAVAILABLE`,
`GAS_LIMIT_TOO_LOW`, `HIGH_GAS_LIMIT`, `HIGH_GAS_PRICE`,
`UNVERIFIED_FUNCTION`.

Scoring:
- SAFE only when **no** warnings
- WARNINGS when any LOW/MEDIUM
- DANGEROUS when any HIGH
- `passed = warnings.length === 0`, plus `riskScore` 0–100
- Every warning has severity, confidence, recommendation, optional evidence.

## Chains and registries

Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10), Polygon (137),
BNB Chain (56). Each has tokens, known contracts, safe spenders, and safe
marketplace operators. L2 router coverage is not exhaustive.

## Delivery surfaces

**Web** (`apps/web/app/page.tsx`): single page; Tx Hash / Signed Hex /
Calldata-Fields tabs; summary, confidence badges, nested call tree, simulation
coverage chips, balances, approvals, state changes, events, evidence details.

**API** (`POST /api/analyze`): validates body size (100 KB), chain, RPC via
allowlist/private-IP block, rate limit 20/min/IP, optional bearer auth, no-store.

**CLI**:
```bash
node apps/cli/dist/index.js check --tx 0x… --chain-id 1
node apps/cli/dist/index.js check --to 0x… --data 0x… --json --fail-on warnings
```
Exit codes: 0 ok, 1 fail-on threshold, 2 analysis error.

## Commands

```bash
npm install
npm run dev        # builds core, then next dev
npm run build      # core + cli + web
npm test           # core build + 22 tests
npm run lint
npm run typecheck
npm start --workspace=apps/web
```

## Environment

```
API_TOKEN=                 # optional bearer auth
ALLOWED_RPC_HOSTS=         # comma-separated extra hosts
ALLOW_CUSTOM_RPC=false     # true = any public HTTPS host (private IPs still blocked)
ALLOW_HTTP_RPC=false       # local development only
TENDERLY_ACCESS_KEY=
TENDERLY_ACCOUNT=
TENDERLY_PROJECT=
```

Web API blocks localhost/private/link-local RPC targets. CLI/core can use local
RPCs. Default public RPC hosts for the 6 chains are allowlisted.

## Known limits / gotchas

- Rules are transparent heuristics, not ML/threat-intel.
- Trace diffs require an RPC exposing `debug_traceCall`; public RPCs often do not.
- Tenderly needs account/project, not just a key.
- ERC-20/721 share selectors; disambiguation relies on registry/interface checks.
- Universal Router Permit2 command internals are partially decoded.
- Sourcify/OpenChain/4byte lookups need network; failures degrade confidence.
- Next 16 requires Node ≥20.9; React 19.
- `*.tsbuildinfo` and `.next` are ignored.
- No LICENSE assumptions beyond MIT.

## Docs

- `README.md` — setup, API, env, limits
- `CHANGELOG.md` — v0.1 → v0.6
- `docs/ai-agent-guide.md` — architecture/UI/API notes
- `feature_comparison.tex` — visual comparison tables
- `LICENSE` — MIT
