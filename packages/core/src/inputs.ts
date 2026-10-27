import { ethers } from "ethers";
import { AnalysisError } from "./errors";
import type { InputKind, NormalizedTx, RawTxInput } from "./types";
import type { Provider } from "./rpc/provider";
import { withTimeout } from "./rpc/provider";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

function isHex(value: string): boolean {
    return HEX_RE.test(value) && value.length % 2 === 0;
}

function normalizeAddress(value: string | undefined, field: string): string | undefined {
    if (!value) return undefined;
    try {
        return ethers.getAddress(value);
    } catch {
        // Accept mixed-case addresses with a bad checksum, but still require
        // exactly 20 bytes of hex. Analysis input should be forgiving here.
        if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
            return ethers.getAddress(value.toLowerCase());
        }
        throw new AnalysisError("INVALID_INPUT", `${field} is not a valid address: ${value}`);
    }
}

function normalizeBigInt(value: string | number | bigint | undefined, field: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    try {
        const parsed = typeof value === "bigint" ? value : BigInt(String(value));
        if (parsed < BigInt(0)) throw new Error("negative");
        return parsed.toString();
    } catch {
        throw new AnalysisError("INVALID_INPUT", `${field} must be a non-negative integer.`);
    }
}

function normalizeData(value: string | undefined): string {
    if (!value) return "0x";
    const data = value.trim();
    if (!data.startsWith("0x")) {
        throw new AnalysisError("INVALID_INPUT", "Calldata must be 0x-prefixed hex.");
    }
    if (!isHex(data)) {
        throw new AnalysisError("INVALID_INPUT", "Calldata is not valid hex.");
    }
    return data.toLowerCase();
}

export function detectInputKind(tx: RawTxInput | string): InputKind {
    if (typeof tx !== "string") return "structured";
    const value = tx.trim();
    if (HASH_RE.test(value)) return "hash";
    if (!value.startsWith("0x")) {
        throw new AnalysisError("INVALID_INPUT", "Input must be 0x-prefixed hex, a tx hash, or an object.");
    }
    if (value.length > 130) {
        try {
            ethers.Transaction.from(value);
            return "raw_tx";
        } catch {
            /* fall through to calldata */
        }
    }
    return "calldata";
}

async function fromHash(
    hash: string,
    provider: Provider | undefined,
    chainId: number | undefined
): Promise<NormalizedTx> {
    if (!provider) {
        throw new AnalysisError("INVALID_INPUT", "An RPC URL is required to analyze a transaction hash.");
    }
    const tx = await withTimeout(provider.getTransaction(hash), 8000, "eth_getTransactionByHash");
    if (!tx) {
        throw new AnalysisError("TX_NOT_FOUND", `Transaction ${hash} was not found on this chain.`);
    }
    const txChainId = tx.chainId ? Number(tx.chainId) : undefined;
    if (chainId !== undefined && txChainId !== undefined && chainId !== txChainId) {
        throw new AnalysisError(
            "CHAIN_MISMATCH",
            `Transaction belongs to chain ${txChainId}, but chain ${chainId} was selected.`
        );
    }
    const mined = await readMinedOutcome(hash, provider);
    return {
        kind: "hash",
        to: tx.to ?? undefined,
        from: tx.from ?? undefined,
        data: tx.data || "0x",
        valueWei: tx.value.toString(),
        gasLimitWei: tx.gasLimit?.toString(),
        gasPriceWei: (tx.gasPrice ?? tx.maxFeePerGas)?.toString(),
        nonce: tx.nonce,
        chainId: txChainId ?? chainId,
        txType: tx.type ?? undefined,
        txHash: hash,
        mined,
    };
}

async function readMinedOutcome(
    hash: string,
    provider: Provider
): Promise<NormalizedTx["mined"]> {
    try {
        const receipt = await withTimeout(
            provider.getTransactionReceipt(hash),
            8000,
            "eth_getTransactionReceipt"
        );
        if (!receipt || receipt.status === null) return undefined;
        return {
            status: receipt.status === 1 ? "success" : "revert",
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber,
        };
    } catch {
        // A pending transaction, or an RPC that does not serve receipts, is
        // still analyzable; fall back to live simulation.
        return undefined;
    }
}

function fromRawTx(raw: string, chainId: number | undefined): NormalizedTx {
    let tx: ethers.Transaction;
    try {
        tx = ethers.Transaction.from(raw);
    } catch (err) {
        throw new AnalysisError(
            "INVALID_INPUT",
            `Unable to parse signed transaction: ${err instanceof Error ? err.message : String(err)}`
        );
    }
    const txChainId = tx.chainId ? Number(tx.chainId) : undefined;
    if (chainId !== undefined && txChainId !== undefined && chainId !== txChainId) {
        throw new AnalysisError(
            "CHAIN_MISMATCH",
            `Signed transaction targets chain ${txChainId}, but chain ${chainId} was selected.`
        );
    }
    return {
        kind: "raw_tx",
        to: tx.to ?? undefined,
        from: tx.from ?? undefined,
        data: tx.data || "0x",
        valueWei: tx.value.toString(),
        gasLimitWei: tx.gasLimit?.toString(),
        gasPriceWei: (tx.gasPrice ?? tx.maxFeePerGas)?.toString(),
        nonce: tx.nonce,
        chainId: txChainId ?? chainId,
        txType: tx.type ?? undefined,
        raw,
    };
}

function fromCalldata(data: string, to: string | undefined): NormalizedTx {
    if (!to) {
        throw new AnalysisError("INVALID_INPUT", "A `to` address is required when submitting raw calldata.");
    }
    return {
        kind: "calldata",
        to: normalizeAddress(to, "to"),
        data: normalizeData(data),
        valueWei: "0",
    };
}

function fromStructured(tx: RawTxInput, fallbackChainId: number | undefined): NormalizedTx {
    return {
        kind: "structured",
        to: normalizeAddress(tx.to, "to"),
        from: normalizeAddress(tx.from, "from"),
        data: normalizeData(tx.data ?? tx.input),
        valueWei: normalizeBigInt(tx.value, "value") ?? "0",
        gasLimitWei: normalizeBigInt(tx.gasLimit ?? tx.gas, "gasLimit"),
        gasPriceWei: normalizeBigInt(tx.gasPrice, "gasPrice"),
        nonce: tx.nonce,
        chainId: tx.chainId ?? fallbackChainId,
    };
}

export async function normalizeInput(
    tx: RawTxInput | string,
    options: { provider?: Provider; to?: string; chainId?: number } = {}
): Promise<NormalizedTx> {
    const kind = detectInputKind(tx);
    if (typeof tx === "string") {
        const value = tx.trim();
        if (kind === "hash") return fromHash(value, options.provider, options.chainId);
        if (kind === "raw_tx") return fromRawTx(value, options.chainId);
        return fromCalldata(value, options.to);
    }
    return fromStructured(tx, options.chainId);
}
