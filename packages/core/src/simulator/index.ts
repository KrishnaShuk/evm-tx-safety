import type { SimulationBackend, SimulationResult } from "../types";
import { getChain } from "../config/chains";
import { createProvider } from "../rpc/provider";
import {
    BackendUnavailable,
    unavailableResult,
    type SimulationConfig,
    type SimulationRequest,
} from "./common";
import { simulateViaRpc } from "./rpc";
import { simulateViaTenderly } from "./tenderly";
import { simulateViaTrace } from "./trace";

export interface SimulateOptions extends SimulationConfig {
    backend?: SimulationBackend;
}

function tenderlyConfigured(config: SimulationConfig): boolean {
    const credentials = config.tenderly ?? {};
    return Boolean(credentials.key && credentials.account && credentials.project);
}

export async function simulateTx(
    request: SimulationRequest,
    options: SimulateOptions = {}
): Promise<SimulationResult> {
    const chain = getChain(request.chainId);
    const tenderly = {
        key: options.tenderly?.key ?? process.env.TENDERLY_ACCESS_KEY,
        account: options.tenderly?.account ?? process.env.TENDERLY_ACCOUNT,
        project: options.tenderly?.project ?? process.env.TENDERLY_PROJECT,
    };
    const config: SimulationConfig = { ...options, tenderly };
    const ownsProvider = !options.provider && Boolean(options.rpcUrl);
    const provider = options.provider ?? (options.rpcUrl ? createProvider(options.rpcUrl, request.chainId) : undefined);
    config.provider = provider;

    const requested = options.backend ?? "auto";
    const order: Array<"tenderly" | "trace" | "rpc"> =
        requested === "tenderly"
            ? ["tenderly", "trace", "rpc"]
            : requested === "trace"
                ? ["trace", "rpc"]
                : requested === "rpc"
                    ? ["rpc"]
                    : tenderlyConfigured(config)
                        ? ["tenderly", "trace", "rpc"]
                        : ["trace", "rpc"];

    const notes: string[] = [];
    let lastError: BackendUnavailable | null = null;

    try {
        for (const backend of order) {
            try {
                let result: SimulationResult;
                if (backend === "tenderly") {
                    if (!tenderlyConfigured(config)) {
                        throw new BackendUnavailable(
                            "TENDERLY_CONFIG",
                            "Tenderly is not fully configured."
                        );
                    }
                    result = await simulateViaTenderly(request, config, chain.nativeSymbol);
                } else if (backend === "trace") {
                    result = await simulateViaTrace(request, config, chain.nativeSymbol);
                } else {
                    result = await simulateViaRpc(request, config);
                }
                if (notes.length > 0) result.notes = [...result.notes, ...notes];
                return result;
            } catch (err) {
                if (err instanceof BackendUnavailable) {
                    lastError = err;
                    notes.push(`${backend} backend unavailable: ${err.message}`);
                    continue;
                }
                lastError = new BackendUnavailable(
                    "RPC_ERROR",
                    err instanceof Error ? err.message : String(err)
                );
                notes.push(`${backend} backend failed: ${lastError.message}`);
            }
        }

        return unavailableResult(
            lastError?.code ?? "RPC_ERROR",
            lastError?.message ?? "No simulation backend was able to execute the transaction.",
            request,
            "none",
            notes
        );
    } finally {
        if (ownsProvider) provider?.destroy();
    }
}
