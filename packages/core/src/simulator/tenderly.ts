import { ethers, formatUnits } from "ethers";
import type { BalanceChange, SimulationResult } from "../types";
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
import { deriveDiffs, type RawLog } from "./logs";
import { parseTenderlyStateDiff } from "./state";

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function toRawLogs(info: Record<string, unknown> | null): RawLog[] {
    const logs = asArray(info?.logs);
    const result: RawLog[] = [];
    for (const item of logs) {
        const record = asRecord(item);
        const raw = asRecord(record?.raw) ?? record;
        const address = raw?.address;
        const topics = raw?.topics;
        if (typeof address !== "string" || !Array.isArray(topics)) continue;
        result.push({
            address,
            topics: topics.map(String),
            data: String(raw?.data ?? "0x"),
        });
    }
    return result;
}

interface AssetChange {
    balanceChanges: BalanceChange[];
}

function parseAmount(value: unknown): { raw: bigint; display: string } | null {
    if (typeof value === "bigint") return { raw: value, display: value.toString() };
    if (typeof value === "number" && Number.isFinite(value)) {
        if (Number.isInteger(value)) return { raw: BigInt(value), display: String(value) };
        return { raw: BigInt(0), display: String(value) };
    }
    if (typeof value === "string" && value.length > 0) {
        if (/^-?\d+$/.test(value)) return { raw: BigInt(value), display: value };
        return { raw: BigInt(0), display: value };
    }
    return null;
}

function parseAssetChanges(info: Record<string, unknown> | null): AssetChange {
    const changes = asArray(info?.asset_changes);
    const result: BalanceChange[] = [];
    for (const item of changes) {
        const record = asRecord(item);
        if (!record) continue;
        const tokenInfo = asRecord(record.token_info) ?? asRecord(record.asset_info) ?? asRecord(record.token);
        const type = String(tokenInfo?.type ?? tokenInfo?.standard ?? record.type ?? "").toLowerCase();
        const tokenAddress =
            typeof tokenInfo?.address === "string" ? tokenInfo.address : undefined;
        const symbol = String(tokenInfo?.symbol ?? record.symbol ?? (type.includes("native") ? "" : "TOKEN"));
        const decimals = Number(tokenInfo?.decimals ?? record.decimals ?? 18);
        const amount = parseAmount(record.amount ?? record.raw_amount ?? record.value);
        if (!amount) continue;
        const from = typeof record.from === "string" ? record.from : undefined;
        const to = typeof record.to === "string" ? record.to : undefined;
        const kind = type.includes("721")
            ? "erc721"
            : type.includes("1155")
                ? "erc1155"
                : type.includes("native") || type.includes("eth")
                    ? "native"
                    : "erc20";
        const transferType = String(record.transfer_type ?? record.type ?? "").toLowerCase();
        const displayDecimals = kind === "erc20" ? decimals : kind === "native" ? 18 : 0;
        const formatted =
            amount.raw === BigInt(0)
                ? amount.display
                : formatUnits(amount.raw < BigInt(0) ? -amount.raw : amount.raw, displayDecimals);
        const display = formatted.includes(".")
            ? formatted.replace(/0+$/, "").replace(/\.$/, "")
            : formatted;

        const push = (address: string | undefined, direction: "in" | "out") => {
            if (!address || address.toLowerCase() === ethers.ZeroAddress.toLowerCase()) return;
            result.push({
                address,
                token: symbol || (kind === "native" ? "Native" : "TOKEN"),
                tokenAddress,
                delta: `${direction === "out" ? "-" : "+"}${display}`,
                deltaRaw: `${direction === "out" ? "-" : ""}${amount.raw.toString()}`,
                kind,
                decimals: kind === "erc20" ? decimals : kind === "native" ? 18 : 0,
                direction,
            });
        };

        if (transferType.includes("mint")) {
            push(to, "in");
        } else if (transferType.includes("burn")) {
            push(from, "out");
        } else {
            push(from, "out");
            push(to, "in");
        }
    }
    return { balanceChanges: result };
}

function normalizeStatus(transaction: Record<string, unknown>): boolean {
    const status = transaction.status;
    if (typeof status === "boolean") return status;
    if (typeof status === "string") {
        return status.toLowerCase() === "success" || status.toLowerCase() === "true";
    }
    return transaction.error_message === undefined || transaction.error_message === null;
}

