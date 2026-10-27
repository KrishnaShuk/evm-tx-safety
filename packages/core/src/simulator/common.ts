import { Interface, ethers } from "ethers";
import type {
    AnalysisErrorCode,
    SimulationCapabilities,
    SimulationResult,
} from "../types";

export interface SimulationRequest {
    chainId: number;
    from?: string;
    to?: string;
    data: string;
    valueWei: string;
    gasLimitWei?: string;
    gasPriceWei?: string;
    nonce?: number;
}

export interface TenderlyCredentials {
    key?: string;
    account?: string;
    project?: string;
}

export interface SimulationConfig {
    provider?: import("../rpc/provider").Provider;
    rpcUrl?: string;
    tenderly?: TenderlyCredentials;
    timeoutMs?: number;
    includeStateChanges?: boolean;
}

export class BackendUnavailable extends Error {
    readonly code: AnalysisErrorCode;
    constructor(code: AnalysisErrorCode, message: string) {
        super(message);
        this.name = "BackendUnavailable";
        this.code = code;
    }
}

export const EMPTY_CAPABILITIES: SimulationCapabilities = {
    success: false,
    gas: false,
    balances: false,
    approvals: false,
    stateChanges: false,
    events: false,
    trace: false,
};

export function gasLimitNumber(request: SimulationRequest, gasUsed: number): number {
    if (request.gasLimitWei) {
        try {
            const value = Number(BigInt(request.gasLimitWei));
            if (Number.isFinite(value) && value > 0) return value;
        } catch {
            /* fall through */
        }
    }
    return Math.max(gasUsed + 10000, 21000);
}

export function gasPercent(gasUsed: number, gasLimit: number): number {
    if (!Number.isFinite(gasLimit) || gasLimit <= 0) return 0;
    return Math.min(100, Math.round((gasUsed / gasLimit) * 100));
}

export function unavailableResult(
    code: AnalysisErrorCode,
    message: string,
    request: SimulationRequest,
    backend: SimulationResult["backend"],
    notes: string[] = []
): SimulationResult {
    return {
        status: "unavailable",
        success: false,
        gasUsed: 0,
        gasLimit: gasLimitNumber(request, 0),
        gasUsedPercent: 0,
        gasPriceWei: request.gasPriceWei,
        balanceChanges: [],
        approvals: [],
        stateChanges: [],
        events: [],
        revertReason: null,
        backend,
        capabilities: { ...EMPTY_CAPABILITIES },
        error: { code, message },
        notes,
    };
}

const ERROR_IFACE = new Interface([
    "error Error(string)",
    "error Panic(uint256)",
]);

function extractErrorData(error: unknown): string | null {
    const record = error as Record<string, unknown> | null;
    const candidates = [
        record?.data,
        (record?.info as Record<string, unknown> | undefined)?.error,
        (record?.error as Record<string, unknown> | undefined)?.data,
        (record?.error as Record<string, unknown> | undefined)?.message,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.startsWith("0x") && candidate.length >= 10) {
            return candidate;
        }
        if (candidate && typeof candidate === "object") {
            const nested = (candidate as Record<string, unknown>).data;
            if (typeof nested === "string" && nested.startsWith("0x") && nested.length >= 10) {
                return nested;
            }
        }
    }
    return null;
}

export function decodeRevertReason(error: unknown): string {
    const data = extractErrorData(error);
    if (data) {
        try {
            const parsed = ERROR_IFACE.parseError(data);
            if (parsed?.name === "Error") return String(parsed.args[0]);
            if (parsed?.name === "Panic") {
                const code = BigInt(parsed.args[0]);
                return `Panic(0x${code.toString(16)})`;
            }
            if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
        } catch {
            if (data.length >= 10) return `Custom error ${data.slice(0, 10)}`;
        }
    }
    if (error instanceof Error) {
        return error.message
            .replace(/^execution reverted:?\s*/i, "")
            .replace(/^call revert exception.*?:\s*/i, "")
            .replace(/\s*\(action=.*$/i, "")
            .slice(0, 300) || "Transaction reverted";
    }
    return "Transaction reverted";
}

export interface CallTraceNode {
    type?: string;
    from?: string;
    to?: string;
    value?: string;
    gas?: string;
    gasUsed?: string;
    input?: string;
    output?: string;
    error?: string;
    revertReason?: string;
    calls?: CallTraceNode[];
    logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
}

export function isTransactionLevelError(message: string): boolean {
    return /insufficient funds|nonce too low|nonce has already been used|replacement transaction underpriced|already known|underpriced/i.test(
        message
    );
}

export interface ParsedCallTrace {
    success: boolean;
    error?: string;
    gasUsed: number;
    revertReason: string | null;
    logs: Array<{ address: string; topics: string[]; data: string }>;
    valueTransfers: Array<{ from: string; to: string; value: bigint }>;
}

function safeBigInt(value: string | undefined): bigint {
    if (!value) return BigInt(0);
    try {
        return BigInt(value);
    } catch {
        return BigInt(0);
    }
}

export function parseCallTrace(root: CallTraceNode): ParsedCallTrace {
    const logs: ParsedCallTrace["logs"] = [];
    const valueTransfers: ParsedCallTrace["valueTransfers"] = [];
    let gasUsed = 0;

    const visit = (node: CallTraceNode) => {
        if (!node || typeof node !== "object") return;
        if (node.gasUsed) gasUsed = Math.max(gasUsed, Number(safeBigInt(node.gasUsed)));
        const value = safeBigInt(node.value);
        if (
            value > BigInt(0) &&
            typeof node.from === "string" &&
            typeof node.to === "string" &&
            ethers.isAddress(node.from) &&
            ethers.isAddress(node.to)
        ) {
            valueTransfers.push({ from: ethers.getAddress(node.from), to: ethers.getAddress(node.to), value });
        }
        for (const log of node.logs ?? []) {
            if (!log.address || !Array.isArray(log.topics) || log.topics.length === 0) continue;
            logs.push({
                address: ethers.getAddress(log.address),
                topics: log.topics.map(String),
                data: String(log.data ?? "0x"),
            });
        }
        for (const child of node.calls ?? []) visit(child);
    };
    visit(root);

    return {
        success: !root.error,
        error: root.error,
        gasUsed,
        revertReason: root.error ? root.revertReason ?? root.error : null,
        logs,
        valueTransfers,
    };
}
