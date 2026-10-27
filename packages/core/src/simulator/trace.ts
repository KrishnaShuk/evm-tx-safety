import { ethers } from "ethers";
import { isUnsupportedRpcError } from "../errors";
import type { SimulationResult } from "../types";
import { createProvider, rpcCall, withTimeout } from "../rpc/provider";
import {
    BackendUnavailable,
    EMPTY_CAPABILITIES,
    gasLimitNumber,
    gasPercent,
    isTransactionLevelError,
    parseCallTrace,
    type CallTraceNode,
    type SimulationConfig,
    type SimulationRequest,
} from "./common";
import { deriveDiffs } from "./logs";
import { parsePrestateDiff } from "./state";

function toHex(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
        return `0x${BigInt(value).toString(16)}`;
    } catch {
        return undefined;
    }
}

export async function simulateViaTrace(
    request: SimulationRequest,
    config: SimulationConfig,
    nativeSymbol: string
): Promise<SimulationResult> {
    if (!config.provider && !config.rpcUrl) {
        throw new BackendUnavailable("RPC_ERROR", "No RPC backend is configured.");
    }
    const provider =
        config.provider ?? createProvider(config.rpcUrl as string, request.chainId);
    const ownsProvider = !config.provider;
    const timeoutMs = config.timeoutMs ?? 15000;

    const tx = {
        from: request.from ?? ethers.ZeroAddress,
        to: request.to,
        data: request.data || "0x",
        value: toHex(request.valueWei) ?? "0x0",
        gas: toHex(request.gasLimitWei),
    };

    try {
        let trace: CallTraceNode;
        try {
            trace = await rpcCall<CallTraceNode>(
                provider,
                "debug_traceCall",
                [tx, "latest", { tracer: "callTracer", tracerConfig: { withLog: true } }],
                timeoutMs
            );
        } catch (err) {
            if (isUnsupportedRpcError(err)) {
                throw new BackendUnavailable(
                    "SIMULATION_UNSUPPORTED",
                    "This RPC does not expose debug_traceCall."
                );
            }
            throw new BackendUnavailable(
                "RPC_ERROR",
                `debug_traceCall failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        const parsed = parseCallTrace(trace);
        if (!parsed.success && parsed.error && isTransactionLevelError(parsed.error)) {
            throw new BackendUnavailable("RPC_ERROR", parsed.error);
        }
        let gasUsed = parsed.gasUsed;
        if (!gasUsed) {
            try {
                const estimate = await withTimeout(
                    provider.estimateGas({
                        from: tx.from,
                        to: tx.to,
                        data: tx.data,
                        value: tx.value,
                    }),
                    6000,
                    "eth_estimateGas"
                );
                gasUsed = Number(estimate);
            } catch {
                /* gas stays unknown */
            }
        }

        const diffs = await deriveDiffs({
            logs: parsed.logs,
            valueTransfers: parsed.valueTransfers,
            provider,
            chainId: request.chainId,
            nativeSymbol,
        });

        const notes: string[] = [];
        let stateChanges: SimulationResult["stateChanges"] = [];
        let stateChangesAvailable = false;
        if (config.includeStateChanges !== false) {
            try {
                const prestate = await rpcCall<unknown>(
                    provider,
                    "debug_traceCall",
                    [tx, "latest", { tracer: "prestateTracer", tracerConfig: { diffMode: true } }],
                    Math.min(timeoutMs, 10000)
                );
                stateChanges = parsePrestateDiff(prestate);
                stateChangesAvailable = true;
            } catch {
                notes.push("State-change diff is unavailable on this RPC (prestateTracer unsupported).");
            }
        }

        const gasLimit = gasLimitNumber(request, gasUsed);
        return {
            status: parsed.success ? "success" : "revert",
            success: parsed.success,
            gasUsed,
            gasLimit,
            gasUsedPercent: gasPercent(gasUsed, gasLimit),
            gasPriceWei: request.gasPriceWei,
            balanceChanges: diffs.balanceChanges,
            approvals: diffs.approvals,
            stateChanges,
            events: diffs.events,
            revertReason: parsed.revertReason,
            backend: "trace",
            capabilities: {
                ...EMPTY_CAPABILITIES,
                success: true,
                gas: gasUsed > 0,
                balances: true,
                approvals: true,
                events: true,
                stateChanges: stateChangesAvailable,
                trace: true,
            },
            notes,
        };
    } finally {
        if (ownsProvider) provider.destroy();
    }
}