export async function simulateViaTenderly(
    request: SimulationRequest,
    config: SimulationConfig,
    nativeSymbol: string
): Promise<SimulationResult> {
    const credentials = config.tenderly ?? {};
    const key = credentials.key;
    const account = credentials.account;
    const project = credentials.project;
    if (!key || !account || !project) {
        throw new BackendUnavailable(
            "TENDERLY_CONFIG",
            "Tenderly requires TENDERLY_ACCESS_KEY, TENDERLY_ACCOUNT, and TENDERLY_PROJECT."
        );
    }

    const timeoutMs = config.timeoutMs ?? 15000;
    const url = `https://api.tenderly.co/api/v1/account/${encodeURIComponent(account)}/project/${encodeURIComponent(project)}/simulate`;
    const gasLimit = gasLimitNumber(request, 0);
    const body: Record<string, unknown> = {
        network_id: String(request.chainId),
        from: request.from ?? ethers.ZeroAddress,
        input: request.data || "0x",
        value: request.valueWei,
        gas: gasLimit,
        gas_price: request.gasPriceWei ?? "0",
        save: false,
        save_if_fails: false,
        simulation_type: "full",
    };
    if (request.to) body.to = request.to;

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "X-Access-Key": key,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        throw new BackendUnavailable(
            "TENDERLY_ERROR",
            `Tenderly request failed: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new BackendUnavailable(
            "TENDERLY_ERROR",
            `Tenderly returned HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`
        );
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new BackendUnavailable("TENDERLY_ERROR", "Tenderly returned invalid JSON.");
    }

    const root = asRecord(payload);
    const transaction = asRecord(root?.transaction);
    if (!transaction) {
        throw new BackendUnavailable("TENDERLY_ERROR", "Tenderly response did not include a transaction.");
    }
    const info = asRecord(transaction.transaction_info);
    const success = normalizeStatus(transaction);
    const gasUsed = Number(transaction.gas_used ?? 0);
    const rawRevertReason = String(
        transaction.error_message ??
            asRecord(transaction.error_info)?.reason ??
            "Transaction reverted"
    );
    if (!success && isTransactionLevelError(rawRevertReason)) {
        throw new BackendUnavailable("TENDERLY_ERROR", rawRevertReason);
    }
    const revertReason = success ? null : rawRevertReason;

    const rawLogs = toRawLogs(info);
    const callTrace = asRecord(info?.call_trace) as CallTraceNode | null;
    const parsedTrace = callTrace ? parseCallTrace(callTrace) : null;
    const logs = rawLogs.length > 0 ? rawLogs : parsedTrace?.logs ?? [];
    const valueTransfers = parsedTrace?.valueTransfers ?? [];

    const diffs = await deriveDiffs({
        logs,
        valueTransfers,
        provider: config.provider,
        chainId: request.chainId,
        nativeSymbol,
    });
    const assetChanges = parseAssetChanges(info);
    const balanceChanges =
        assetChanges.balanceChanges.length > 0 ? assetChanges.balanceChanges : diffs.balanceChanges;
    const stateChanges = parseTenderlyStateDiff(info?.raw_state_diff ?? info?.state_diff);
    const resolvedGas = gasUsed > 0 ? gasUsed : parsedTrace?.gasUsed ?? 0;
    const limit = gasLimitNumber(request, resolvedGas);
    const notes: string[] = [];

    if (!info) {
        notes.push("Tenderly returned no transaction_info; event and state detail may be incomplete.");
    }

    return {
        status: success ? "success" : "revert",
        success,
        gasUsed: resolvedGas,
        gasLimit: limit,
        gasUsedPercent: gasPercent(resolvedGas, limit),
        gasPriceWei: request.gasPriceWei,
        balanceChanges,
        approvals: diffs.approvals,
        stateChanges,
        events: diffs.events,
        revertReason,
        backend: "tenderly",
        capabilities: {
            ...EMPTY_CAPABILITIES,
            success: true,
            gas: resolvedGas > 0,
            balances: true,
            approvals: true,
            events: true,
            stateChanges: stateChanges.length > 0,
            trace: true,
        },
        notes,
    };
}
