import { decodeTx } from "./decoder";
import { simulateTx } from "./simulator";
import { runSafetyChecks } from "./checker";
import {
    AnalyzeOptions,
    AnalysisResult,
    RawTxInput,
} from "./types";

export async function analyzeTx(options: AnalyzeOptions): Promise<AnalysisResult> {
    const { tx, rpcUrl, tenderlyKey, chainId } = options;

    // Normalize to RawTxInput for simulator
    let txObj: RawTxInput;
    if (typeof tx === "string") {
        const { ethers } = await import("ethers");
        const parsed = ethers.Transaction.from(tx);
        txObj = {
            to: parsed.to ?? undefined,
            from: parsed.from ?? undefined,
            data: parsed.data,
            value: parsed.value?.toString(),
            gasLimit: parsed.gasLimit?.toString(),
            nonce: parsed.nonce,
            chainId: parsed.chainId ? Number(parsed.chainId) : chainId,
        };
    } else {
        txObj = tx;
    }

    const [decoded, simulation] = await Promise.all([
        decodeTx(tx),
        simulateTx(txObj, rpcUrl, tenderlyKey, chainId),
    ]);

    const safety = runSafetyChecks(decoded, simulation);

    return { decoded, simulation, safety };
}

// Re-export types
export * from "./types";
