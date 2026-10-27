import { JsonRpcProvider } from "ethers";
import { AnalysisError, isTimeoutError } from "../errors";

export type Provider = JsonRpcProvider;

export interface ProviderOptions {
    timeoutMs?: number;
}

export function createProvider(rpcUrl: string, chainId: number): Provider {
    return new JsonRpcProvider(rpcUrl, chainId, {
        staticNetwork: true,
        batchMaxCount: 10,
    });
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new AnalysisError("RPC_TIMEOUT", `${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    }) as Promise<T>;
}

export async function rpcCall<T>(
    provider: Provider,
    method: string,
    params: unknown[],
    timeoutMs = 6000
): Promise<T> {
    return withTimeout(provider.send(method, params) as Promise<T>, timeoutMs, method);
}

export async function safeGetCode(
    provider: Provider,
    address: string,
    timeoutMs = 4000
): Promise<{ ok: boolean; code?: string }> {
    try {
        const code = await withTimeout(provider.getCode(address), timeoutMs, "eth_getCode");
        return { ok: true, code };
    } catch (err) {
        if (isTimeoutError(err)) return { ok: false };
        return { ok: false };
    }
}
