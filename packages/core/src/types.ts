// Shared types for the EVM transaction safety analyzer.
//
// The public result shape is intentionally additive: v0.1 consumers can keep
// reading `decoded`, `simulation`, and `safety`, while v0.6 surfaces use the
// extra confidence, call-tree, approval, and state-diff fields.

export interface RawTxInput {
    to?: string;
    from?: string;
    data?: string;
    /** Alias for `data` (common in RPC payloads). */
    input?: string;
    value?: string;
    gasLimit?: string;
    /** Alias for `gasLimit`. */
    gas?: string;
    gasPrice?: string;
    nonce?: number;
    chainId?: number;
}

export type SimulationBackend = "auto" | "tenderly" | "trace" | "rpc";

export interface AnalyzeOptions {
    /** Signed tx hex, tx hash, raw calldata (with `to`), or a structured object. */
    tx: RawTxInput | string;
    /** Target address required when `tx` is raw calldata hex. */
    to?: string;
    rpcUrl?: string;
    chainId?: number;
    tenderlyKey?: string;
    tenderlyAccount?: string;
    tenderlyProject?: string;
    simulationBackend?: SimulationBackend;
    /** Per-request budget. Defaults to 20s. */
    timeoutMs?: number;
    /** Skip the optional prestate trace (faster, fewer state-change details). */
    includeStateChanges?: boolean;
}

export type InputKind = "hash" | "raw_tx" | "calldata" | "structured";

export interface NormalizedTx {
    kind: InputKind;
    to?: string;
    from?: string;
    data: string;
    valueWei: string;
    gasLimitWei?: string;
    gasPriceWei?: string;
    nonce?: number;
    chainId?: number;
    /** EIP-2718 transaction type (0 legacy, 1 EIP-2930, 2 EIP-1559). */
    txType?: number;
    raw?: string;
    txHash?: string;
}

export interface DecodedParam {
    name: string;
    type: string;
    value: string;
    raw?: string;
}

export type SignatureConfidence = "verified" | "curated" | "registry" | "unverified";

export type TxType =
    | "ETH Transfer"
    | "ERC-20 Transfer"
    | "ERC-20 Approve"
    | "ERC-721 Transfer"
    | "ERC-721 Approval"
    | "ERC-1155 Transfer"
    | "Contract Deployment"
    | "Uniswap Swap"
    | "Multicall"
    | "Permit"
    | "Generic Contract Call"
    | "Unknown";

export interface DecodedCall {
    target: string;
    selector: string;
    type: TxType;
    functionSignature?: string;
    functionName?: string;
    confidence: SignatureConfidence;
    signatureCandidates?: string[];
    params: DecodedParam[];
    valueEth?: string;
    /** Universal Router command label, e.g. "V3_SWAP_EXACT_IN". */
    command?: string;
    children?: DecodedCall[];
}

export interface EntityInfo {
    address: string;
    name?: string;
    isContract?: boolean;
    known?: boolean;
    isToken?: boolean;
}

export interface DecodedTransaction {
    type: TxType;
    from: string;
    to: string;
    chainId: number;
    contractName?: string;
    functionSignature?: string;
    functionName?: string;
    signatureConfidence: SignatureConfidence;
    signatureCandidates?: string[];
    params: DecodedParam[];
    /** Human-readable intent, independent of the raw function name. */
    summary: string;
    /** Top-level call plus decoded nested calls (multicall, router, Permit2). */
    calls: DecodedCall[];
    entities: Record<string, EntityInfo>;
    valueEth: string;
    valueWei: string;
    gasLimit: string;
    gasPriceWei?: string;
    nonce?: number;
    txTypeEIP: "Legacy" | "EIP-2930" | "EIP-1559";
    rawData: string;
    txHash?: string;
}

export type BalanceChangeKind = "native" | "erc20" | "erc721" | "erc1155";

export interface BalanceChange {
    address: string;
    /** Display symbol, e.g. "USDC" or "ETH". */
    token: string;
    tokenAddress?: string;
    /** Formatted delta including sign, e.g. "-12.5". */
    delta: string;
    deltaRaw: string;
    kind: BalanceChangeKind;
    decimals?: number;
    direction: "in" | "out";
}

export interface ApprovalChange {
    owner: string;
    spender: string;
    token: string;
    tokenAddress?: string;
    kind: "erc20" | "erc721" | "all";
    amount?: string;
    amountRaw?: string;
    approved?: boolean;
}

export interface StateChange {
    address: string;
    kind: "storage" | "balance" | "nonce" | "code";
    key?: string;
    before?: string;
    after?: string;
}

export interface EmittedEvent {
    name: string;
    address: string;
    params: Record<string, string>;
    topics?: string[];
    data?: string;
}

export type SimulationStatus = "success" | "revert" | "unavailable";

export type AnalysisErrorCode =
    | "INVALID_INPUT"
    | "TX_NOT_FOUND"
    | "CHAIN_MISMATCH"
    | "RPC_NOT_ALLOWED"
    | "RPC_ERROR"
    | "RPC_TIMEOUT"
    | "TENDERLY_CONFIG"
    | "TENDERLY_ERROR"
    | "SIMULATION_UNSUPPORTED"
    | "RATE_LIMITED"
    | "UNAUTHORIZED"
    | "INTERNAL";

export interface SimulationCapabilities {
    success: boolean;
    gas: boolean;
    balances: boolean;
    approvals: boolean;
    stateChanges: boolean;
    events: boolean;
    trace: boolean;
}

export interface SimulationResult {
    status: SimulationStatus;
    /** True only when the transaction is simulated successfully. */
    success: boolean;
    gasUsed: number;
    gasLimit: number;
    gasUsedPercent: number;
    gasPriceWei?: string;
    balanceChanges: BalanceChange[];
    approvals: ApprovalChange[];
    stateChanges: StateChange[];
    events: EmittedEvent[];
    revertReason: string | null;
    backend: "eth_call" | "tenderly" | "trace" | "rpc" | "none";
    capabilities: SimulationCapabilities;
    error?: { code: AnalysisErrorCode; message: string };
    notes: string[];
}

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface SafetyWarning {
    rule: string;
    severity: Severity;
    message: string;
    recommendation: string;
    confidence: "high" | "medium" | "low";
    evidence?: Record<string, unknown>;
}

export type SafetyScore = "SAFE" | "WARNINGS" | "DANGEROUS";

export interface SafetyReport {
    /** SAFE only when no warnings were emitted. */
    passed: boolean;
    score: SafetyScore;
    /** 0 (safe) to 100 (highest observed risk). */
    riskScore: number;
    warnings: SafetyWarning[];
}

export interface AnalysisMeta {
    version: string;
    chainId: number;
    chainName: string;
    nativeSymbol: string;
    inputKind: InputKind;
    durationMs: number;
    timestamp: string;
    notes: string[];
}

export interface AnalysisResult {
    decoded: DecodedTransaction;
    simulation: SimulationResult;
    safety: SafetyReport;
    meta: AnalysisMeta;
}
