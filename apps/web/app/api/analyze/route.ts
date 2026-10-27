import { NextRequest, NextResponse } from "next/server";
import {
    AnalysisError,
    analyzeTx,
    assertSafeRpcUrl,
    listChains,
} from "@evm-safety/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 100_000;
const MAX_TX_LENGTH = 200_000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

interface Bucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(ip: string): { limited: boolean; retryAfter: number } {
    const now = Date.now();
    if (buckets.size > 5000) {
        for (const [key, entry] of buckets) {
            if (entry.resetAt <= now) buckets.delete(key);
        }
    }
    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return { limited: false, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
        return { limited: true, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { limited: false, retryAfter: 0 };
}

function errorResponse(message: string, code: string, status: number, extra?: Record<string, unknown>) {
    return NextResponse.json({ error: message, code, ...extra }, { status });
}

function statusForCode(code: string): number {
    switch (code) {
        case "INVALID_INPUT":
        case "CHAIN_MISMATCH":
            return 400;
        case "TX_NOT_FOUND":
            return 404;
        case "UNAUTHORIZED":
            return 401;
        case "RPC_NOT_ALLOWED":
            return 403;
        case "RATE_LIMITED":
            return 429;
        case "RPC_TIMEOUT":
            return 504;
        default:
            return 502;
    }
}

function endpointAllowed(): boolean {
    const token = process.env.API_TOKEN;
    return !token;
}

export async function POST(req: NextRequest) {
    if (!endpointAllowed()) {
        const auth = req.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${process.env.API_TOKEN}`) {
            return errorResponse("Unauthorized.", "UNAUTHORIZED", 401);
        }
    }

    const ip = clientIp(req);
    const limit = rateLimited(ip);
    if (limit.limited) {
        return errorResponse("Rate limit exceeded.", "RATE_LIMITED", 429, {
            retryAfter: limit.retryAfter,
        });
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return errorResponse("Request body is too large.", "INVALID_INPUT", 413);
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return errorResponse("Request body must be valid JSON.", "INVALID_INPUT", 400);
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!record) {
        return errorResponse("Request body must be a JSON object.", "INVALID_INPUT", 400);
    }

    const tx = record.tx;
    const rpcUrl = record.rpcUrl;
    const chainIdRaw = record.chainId;
    const chainId = chainIdRaw === undefined ? 1 : Number(chainIdRaw);

    if (!tx || (typeof tx !== "string" && typeof tx !== "object")) {
        return errorResponse("`tx` must be a hash, hex string, or object.", "INVALID_INPUT", 400);
    }
    if (typeof tx === "string" && tx.length > MAX_TX_LENGTH) {
        return errorResponse("Transaction payload is too large.", "INVALID_INPUT", 413);
    }
    if (typeof tx === "object" && JSON.stringify(tx).length > MAX_TX_LENGTH) {
        return errorResponse("Transaction payload is too large.", "INVALID_INPUT", 413);
    }
    if (!rpcUrl || typeof rpcUrl !== "string") {
        return errorResponse("`rpcUrl` is required.", "INVALID_INPUT", 400);
    }
    if (rpcUrl.length > 2048) {
        return errorResponse("`rpcUrl` is too long.", "INVALID_INPUT", 400);
    }
    if (!Number.isInteger(chainId) || !listChains().some((chain) => chain.id === chainId)) {
        return errorResponse(
            `Unsupported chain ID. Supported: ${listChains().map((chain) => chain.id).join(", ")}.`,
            "INVALID_INPUT",
            400
        );
    }

    const tenderlyKey = typeof record.tenderlyKey === "string" ? record.tenderlyKey.slice(0, 256) : undefined;
    const tenderlyAccount =
        typeof record.tenderlyAccount === "string" ? record.tenderlyAccount.slice(0, 128) : undefined;
    const tenderlyProject =
        typeof record.tenderlyProject === "string" ? record.tenderlyProject.slice(0, 128) : undefined;
    const backendRaw = typeof record.simulationBackend === "string" ? record.simulationBackend : "auto";
    const simulationBackend = ["auto", "tenderly", "trace", "rpc"].includes(backendRaw)
        ? (backendRaw as "auto" | "tenderly" | "trace" | "rpc")
        : "auto";

    try {
        const safeRpcUrl = await assertSafeRpcUrl(rpcUrl, chainId);
        const result = await analyzeTx({
            tx: tx as string | Record<string, unknown>,
            rpcUrl: safeRpcUrl,
            chainId,
            tenderlyKey,
            tenderlyAccount,
            tenderlyProject,
            simulationBackend,
            timeoutMs: 20000,
        });
        return NextResponse.json(result, {
            headers: { "cache-control": "no-store" },
        });
    } catch (err) {
        if (err instanceof AnalysisError) {
            return errorResponse(err.message, err.code, statusForCode(err.code));
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return errorResponse(message, "INTERNAL", 500);
    }
}
