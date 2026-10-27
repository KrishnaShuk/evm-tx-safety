# Changelog

## v0.6.0

- Added the v0.6 safety engine: hidden-approval, unknown-contract transfer,
  unexpected-transfer, EOA approval, gas, and unverified-function rules.
- Per-chain token, spender, and marketplace allowlists.
- Evidence and confidence on every warning; consistent SAFE/WARNINGS/DANGEROUS
  scoring and a numeric risk score.
- Trace backend (`debug_traceCall` callTracer + prestateTracer) and fixed
  Tenderly account/project endpoint.
- ETH/token balance diffs, approval diffs, events from execution, and storage
  diffs.
- Recursive Multicall3, Uniswap multicall, Universal Router, Permit2, and
  EIP-2612 decoding.
- Plain-language intent summaries and signature confidence.
- Transaction-hash input and chain validation.
- API hardening: RPC allowlist/private-IP blocking, request limits, rate limit,
  optional bearer auth, no-store responses.
- CLI: `--tx` hash input, `--chain-id`, `--json`, `--fail-on`, backend
  selection, Tenderly flags.
- Tests (22) with a local mock JSON-RPC server; CI workflow; README.

## v0.5.0

- State diffs: ETH and token balance changes, approvals, execution events, and
  storage changes.

## v0.4.0

- Simulation core: provider abstraction, corrected Tenderly endpoint, trace
  backend, error taxonomy, timeouts.

## v0.3.0

- Trusted decoding: verified ABIs, proxy resolution, ranked selectors, nested
  calls, plain-language summaries.

## v0.2.0

- Real inputs: tx hash, raw calldata + target, chain validation, full field
  extraction.

## v0.1.0

- Security/tooling baseline: Next.js upgrade, RPC/SSRF policy, timeouts,
  error taxonomy, score consistency, lint/CI, docs.
