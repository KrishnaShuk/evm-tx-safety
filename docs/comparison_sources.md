# Comparison sources and evidence

**Checked:** 23 October 2026  
**Legend:** Yes = documented/supported; No = documented as absent/out of scope; Partial = limited/optional/backend-dependent; N/D = the official source does not describe it (not proof that it is absent).

This file backs `docs/comparison_tables.tex`. Competitor cells use only official
documentation, official repositories, or official package metadata. The EVM TX
Safety column is verified against the code in this repository.

---

## A. EVM TX Safety column — code evidence

| Table / cell | Evidence |
|---|---|
| 1. Decodes raw calldata | `packages/core/src/decoder/index.ts:358` (`decodeCallData`), `:375` (`resolveSelector`), `:461` (`decodeTx`) |
| 1. Nested calls | `packages/core/src/decoder/index.ts:313` (`decodeChildren`), `:300` (`decodeUniversalExecute`); recursive calls. Permit2 internals are partial: `UNIVERSAL_COMMANDS` in the same file decodes several commands, but complex Permit2 permit payloads are left undecoded. |
| 1. Plain-language summary | `packages/core/src/decoder/summary.ts:64` (`buildSummary`) |
| 1. Unverified/unknown contracts | `packages/core/src/abi/registry.ts:375` (`resolveSelector`), `:174` (OpenChain), `:208` (4byte), `:267` (proxy resolution), `:308` (`getTargetAbi`); `packages/core/src/types.ts` (`SignatureConfidence`) |
| 2. Simulates before sending | `packages/core/src/simulator/index.ts:23` (`simulateTx`, backend order), `trace.ts:28`, `tenderly.ts:130`, `rpc.ts:24` |
| 2. Token/balance changes | `packages/core/src/simulator/logs.ts:139` (`deriveDiffs`), `state.ts:17` (`parsePrestateDiff`); RPC-only mode reports these capabilities as false in `rpc.ts`. |
| 2. Gas estimate | `rpc.ts` (`eth_estimateGas`), `trace.ts` (`gasUsed`), `tenderly.ts` (`gas_used`), `common.ts` (`gasLimitNumber`) |
| 3. Safety warnings/risk score | `packages/core/src/checker/index.ts:454` (`RULES`), `:475` (`runSafetyChecks`), scoring/risk near the end of the file |
| 3. Unlimited/risky approvals | `checker/index.ts:94` (`UNLIMITED_APPROVAL`), `:145` (`APPROVAL_TO_EOA`), `:197` (`HIDDEN_APPROVAL`), plus the spender/operator rules in the same file |
| 4. Input types | `packages/core/src/inputs.ts:51` (`detectInputKind`), `:161` (`normalizeInput`) |
| 4. Interfaces | Web: `apps/web/app/page.tsx:351-365` (hash/hex/fields tabs); API: `apps/web/app/api/analyze/route.ts:78`; CLI: `apps/cli/src/index.ts:125` |
| 4. Open source/self-hostable | `LICENSE` (MIT), `package.json` (workspaces), `README.md` (build/run) |
| 4. Free/no account | `apps/web/app/api/analyze/route.ts` (`API_TOKEN` optional), `packages/core/src/simulator/index.ts` (Tenderly optional); an RPC is still required |
| 4. Six chains | `packages/core/src/config/chains.ts:43,79,106,133,160,186` (Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain) |

**Ours downgraded to Partial:** token/balance changes are “Partial (needs
trace/Tenderly)” because RPC-only mode uses `eth_call`/`eth_estimateGas` and
returns no diffs. Nested calls are Yes but noted as “Permit2 partial”, and
unknown-contract handling is Yes but noted as “offline confidence” because
Sourcify/OpenChain/4byte failures lower confidence.

---

## B. Competitor source ledger

### Etherscan

| Cell | Value | Source (checked 2026-10-23) |
|---|---|---|
| T1 Decodes raw calldata | Yes | https://info.etherscan.com/what-is-method-id — verified contracts show the function name; unverified contracts use “Similar Match” against verified bytecode |
| T1 Unverified/unknown | Partial | Same source — Similar Match “may not be 100% reliable”; unidentified functions show only the Method ID |
| T4 Input types | Partial (hash) | https://info.etherscan.com/what-is-method-id (transaction page → Input Data field) and https://docs.etherscan.io/endpoint-showcase/transaction |
| T4 Interfaces | Partial (web/API) | https://docs.etherscan.io/introduction (API) and https://etherscan.io/ (web explorer) |
| T4 Open source/self-host | No | Official service/docs; no open-source repository or self-host instructions found at https://etherscan.io/ |
| T4 Free/no account | Partial (free web; API key) | https://docs.etherscan.io/introduction and https://docs.etherscan.io/set-up-your-api-key |
| T4 Chains | 60+ | https://docs.etherscan.io/introduction (“60+ EVM chains”) |

