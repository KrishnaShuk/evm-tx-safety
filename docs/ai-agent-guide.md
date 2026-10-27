# EVM TX Safety — AI Agent Documentation

## Project Overview

**Name:** `evm-tx-safety`  
**Type:** TypeScript monorepo (npm workspaces)  
**Location:** `/home/krishna/Projects/evm-tx-safety`  
**Purpose:** Pre-flight transaction analyzer — decode, simulate, and safety-check EVM transactions before signing.

---

## Monorepo Structure

```
evm-tx-safety/
├── apps/
│   ├── web/          # Next.js 14 frontend (port 3001)
│   └── cli/          # CLI tool
├── packages/
│   └── core/         # @evm-safety/core — shared analysis library
├── package.json      # Root workspace config
└── *.tex             # LaTeX research paper assets
```

---

## Frontend Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16.4.2 (App Router, Turbopack) | `apps/web/` |
| React | 19 | Client components only (`"use client"`) |
| Styling | Vanilla CSS (`globals.css`) | No Tailwind, no CSS-in-JS |
| Icons | `lucide-react` ^0.441.0 | Available but unused (available for future use) |
| Utilities | `clsx` ^2.1.1 | Available for conditional classnames |
| Fonts | Google Fonts (Outfit, Inter, JetBrains Mono) | Loaded via `@import` in CSS |
| Data | `@evm-safety/core` (workspace dep) | `AnalysisResult` type from core |

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/app/page.tsx` | Single-page app — all UI logic |
| `apps/web/app/globals.css` | Full design system — tokens, layout, components |
| `apps/web/app/layout.tsx` | Root layout — metadata, font preconnect |
| `apps/web/app/api/analyze/` | API route — calls `@evm-safety/core` |
| `packages/core/` | Core library — decode, simulate, safety rules |

---

## Running the App

```bash
# From repo root
npm run dev   # Starts Next.js on http://localhost:3001
```

Port 3000 is typically in use; Next.js auto-selects 3001.

---

## API Contract (v0.6)

**POST `/api/analyze`**

Request body:
```json
{
  "tx": "0x…tx hash | 0x…signed hex | 0x…calldata | { structured object }",
  "to": "0x… (required for calldata strings)",
  "rpcUrl": "https://eth.llamarpc.com",
  "chainId": 1,
  "simulationBackend": "auto | tenderly | trace | rpc",
  "tenderlyKey": "optional",
  "tenderlyAccount": "optional",
  "tenderlyProject": "optional"
}
```

The route validates the RPC host (allowlist / private-IP blocking), limits body
size, rate-limits by IP, and optionally requires `API_TOKEN`.

Response: `AnalysisResult` (from `@evm-safety/core`):
```typescript
{
  decoded: {
    type: string;
    chainId: number;
    txTypeEIP: "Legacy" | "EIP-2930" | "EIP-1559";
    contractName?: string;
    functionSignature?: string;
    functionName?: string;
    signatureConfidence: "verified" | "curated" | "registry" | "unverified";
    signatureCandidates?: string[];
    summary: string;                    // plain-language intent
    params: { name: string; type: string; value: string; raw?: string }[];
    calls: DecodedCall[];               // recursive call tree
    entities: Record<string, {
      address: string; name?: string; isContract?: boolean;
      known?: boolean; isToken?: boolean;
    }>;
    valueEth: string;
    valueWei: string;
    gasLimit: string;
    rawData: string;
    txHash?: string;
  };
  simulation: {
    status: "success" | "revert" | "unavailable";
    backend: "tenderly" | "trace" | "rpc" | "none";
    success: boolean;                   // true only when status === "success"
    revertReason: string | null;
    gasUsed: number;
    gasLimit: number;
    gasUsedPercent: number;
    balanceChanges: BalanceChange[];    // native + token, signed deltas
    approvals: ApprovalChange[];
    stateChanges: StateChange[];
    events: EmittedEvent[];
    capabilities: {
      success: boolean; gas: boolean; balances: boolean; approvals: boolean;
      stateChanges: boolean; events: boolean; trace: boolean;
    };
    error?: { code: string; message: string };
    notes: string[];
  };
  safety: {
    passed: boolean;
    score: "SAFE" | "WARNINGS" | "DANGEROUS";
    riskScore: number;                  // 0–100
    warnings: {
      severity: "HIGH" | "MEDIUM" | "LOW";
      rule: string;
      message: string;
      recommendation: string;
      confidence: "high" | "medium" | "low";
      evidence?: Record<string, unknown>;
    }[];
  };
  meta: {
    version: string; chainId: number; chainName: string; nativeSymbol: string;
    inputKind: "hash" | "raw_tx" | "calldata" | "structured";
    durationMs: number; timestamp: string; notes: string[];
  };
}
```

---

## Supported Networks

| Chain ID | Name | Symbol | Default RPC |
|----------|------|--------|-------------|
| 1 | Ethereum Mainnet | ETH | https://eth.llamarpc.com |
| 137 | Polygon | MATIC | https://polygon.llamarpc.com |
| 42161 | Arbitrum One | ARB | https://arb1.arbitrum.io/rpc |
| 8453 | Base | BASE | https://mainnet.base.org |
| 10 | Optimism | OP | https://mainnet.optimism.io |
| 56 | BNB Chain | BNB | https://bsc-dataseed.binance.org |

---

## UI Design System (Post-Redesign)

### CSS Architecture
- All styles in `globals.css` — no component-level CSS files
- CSS custom properties (`--var`) for all tokens
- No Tailwind; utility classes are hand-rolled (`.flex`, `.gap-2`, etc.)

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.mesh-bg` + `.mesh-blob-*` | Fixed animated background blobs |
| `.card` | Glassmorphism card base (`backdrop-filter: blur(20px)`) |
| `.card-glow` | Cursor-tracking radial glow overlay (requires JS: see `useCardGlow`) |
| `.GlowCard` (React component) | Wraps `.card` + attaches mousemove listener |
| `.btn-primary` | Indigo gradient CTA button with shimmer sweep animation |
| `.score-banner.score-{safe/warnings/dangerous}` | Safety result banner |
| `.warning-item.severity-{high/medium/low}` | Warning card with colored left border |
| `.sim-status-pill.{success/fail}` | Simulation result pill |
| `.loading-orbit` | Dual-ring spinner for loading state |
| `.skeleton` | Shimmer placeholder (for future use) |
| `.badge-{color}` | Pill badges — blue/indigo/green/red/amber/yellow/purple/cyan |

