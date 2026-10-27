import { AnalysisError, toAnalysisError } from "./errors";
import { getChain } from "./config/chains";
import { createProvider, withTimeout } from "./rpc/provider";
import { normalizeInput } from "./inputs";
import { decodeTx } from "./decoder";
import { simulateTx } from "./simulator";
import { runSafetyChecks } from "./checker";
import type { AnalysisResult, AnalyzeOptions, NormalizedTx } from "./types";

export const VERSION = "0.6.0";

function validateRpcUrl(rpcUrl: string | undefined): string | undefined {
    if (!rpcUrl) return undefined;
    let url: URL;
    try {
        url = new URL(rpcUrl);
    } catch {
        throw new AnalysisError("INVALID_INPUT", "RPC URL is not a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new AnalysisError("INVALID_INPUT", "RPC URL must use http or https.");
    }
    return url.toString();
}

export async function analyzeTx(options: AnalyzeOptions): Promise<AnalysisResult> {
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 20000;
    const rpcUrl = validateRpcUrl(options.rpcUrl);

    let chainId =
        options.chainId ??
        (typeof options.tx !== "string" ? options.tx.chainId : undefined) ??
        1;
    let chain;
    try {
        chain = getChain(chainId);
    } catch (err) {
        throw new AnalysisError(
            "INVALID_INPUT",
            err instanceof Error ? err.message : "Unsupported chain."
        );
    }

    const provider = rpcUrl ? createProvider(rpcUrl, chainId) : undefined;

    if (provider) {
        // Guard against a selected chain that does not match the RPC endpoint.
        try {
            const reported = await withTimeout(provider.send("eth_chainId", []), 3000, "eth_chainId");
            const remoteChainId = Number(BigInt(String(reported)));
            if (Number.isInteger(remoteChainId) && remoteChainId !== chainId) {
                throw new AnalysisError(
                    "CHAIN_MISMATCH",
                    `RPC endpoint reports chain ${remoteChainId}, but chain ${chainId} was selected.`
                );
            }
        } catch (err) {
            if (err instanceof AnalysisError) {
                provider.destroy();
                throw err;
            }
            // Some private RPCs restrict eth_chainId; proceed and let the
            // simulation surface the real error.
        }
    }

    try {
        const result = await withTimeout(
            (async (): Promise<AnalysisResult> => {
                const normalized: NormalizedTx = await normalizeInput(options.tx, {
                    provider,
                    to: options.to,
                    chainId,
                });
                if (normalized.chainId !== undefined && normalized.chainId !== chainId) {
                    throw new AnalysisError(
                        "CHAIN_MISMATCH",
                        `Transaction targets chain ${normalized.chainId}, but chain ${chainId} was selected.`
                    );
                }
                chainId = normalized.chainId ?? chainId;
                chain = getChain(chainId);

                const [decoded, simulation] = await Promise.all([
                    decodeTx(options.tx, {
                        provider,
                        chainId,
                        to: options.to,
                        normalized,
                    }),
                    simulateTx(
                        {
                            chainId,
                            from: normalized.from,
                            to: normalized.to,
                            data: normalized.data,
                            valueWei: normalized.valueWei,
                            gasLimitWei: normalized.gasLimitWei,
                            gasPriceWei: normalized.gasPriceWei,
                            nonce: normalized.nonce,
                        },
                        {
                            provider,
                            rpcUrl,
                            backend: options.simulationBackend ?? "auto",
                            timeoutMs: Math.max(5000, timeoutMs - 1000),
                            includeStateChanges: options.includeStateChanges,
                            tenderly: {
                                key: options.tenderlyKey,
                                account: options.tenderlyAccount,
                                project: options.tenderlyProject,
                            },
                        }
                    ),
                ]);

                const safety = runSafetyChecks(decoded, simulation, { chainId });

                return {
                    decoded,
                    simulation,
                    safety,
                    meta: {
                        version: VERSION,
                        chainId,
                        chainName: chain.name,
                        nativeSymbol: chain.nativeSymbol,
                        inputKind: normalized.kind,
                        durationMs: Date.now() - started,
                        timestamp: new Date().toISOString(),
                        notes: simulation.notes,
                    },
                };
            })(),
            timeoutMs,
            "analysis"
        );
        return result;
    } catch (err) {
        throw toAnalysisError(err);
    } finally {
        provider?.destroy();
    }
}

// Public module surface (v0.6): the analyzer plus its building blocks.
export * from "./types";
export { decodeTx } from "./decoder";
export { simulateTx } from "./simulator";
export { runSafetyChecks } from "./checker";
export { normalizeInput, detectInputKind } from "./inputs";
export { AnalysisError, toAnalysisError } from "./errors";
export { getChain, listChains, getKnownToken, getSafeSpender, getSafeOperator } from "./config/chains";
export { assertSafeRpcUrl, defaultRpcForChain } from "./config/rpc";