Left N/D for Etherscan (no statement in accessible official pages): nested calls,
plain-language summary, simulation, token/balance changes, transaction gas
estimate, safety warnings/risk score, unlimited/risky approvals. Direct Etherscan
tool pages returned HTTP 403 to this environment; these need manual verification.

### Tenderly

| Cell | Value | Source (checked 2026-10-23) |
|---|---|---|
| T1 Decodes raw calldata | Yes | https://docs.tenderly.co/simulations/overview — decoded transaction trace |
| T1 Nested calls | Yes | Same source — decoded transaction trace / traces |
| T2 Simulates before sending | Yes | Same source — simulated single/bundled transactions |
| T2 Token/balance changes | Yes (ERC-20/721) | https://docs.tenderly.co/simulations/asset-balance-changes |
| T2 Gas estimate | Yes | https://docs.tenderly.co/simulations/overview — gas estimation |
| T2 Storage/state changes | Yes | Same source — storage updates |
| T4 Input types | Partial (tx object) | https://docs.tenderly.co/simulations/overview (API/RPC simulation) |
| T4 Interfaces | Partial (web/API/SDK) | Same source — dashboard, API, SDK |
| T4 Open source/self-host | No | Official hosted documentation; no open-source/self-host statement |
| T4 Free/no account | Partial (account) | https://docs.tenderly.co/platform/account/projects/api-tokens — account/project token required |
| T4 Chains | 96 | https://docs.tenderly.co/supported-networks |

Left N/D for Tenderly: plain-language summary, unverified/unknown contract ABI
resolution, safety warnings/risk score, unlimited/risky approvals.

### Loop Decoder (3loop)

| Cell | Value | Source (checked 2026-10-23) |
|---|---|---|
| T1 Decodes raw calldata | Yes | https://loop-decoder.3loop.io/guides/decode-method/ |
| T1 Nested calls | Yes | Same source — “Multicalls and deeply nested calls” |
| T1 Plain-language summary | Partial (experimental) | https://github.com/3loop/loop-decoder — transaction interpreter “experimental”; breaking changes expected |
| T1 Unverified/unknown contracts | Yes | https://loop-decoder.3loop.io/welcome/getting-started — ABI sources Etherscan, 4bytes, Openchain, Sourcify; proxy resolution reference |
| T2 Simulation | No | https://github.com/3loop/loop-decoder — library is decoder + interpreter; no simulation feature |
| T2 Token/balance changes | No | Same source — no simulation/balance-diff feature |
| T2 Gas estimate | No | Same source — no gas-estimation feature |
| T3 Safety warnings/risk score | No | Same source — no safety-rule feature |
| T3 Unlimited/risky approvals | No | Same source — decodes approvals but no safety warning |
| T4 Input types | Partial (hash/calldata) | Getting Started (decodeTransaction hash) and Decoding Calldata (decodeCalldata) |
| T4 Interfaces | Partial (library/playground) | https://loop-decoder.3loop.io/ and the playground |
| T4 Open source/self-host | Yes | GPL-3.0, https://github.com/3loop/loop-decoder |
| T4 Free/no account | Partial (ABI key) | Getting Started requires an Etherscan V2 API key in the default ABI store |
| T4 Chains | Any EVM | https://github.com/3loop/loop-decoder — any EVM transaction; user supplies RPC |

Left N/D for Loop Decoder: signed-transaction input.

### TxExplain (TELLProtocol/TXExplain, Arbitrum)

There are two similarly named projects. This table uses the official
TELLProtocol/TXExplain repository because it has a documented feature list. The
alternative `txexplain.com` is an Ethereum hash explainer; it was not mixed into
this column.