### Cursor Glow Pattern (JS)
The `useCardGlow()` hook in `page.tsx` attaches a `mousemove` listener to each `GlowCard` and updates CSS custom properties `--mouse-x` and `--mouse-y`. The `.card-glow` div uses these in a `radial-gradient` to create a spotlight effect:

```css
.card-glow {
  background: radial-gradient(
    500px circle at var(--mouse-x, -200px) var(--mouse-y, -200px),
    rgba(99,102,241,0.07), transparent 50%
  );
}
```

---

## LaTeX Research Paper Assets

Located at repo root — for academic paper about the safety algorithms:
- `evm_formulas.tex` — Mathematical safety scoring formulas
- `evm_flowchart.tex` — TikZ flowchart of analysis pipeline
- `comparison_section.tex` — Competitor analysis table

These are standalone `.tex` files, not integrated into the web app.

---

## Known Facts / Gotchas

1. **Port**: `npm run dev` uses the next free port (3000 unless occupied).
2. **Tests**: 22 core tests live in `packages/core/test/*.test.mjs`
   (`npm test`). They use a local mock JSON-RPC server and cover decoding,
   safety rules, trace/Tenderly parsing, and hash input.
3. **Single page**: All UI logic is in `page.tsx` — not split into separate
   component files (intentional MVP design).
4. **Simulation fallback**: Tenderly → `debug_traceCall` → `eth_call` +
   `eth_estimateGas`. RPC-only mode does not produce balance/approval/state
   diffs, and the UI shows that in the coverage chips.
5. **`lucide-react` / `clsx`** remain installed but unused.
6. **Package versions**: core/web/cli are `0.6.0`; `meta.version` in every
   result is `0.6.0`.

## v0.6 Core Modules

| Path | Purpose |
|------|---------|
| `packages/core/src/inputs.ts` | Hash / signed hex / calldata / object normalization |
| `packages/core/src/config/chains.ts` | 6 chains, token registry, spender/operator allowlists |
| `packages/core/src/config/rpc.ts` | RPC allowlist and private-IP blocking |
| `packages/core/src/abi/` | Curated ABIs, proxy lookup, ranked selector resolution |
| `packages/core/src/decoder/` | Recursive call decoding and plain-language summary |
| `packages/core/src/simulator/` | Tenderly, trace, RPC backends; log and state parsing |
| `packages/core/src/checker/` | Rule engine, evidence, scoring |

## CLI (v0.6)

```bash
evm-safety check --tx 0x… --chain-id 1
evm-safety check --to 0x… --data 0x… --json --fail-on warnings
```

Supports `--rpc`, `--simulation auto|tenderly|trace|rpc`, Tenderly flags,
`--timeout`, and exit codes `0/1/2`.
