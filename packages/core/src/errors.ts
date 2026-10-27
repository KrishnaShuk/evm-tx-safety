import type { AnalysisErrorCode } from "./types";

export class AnalysisError extends Error {
    readonly code: AnalysisErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(
        code: AnalysisErrorCode,
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "AnalysisError";
        this.code = code;
        this.details = details;
    }
}

export function toAnalysisError(err: unknown, fallbackCode: AnalysisErrorCode = "INTERNAL"): AnalysisError {
    if (err instanceof AnalysisError) return err;
    if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code;
        if (code === "ETIMEDOUT" || code === "TIMEOUT" || err.name === "TimeoutError") {
            return new AnalysisError("RPC_TIMEOUT", err.message);
        }
        return new AnalysisError(fallbackCode, err.message);
    }
    return new AnalysisError(fallbackCode, String(err));
}

export function isRevertError(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code;
    const message = err instanceof Error ? err.message : String(err ?? "");
    return (
        code === "CALL_EXCEPTION" ||
        code === "UNPREDICTABLE_GAS_LIMIT" ||
        /execution reverted|reverted with reason|VM Exception/i.test(message)
    );
}

export function isUnsupportedRpcError(err: unknown): boolean {
    const code = (err as { code?: number | string } | null)?.code;
    const message = err instanceof Error ? err.message : String(err ?? "");
    return (
        code === -32601 ||
        /method .*not found|method not supported|not available|does not exist|unsupported/i.test(message)
    );
}

export function isTimeoutError(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code;
    const message = err instanceof Error ? err.message : String(err ?? "");
    return code === "ETIMEDOUT" || code === "TIMEOUT" || /timed? ?out|timeout/i.test(message);
}
