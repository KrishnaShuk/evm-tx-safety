import { ethers } from "ethers";
import { isRevertError, isTimeoutError } from "../errors";
import type { SimulationResult } from "../types";
import { createProvider, withTimeout } from "../rpc/provider";
import {
    BackendUnavailable,
    EMPTY_CAPABILITIES,
    decodeRevertReason,
    gasLimitNumber,
    gasPercent,
    type SimulationConfig,
    type SimulationRequest,
} from "./common";

function toHex(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
        return `0x${BigInt(value).toString(16)}`;
    } catch {
        return undefined;
    }
}

export async function simulateViaRpc(
    request: SimulationRequest,
    config: SimulationConfig
): Promise<SimulationResult> {
    if (!config.provider && !config.rpcUrl) {
        throw new BackendUnavailable("RPC_ERROR", "No RPC backend is configured.");
    }
    const provider =
        config.provider ?? createProvider(config.rpcUrl as string, request.chainId);
    const ownsProvider = !config.provider;
    const timeoutMs = config.timeoutMs ?? 12000;

    const call = {
        from: request.from ?? ethers.ZeroAddress,
        to: request.to,
        data: request.data || "0x",
        value: toHex(request.valueWei) ?? "0x0",
        gas: toHex(request.gasLimitWei),
    };

    try {
        let success = true;
        let revertReason: string | null = null;
        try {
            await withTimeout(provider.call(call), timeoutMs, "eth_call");
        } catch (err) {
            if (isRevertError(err)) {
                success = false;
                revertReason = decodeRevertReason(err);
            } else if (isTimeoutError(err)) {
                throw new BackendUnavailable("RPC_TIMEOUT", `RPC call timed out after ${timeoutMs}ms.`);
            } else {
                throw new BackendUnavailable(
                    "RPC_ERROR",
                    err instanceof Error ? err.message : "RPC call failed"
                );
            }
        }

        let gasUsed = 0;
        let gasKnown = false;
        const notes: string[] = [
            "RPC-only simulation executes eth_call/eth_estimateGas; balance, approval, event, and state diffs require a trace or Tenderly backend.",
        ];

        if (success) {
            try {
                const estimate = await withTimeout(
                    provider.estimateGas({
                        from: call.from,
                        to: call.to,
                        data: call.data,
                        value: call.value,
                    }),
                    timeoutMs,
                    "eth_estimateGas"
                );
                gasUsed = Number(estimate);
                gasKnown = true;
            } catch (err) {
                notes.push(
                    `Gas estimation failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}.`
                );
            }
        }

        const gasLimit = gasLimitNumber(request, gasUsed);
        return {
            status: success ? "success" : "revert",
            success,
            gasUsed,
            gasLimit,
            gasUsedPercent: gasPercent(gasUsed, gasLimit),
            gasPriceWei: request.gasPriceWei,
            balanceChanges: [],
            approvals: [],
            stateChanges: [],
            events: [],
            revertReason,
            backend: "rpc",
            capabilities: {
                ...EMPTY_CAPABILITIES,
                success: true,
                gas: gasKnown,
            },
            notes,
        };
    } finally {
        if (ownsProvider) provider.destroy();
    }
}
