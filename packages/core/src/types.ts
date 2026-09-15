// Common types shared across the core library

export interface RawTxInput {
    to?: string;
    from?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    nonce?: number;
    chainId?: number;
}

export interface AnalyzeOptions {
    tx: RawTxInput | string; // structured object OR raw hex string
    rpcUrl: string;
    tenderlyKey?: string;
    chainId?: number;
}

export interface DecodedParam {
    name: string;
    type: string;
    value: string;
}

export type TxType =
    | "ETH Transfer"
    | "ERC-20 Transfer"
    | "ERC-20 Approve"
    | "ERC-721 Transfer"
    | "ERC-1155 Transfer"
    | "Contract Deployment"
    | "Uniswap Swap"
    | "Generic Contract Call"
    | "Unknown";

export interface DecodedTransaction {
    type: TxType;
    from: string;
    to: string;
    contractName?: string;
    functionSignature?: string;
    functionName?: string;
    params: DecodedParam[];
    valueEth: string;
    gasLimit: string;
    nonce?: number;
    txTypeEIP: "Legacy" | "EIP-2930" | "EIP-1559";
    rawData: string;
}

export interface BalanceChange {
    address: string;
    token: string;
    tokenAddress?: string;
    delta: string;
    deltaRaw: string;
}

export interface EmittedEvent {
    name: string;
    address: string;
    params: Record<string, string>;
}

export interface SimulationResult {
    success: boolean;
    gasUsed: number;
    gasLimit: number;
    gasUsedPercent: number;
    balanceChanges: BalanceChange[];
    events: EmittedEvent[];
    revertReason: string | null;
    backend: "eth_call" | "tenderly";
}

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface SafetyWarning {
    rule: string;
    severity: Severity;
    message: string;
    recommendation: string;
}

export interface SafetyReport {
    passed: boolean;
    score: "SAFE" | "WARNINGS" | "DANGEROUS";
    warnings: SafetyWarning[];
}

export interface AnalysisResult {
    decoded: DecodedTransaction;
    simulation: SimulationResult;
    safety: SafetyReport;
}
