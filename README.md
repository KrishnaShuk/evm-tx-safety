# EVM TX Safety — v0.6

Pre-flight analysis for EVM transactions: decode calldata into intent, simulate
execution when a capable backend is available, and score the result with an
explainable safety rule engine.

## What v0.6 includes

**Inputs**
- Transaction hash (fetched from the selected chain)
- Signed raw transaction hex
- Raw calldata + target address
- Structured `{to, from, data, value, gasLimit, gasPrice, nonce, chainId}`

**Decoding**
- Curated ABIs for ERC-20/721/1155, WETH, Uniswap V2/V3, Universal Router,
  Permit2, and Multicall3
- Verified ABI lookup (Sourcify full/partial match), proxy resolution
  (EIP-1967, EIP-1167, beacon)
- Ranked selector lookup (local → target ABI → OpenChain → 4byte) with an
  explicit confidence: `verified`, `curated`, `registry`, `unverified`
- Recursive decoding of Multicall3, Uniswap multicall, Universal Router
  commands, Permit2, and EIP-2612 permits
- Plain-language intent summary

**Simulation (graceful fallback chain)**
1. **Tenderly** — full asset/state/event simulation when
   `TENDERLY_ACCESS_KEY`, `TENDERLY_ACCOUNT`, and `TENDERLY_PROJECT` are set
2. **Trace** — `debug_traceCall` (`callTracer` + `prestateTracer`) for
   success/revert, ETH and token balance changes, approvals, events, and
   storage diffs
3. **RPC** — `eth_call` + `eth_estimateGas` for outcome and gas only

Infrastructure failures are reported as `SIMULATION_UNAVAILABLE`, never as a
revert. Only an actual EVM revert produces `TX_WILL_REVERT`.

**Safety rules**
- `UNLIMITED_APPROVAL`, `UNVERIFIED_SPENDER`, `APPROVAL_TO_EOA`
- `SET_APPROVAL_FOR_ALL` (per-chain marketplace allowlist)
- `HIDDEN_APPROVAL` (approvals granted inside non-approval calls)
- `TRANSFER_TO_UNKNOWN_CONTRACT`, `UNEXPECTED_TRANSFER`
- `ZERO_ADDRESS_TARGET`, `HIGH_VALUE_TRANSFER`
- `TX_WILL_REVERT`, `SIMULATION_UNAVAILABLE`
- `GAS_LIMIT_TOO_LOW`, `HIGH_GAS_LIMIT`, `HIGH_GAS_PRICE`
- `UNVERIFIED_FUNCTION`

Scoring is consistent: **SAFE** only when there are no warnings, **WARNINGS**
for LOW/MEDIUM findings, **DANGEROUS** for any HIGH finding. Every warning
carries a confidence and optional evidence payload.

Supported chains: Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10),
Polygon (137), BNB Chain (56).

## Setup

```bash
npm install
npm run build
npm test
npm run lint
npm run dev        # http://localhost:3000 (or the next free port)
```

## Web API

`POST /api/analyze`

```json
{
  "tx": "0x…hash / 0x…signed / 0x…calldata",
  "to": "0x…",
  "rpcUrl": "https://eth.llamarpc.com",
  "chainId": 1,
  "tenderlyKey": "optional",
  "tenderlyAccount": "optional",
  "tenderlyProject": "optional",
  "simulationBackend": "auto"
}
```

`tx` may also be a structured object. The response is `AnalysisResult` with
`decoded`, `simulation`, `safety`, and `meta`.

### API security

The route validates the RPC URL, requires a supported chain, limits request
size, rate-limits by IP (20/min), and can require a bearer token.

| Env var | Purpose |
| --- | --- |
| `API_TOKEN` | If set, requests must send `Authorization: Bearer <token>` |
| `ALLOWED_RPC_HOSTS` | Comma-separated extra RPC hosts |
| `ALLOW_CUSTOM_RPC` | `true` allows any public HTTPS RPC host (private IPs stay blocked) |
| `ALLOW_HTTP_RPC` | `true` allows HTTP RPCs (local development only) |
| `TENDERLY_ACCESS_KEY` | Server-side Tenderly fallback |
| `TENDERLY_ACCOUNT` | Tenderly account slug |
| `TENDERLY_PROJECT` | Tenderly project slug |

Client-supplied Tenderly keys are forwarded per request; for a public
deployment prefer configuring Tenderly server-side and not exposing the field.

## CLI

```bash
# by hash
npx evm-safety check --tx 0x… --chain-id 1

# raw calldata + target
npx evm-safety check --to 0xA0b8… --data 0x095ea7b3… --chain-id 1

# JSON output, fail CI on any warning
npx evm-safety check --file examples/dangerous_tx.json --json --fail-on warnings
```

Options: `--rpc`, `--from`, `--value`, `--gas-limit`, `--gas-price`, `--nonce`,
`--simulation auto|tenderly|trace|rpc`, `--tenderly-{key,account,project}`,
`--timeout`, `--fail-on safe|warnings|dangerous`.

Exit codes: `0` success, `1` threshold reached, `2` analysis error.

## Architecture

```
packages/core/src
├── inputs.ts              # hash / signed hex / calldata / object normalization
├── config/                # chains, token registries, allowlists, RPC policy
├── abi/                   # curated ABIs, selector resolution, proxy lookup
├── decoder/               # recursive call decoding + plain-language summary
├── simulator/             # Tenderly, trace, and RPC backends; log/state parsing
├── checker/               # rule engine, evidence, scoring
├── token/metadata.ts      # symbol/decimals/kind resolution
└── index.ts               # analyzeTx + public module surface
```

The web app is a single-page analyzer; the CLI shares the same core. Tests are
in `packages/core/test` and use a local mock JSON-RPC server for simulation.

## Known limits

- ABI coverage is curated plus verified-source lookup; unverified contracts can
  still produce an `unverified` signature.
- ERC-721 and ERC-20 can share selectors; the decoder uses contract metadata to
  disambiguate where possible.
- Trace and Tenderly state diffs depend on the RPC/provider. RPC-only mode does
  not produce balance, approval, or storage diffs.
- The RPC allowlist is intentionally conservative. Add your provider host with
  `ALLOWED_RPC_HOSTS` or set `ALLOW_CUSTOM_RPC=true`.

## Feature comparison

See [feature_comparison.tex](./feature_comparison.tex) for a capability
comparison against Tenderly, Blockaid, Rabby, Pocket Universe, Fire, Foundry,
Slither, and Revoke.cash.

## License

MIT. See [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