| Cell | Value | Source (checked 2026-10-23) |
|---|---|---|
| T1 Decodes raw calldata | Yes | https://github.com/TELLProtocol/TXExplain — transaction decoding by hash; swap/transfer decoding |
| T1 Plain-language summary | Yes | Same source — plain-English explanation engine |
| T1 Unverified/unknown contracts | Partial (risk flag) | Same source — “Unknown / unverified contracts” risk detection; no ABI/proxy lookup documented |
| T2 Simulation | No | Same source — “Transaction simulation & preview” is listed in the post-hackathon roadmap, not the MVP |
| T2 Gas estimate | Partial (gas used) | Same source — “Gas usage summary” (not a pre-sign estimate) |
| T3 Safety warnings/risk score | Yes | Same source — risk detection and risk flags |
| T3 Unlimited/risky approvals | Yes | Same source — “Unlimited token approvals” risk detection |
| T4 Input types | Partial (hash only) | Same source — paste an Arbitrum transaction hash |
| T4 Interfaces | Partial (web) | Same source — browser frontend with a PHP API; no public API documented |
| T4 Open source/self-host | Yes | Same source — MIT license and repository |
| T4 Free/no account | Partial (read-only demo) | Same source — live demo and read-only, no wallet connection; free/account terms not stated |
| T4 Chains | 1 (Arbitrum) | Same source — built specifically for Arbitrum One |

Left N/D for TxExplain: nested calls, token/balance changes (it identifies token
transfers, not balance deltas), unverified ABI/proxy resolution.

### Rabby

| Cell | Value | Source (checked 2026-10-23) |
|---|---|---|
| T1 Decodes raw calldata | Yes | https://github.com/RabbyHub/Rabby/blob/develop/package.json depends on `@rabby-wallet/rabby-action`; https://www.npmjs.com/package/@rabby-wallet/rabby-action exposes `parseAction` |
| T1 Plain-language summary | Yes | Same `rabby-action` package (`parseAction`, action-specific parsers) |
| T2 Gas estimate | Yes | https://github.com/RabbyHub/Rabby/blob/develop/docs/transaction.md — uses `web3.eth_estimateGas()` |
| T3 Safety warnings/risk score | Yes | `@rabby-wallet/rabby-security-engine` in package.json; https://www.npmjs.com/package/@rabby-wallet/rabby-security-engine |
| T3 Unlimited/risky approvals | Yes | `rabby-action` includes `approveToken`/`approveNFT`/`permit` `formatSecurityEngine` modules; security-engine dependency above |
| T4 Interfaces | Partial (extension) | https://github.com/RabbyHub/Rabby — browser plugin |
| T4 Open source/self-host | Yes (MIT build) | https://github.com/RabbyHub/Rabby — MIT license and build instructions |
| T4 Free/no account | Yes | Same repository — self-custody open-source wallet; no account service required |
| T4 Chains | All EVM | Same repository — “all EVM chains” |

Left N/D for Rabby: nested calls, unverified/unknown contract ABI resolution,
pre-sign simulation, token/balance changes, input types (hash/calldata/signed).
The official README/docs do not describe these; the wallet may implement some
internally. Needs manual verification with the installed extension.

---

## C. N/D cells (need manual verification)

**Table 1 (`tab:understanding`)**
- Etherscan: nested calls; plain-language summary.
- Tenderly: plain-language summary; unverified/unknown contract handling.
- TxExplain: nested calls.
- Rabby: nested calls; unverified/unknown contract handling.

**Table 2 (`tab:simulation`)**
- Etherscan: simulate before sending; token/balance changes; gas estimate.
- TxExplain: token/balance changes.
- Rabby: simulate before sending; token/balance changes.

**Table 3 (`tab:safety`)**
- Etherscan: safety warnings/risk score; unlimited/risky approvals.
- Tenderly: safety warnings/risk score; unlimited/risky approvals.

**Table 4 (`tab:practical`)**
- Rabby: input types.

---

## D. Comparison limitations

- No detection-accuracy benchmark was run. This compares documented capabilities,
  not precision/recall, coverage, latency, or security guarantees.
- “N/D” means the official source does not describe the capability; it is not a
  claim that the tool lacks it.
- Etherscan’s interactive tool pages returned HTTP 403 in this environment, so
  several Etherscan cells are N/D rather than guessed.
- Tenderly’s asset/balance documentation explicitly lists ERC-20 and ERC-721;
  ERC-1155 is not claimed in the table.
- TxExplain has two similar projects; the TELLProtocol/TXExplain repository
  (Arbitrum) was used consistently.
- Rabby’s public documentation is sparse for pre-sign simulation; N/D cells
  should be checked against the installed wallet before publication.
- LaTeX was not compiled because no `pdflatex`, `latexmk`, or `tectonic` binary is
  installed in this environment. The file was proofread for column counts, brace
  balance, escaped characters, and required packages.
