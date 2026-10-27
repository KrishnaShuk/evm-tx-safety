import { formatUnits } from "ethers";
import type { DecodedParam, DecodedTransaction, EntityInfo, SignatureConfidence, TxType } from "../types";

export interface TokenMeta {
    symbol: string;
    decimals: number;
}

export interface SummaryContext {
    type: TxType;
    to: string;
    contractName?: string;
    functionName?: string;
    functionSignature?: string;
    confidence: SignatureConfidence;
    selector: string;
    params: DecodedParam[];
    valueEth: string;
    nativeSymbol: string;
    calls: DecodedTransaction["calls"];
    entities: Record<string, EntityInfo>;
    token?: TokenMeta;
}

export function shortAddress(address: string, size = 4): string {
    if (!address || address.length < 12) return address || "unknown";
    return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

const MAX_UINT160_DECIMAL = "1461501637330902918203684832716283019655932542975";
const MAX_UINT256_DECIMAL =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

export function formatAmount(raw: string | undefined, decimals = 18): string {
    if (!raw) return "an unknown amount";
    if (raw.includes("MAX_UINT256")) return "an unlimited amount";
    if (raw === MAX_UINT160_DECIMAL || raw === MAX_UINT256_DECIMAL) return "an unlimited amount";
    try {
        const formatted = formatUnits(BigInt(raw), decimals);
        if (!formatted.includes(".")) return formatted;
        return formatted.replace(/0+$/, "").replace(/\.$/, "");
    } catch {
        return raw;
    }
}

function param(ctx: SummaryContext, ...names: string[]): string | undefined {
    for (const name of names) {
        const hit = ctx.params.find((item) => item.name === name || item.name.endsWith(`.${name}`));
        if (hit) return hit.value;
    }
    return undefined;
}

function contractNote(ctx: SummaryContext): string {
    const entity = ctx.entities[ctx.to.toLowerCase()];
    if (!entity) return "";
    if (entity.name) return ` (${entity.name})`;
    if (entity.isContract && !entity.known) return " (unverified contract)";
    if (entity.isContract === false) return " (EOA)";
    return "";
}

export function buildSummary(ctx: SummaryContext): string {
    const token = ctx.token;
    const symbol = token?.symbol ?? (ctx.contractName ? ctx.contractName : shortAddress(ctx.to));
    const decimals = token?.decimals ?? 18;

    switch (ctx.type) {
        case "ETH Transfer": {
            return `Send ${ctx.valueEth} ${ctx.nativeSymbol} to ${shortAddress(ctx.to)}${contractNote(ctx)}.`;
        }
        case "Contract Deployment": {
            return "Deploy a new contract.";
        }
        case "ERC-20 Approve": {
            const spender = param(ctx, "spender", "_spender");
            const amount = param(ctx, "amount", "value", "_value");
            const unlimited =
                amount?.includes("MAX_UINT256") ||
                amount === MAX_UINT256_DECIMAL ||
                amount === MAX_UINT160_DECIMAL;
            return `Approve ${unlimited ? "an unlimited amount" : formatAmount(amount, decimals)} of ${symbol} for ${shortAddress(spender ?? "unknown")}.`;
        }
        case "Permit": {
            const spender = param(ctx, "spender", "spender.address");
            const amount = param(ctx, "value", "amount", "permitSingle.details.amount");
            return `Sign a permit allowing ${shortAddress(spender ?? "unknown")} to spend ${formatAmount(amount, decimals)} ${symbol}.`;
        }
        case "ERC-20 Transfer": {
            const recipient = param(ctx, "to", "recipient");
            const amount = param(ctx, "amount", "value", "_value");
            return `Send ${formatAmount(amount, decimals)} ${symbol} to ${shortAddress(recipient ?? "unknown")}${recipient ? contractNoteFor(ctx, recipient) : ""}.`;
        }
        case "ERC-721 Transfer": {
            const recipient = param(ctx, "to", "recipient");
            const tokenId = param(ctx, "tokenId", "id");
            return `Transfer NFT #${tokenId ?? "?"} from ${symbol} to ${shortAddress(recipient ?? "unknown")}.`;
        }
        case "ERC-1155 Transfer": {
            const recipient = param(ctx, "to", "recipient");
            const id = param(ctx, "id", "tokenId");
            const amount = param(ctx, "amount", "value");
            return `Transfer ${formatAmount(amount, 0)} unit(s) of ${symbol} token #${id ?? "?"} to ${shortAddress(recipient ?? "unknown")}.`;
        }
        case "ERC-721 Approval": {
            const operator = param(ctx, "operator", "to");
            const approved = param(ctx, "approved");
            return approved === "false"
                ? `Revoke operator access for ${shortAddress(operator ?? "unknown")} on ${symbol}.`
                : `Give ${shortAddress(operator ?? "unknown")} control over all NFTs in ${symbol}.`;
        }
        case "Uniswap Swap": {
            const path = param(ctx, "path", "params.path");
            const tokenIn = param(ctx, "params.tokenIn", "tokenIn");
            const tokenOut = param(ctx, "params.tokenOut", "tokenOut");
            const via = ctx.contractName ?? "Uniswap";
            const route = path ?? (tokenIn && tokenOut ? `${shortAddress(tokenIn)} → ${shortAddress(tokenOut)}` : "");
            const commandCount = ctx.calls.flatMap((call) => [call, ...(call.children ?? [])]).filter((call) => call.command).length;
            return `Swap${route ? ` ${route}` : ""} using ${via}${commandCount > 1 ? ` (${commandCount} commands)` : ""}.`;
        }
        case "Multicall": {
            const count = ctx.calls.reduce((total, call) => total + (call.children?.length ?? 0), 0);
            return `Execute ${Math.max(1, count)} call${count === 1 ? "" : "s"} in one transaction via ${ctx.contractName ?? shortAddress(ctx.to)}.`;
        }
        default: {
            if (ctx.functionName && ctx.confidence !== "unverified") {
                const target = ctx.contractName ?? shortAddress(ctx.to);
                return `Call ${ctx.functionName} on ${target}${contractNote(ctx)}.`;
            }
            if (ctx.selector) {
                return `Call unverified function ${ctx.selector} on ${shortAddress(ctx.to)}${contractNote(ctx)}.`;
            }
            return `Call ${shortAddress(ctx.to)} with ${ctx.valueEth} ${ctx.nativeSymbol}.`;
        }
    }
}

function contractNoteFor(ctx: SummaryContext, address: string): string {
    const entity = ctx.entities[address.toLowerCase()];
    if (!entity) return "";
    if (entity.name) return ` (${entity.name})`;
    if (entity.isContract && !entity.known) return " (unverified contract)";
    return "";
}
