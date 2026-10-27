import { Interface, ZeroAddress, ethers, formatUnits } from "ethers";
import type { Provider } from "../rpc/provider";
import type {
    ApprovalChange,
    BalanceChange,
    BalanceChangeKind,
    EmittedEvent,
} from "../types";
import { getTokenMeta, type TokenMeta } from "../token/metadata";
import {
    ERC1155_ABI,
    UNISWAP_V2_ROUTER_ABI,
    UNISWAP_V3_ROUTER_ABI,
} from "../abi/abis";

export interface RawLog {
    address: string;
    topics: string[];
    data: string;
}

export interface ValueTransfer {
    from: string;
    to: string;
    value: bigint;
}

export interface DerivedDiffs {
    balanceChanges: BalanceChange[];
    approvals: ApprovalChange[];
    events: EmittedEvent[];
}

const ZERO = ZeroAddress.toLowerCase();
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)").toLowerCase();
const APPROVAL_TOPIC = ethers.id("Approval(address,address,uint256)").toLowerCase();
const APPROVAL_ALL_TOPIC = ethers.id("ApprovalForAll(address,address,bool)").toLowerCase();
const TRANSFER_SINGLE_TOPIC = ethers.id("TransferSingle(address,address,address,uint256,uint256)").toLowerCase();
const TRANSFER_BATCH_TOPIC = ethers.id("TransferBatch(address,address,address,uint256[],uint256[])").toLowerCase();
const PERMIT2_APPROVAL_TOPIC = ethers.id("Approval(address,address,address,uint160,uint48)").toLowerCase();

const ERC1155_IFACE = new Interface(ERC1155_ABI);
const OTHER_EVENT_IFACE = new Interface([
    ...UNISWAP_V2_ROUTER_ABI,
    ...UNISWAP_V3_ROUTER_ABI,
    "event Deposit(address indexed dst, uint256 wad)",
    "event Withdrawal(address indexed src, uint256 wad)",
]);

interface AggregatedDelta {
    address: string;
    token: string;
    tokenAddress?: string;
    kind: BalanceChangeKind;
    decimals: number;
    delta: bigint;
}

function topicAddress(topic: string): string {
    return ethers.getAddress(`0x${topic.slice(-40)}`);
}

function word(data: string, index: number): bigint {
    const clean = data.startsWith("0x") ? data.slice(2) : data;
    const chunk = clean.slice(index * 64, (index + 1) * 64);
    if (!chunk) return BigInt(0);
    return BigInt(`0x${chunk}`);
}

function trimNumber(value: string): string {
    if (!value.includes(".")) return value;
    return value.replace(/0+$/, "").replace(/\.$/, "");
}

function formatAmount(raw: bigint, decimals: number): string {
    return trimNumber(formatUnits(raw, decimals));
}

function addDelta(
    map: Map<string, AggregatedDelta>,
    address: string,
    meta: TokenMeta,
    tokenAddress: string | undefined,
    delta: bigint,
    label?: string
): void {
    if (address.toLowerCase() === ZERO || delta === BigInt(0)) return;
    const token = label ?? meta.symbol;
    const key = `${address.toLowerCase()}:${meta.kind}:${tokenAddress?.toLowerCase() ?? "native"}:${token}`;
    const existing = map.get(key);
    if (existing) {
        existing.delta += delta;
        return;
    }
    map.set(key, {
        address,
        token,
        tokenAddress,
        kind: meta.kind,
        decimals: meta.kind === "native" ? 18 : meta.kind === "erc20" ? meta.decimals : 0,
        delta,
    });
}

function finalizeDeltas(map: Map<string, AggregatedDelta>): BalanceChange[] {
    return Array.from(map.values())
        .filter((entry) => entry.delta !== BigInt(0))
        .map((entry) => {
            const negative = entry.delta < BigInt(0);
            const absolute = negative ? -entry.delta : entry.delta;
            return {
                address: entry.address,
                token: entry.token,
                tokenAddress: entry.tokenAddress,
                delta: `${negative ? "-" : "+"}${formatAmount(absolute, entry.decimals)}`,
                deltaRaw: entry.delta.toString(),
                kind: entry.kind,
                decimals: entry.decimals,
                direction: negative ? "out" : "in",
            } satisfies BalanceChange;
        });
}


function parseNamedEvent(log: RawLog): EmittedEvent | null {
    try {
        const parsed = OTHER_EVENT_IFACE.parseLog({ topics: log.topics, data: log.data });
        if (!parsed) return null;
        const params: Record<string, string> = {};
        parsed.fragment.inputs.forEach((input, index) => {
            params[input.name] = String(parsed.args[index]);
        });
        return { name: parsed.name, address: log.address, params, topics: log.topics, data: log.data };
    } catch {
        return null;
    }
}

export async function deriveDiffs(args: {
    logs: RawLog[];
    valueTransfers?: ValueTransfer[];
    provider?: Provider;
    chainId: number;
    nativeSymbol: string;
}): Promise<DerivedDiffs> {
    const deltas = new Map<string, AggregatedDelta>();
    const approvals: ApprovalChange[] = [];
    const events: EmittedEvent[] = [];
    const metaCache = new Map<string, Promise<TokenMeta>>();

    const metaFor = (address: string, hint?: BalanceChangeKind): Promise<TokenMeta> => {
        const key = `${address.toLowerCase()}:${hint ?? ""}`;
        const cached = metaCache.get(key);
        if (cached) return cached;
        const promise = getTokenMeta(args.provider, args.chainId, address, hint);
        metaCache.set(key, promise);
        return promise;
    };

    for (const transfer of args.valueTransfers ?? []) {
        if (transfer.value <= BigInt(0)) continue;
        const nativeMeta: TokenMeta = { symbol: args.nativeSymbol, decimals: 18, kind: "native" };
        addDelta(deltas, ethers.getAddress(transfer.from), nativeMeta, undefined, -transfer.value);
        addDelta(deltas, ethers.getAddress(transfer.to), nativeMeta, undefined, transfer.value);
    }

    for (const log of args.logs) {
        if (events.length >= 50) break;
        if (!log.topics || log.topics.length === 0) continue;
        const topic0 = log.topics[0].toLowerCase();

        if (topic0 === TRANSFER_TOPIC) {
            try {
                const from = topicAddress(log.topics[1]);
                const to = topicAddress(log.topics[2]);
                if (log.topics.length >= 4) {
                    const tokenId = BigInt(log.topics[3]);
                    const meta = await metaFor(log.address, "erc721");
                    const label = `${meta.symbol} #${tokenId}`;
                    addDelta(deltas, from, meta, log.address, BigInt(-1), label);
                    addDelta(deltas, to, meta, log.address, BigInt(1), label);
                    events.push({
                        name: "Transfer",
                        address: log.address,
                        params: { from, to, tokenId: tokenId.toString(), token: label },
                        topics: log.topics,
                        data: log.data,
                    });
                } else {
                    const value = word(log.data, 0);
                    const meta = await metaFor(log.address);
                    if (meta.kind === "erc721") {
                        const label = `${meta.symbol} #${value}`;
                        addDelta(deltas, from, meta, log.address, BigInt(-1), label);
                        addDelta(deltas, to, meta, log.address, BigInt(1), label);
                        events.push({
                            name: "Transfer",
                            address: log.address,
                            params: { from, to, tokenId: value.toString(), token: label },
                        });
                    } else {
                        addDelta(deltas, from, meta, log.address, -value);
                        addDelta(deltas, to, meta, log.address, value);
                        events.push({
                            name: "Transfer",
                            address: log.address,
                            params: {
                                from,
                                to,
                                value: formatAmount(value, meta.decimals),
                                token: meta.symbol,
                            },
                            topics: log.topics,
                            data: log.data,
                        });
                    }
                }
            } catch {
                /* skip malformed transfer log */
            }
            continue;
        }

        if (topic0 === TRANSFER_SINGLE_TOPIC) {
            try {
                const from = topicAddress(log.topics[2]);
                const to = topicAddress(log.topics[3]);
                const id = word(log.data, 0);
                const value = word(log.data, 1);
                const meta = await metaFor(log.address, "erc1155");
                addDelta(deltas, from, meta, log.address, -value, `${meta.symbol} #${id}`);
                addDelta(deltas, to, meta, log.address, value, `${meta.symbol} #${id}`);
                events.push({
                    name: "TransferSingle",
                    address: log.address,
                    params: { from, to, id: id.toString(), value: value.toString(), token: meta.symbol },
                });
            } catch {
                /* skip */
            }
            continue;
        }

        if (topic0 === TRANSFER_BATCH_TOPIC) {
            try {
                const parsed = ERC1155_IFACE.parseLog({ topics: log.topics, data: log.data });
                if (parsed) {
                    const from = topicAddress(log.topics[2]);
                    const to = topicAddress(log.topics[3]);
                    const ids = parsed.args[3] as bigint[];
                    const values = parsed.args[4] as bigint[];
                    const meta = await metaFor(log.address, "erc1155");
                    ids.forEach((id, index) => {
                        const value = values[index] ?? BigInt(0);
                        addDelta(deltas, from, meta, log.address, -value, `${meta.symbol} #${id}`);
                        addDelta(deltas, to, meta, log.address, value, `${meta.symbol} #${id}`);
                    });
                    events.push({
                        name: "TransferBatch",
                        address: log.address,
                        params: {
                            from,
                            to,
                            ids: ids.map(String).join(", "),
                            values: values.map(String).join(", "),
                            token: meta.symbol,
                        },
                    });
                }
            } catch {
                /* skip */
            }
            continue;
        }

        if (topic0 === APPROVAL_TOPIC) {
            try {
                const owner = topicAddress(log.topics[1]);
                const spender = topicAddress(log.topics[2]);
                const meta = await metaFor(log.address);
                const isNft = meta.kind === "erc721" || log.topics.length >= 4;
                const amount = isNft && log.topics.length >= 4 ? BigInt(log.topics[3]) : word(log.data, 0);
                approvals.push({
                    owner,
                    spender,
                    token: meta.symbol,
                    tokenAddress: log.address,
                    kind: isNft ? "erc721" : "erc20",
                    amount: isNft ? `token #${amount}` : formatAmount(amount, meta.decimals),
                    amountRaw: amount.toString(),
                });
                events.push({
                    name: "Approval",
                    address: log.address,
                    params: isNft
                        ? { owner, spender, tokenId: amount.toString(), token: meta.symbol }
                        : { owner, spender, value: formatAmount(amount, meta.decimals), token: meta.symbol },
                });
            } catch {
                /* skip */
            }
            continue;
        }

        if (topic0 === APPROVAL_ALL_TOPIC) {
            try {
                const owner = topicAddress(log.topics[1]);
                const operator = topicAddress(log.topics[2]);
                const approved = word(log.data, 0) !== BigInt(0);
                const meta = await metaFor(log.address);
                approvals.push({
                    owner,
                    spender: operator,
                    token: meta.symbol,
                    tokenAddress: log.address,
                    kind: "all",
                    approved,
                });
                events.push({
                    name: "ApprovalForAll",
                    address: log.address,
                    params: { owner, operator, approved: String(approved), token: meta.symbol },
                });
            } catch {
                /* skip */
            }
            continue;
        }

        if (topic0 === PERMIT2_APPROVAL_TOPIC) {
            try {
                const owner = topicAddress(log.topics[1]);
                const tokenAddress = topicAddress(log.topics[2]);
                const spender = topicAddress(log.topics[3]);
                const amount = word(log.data, 0);
                const expiration = word(log.data, 1);
                const meta = await metaFor(tokenAddress);
                approvals.push({
                    owner,
                    spender,
                    token: meta.symbol,
                    tokenAddress,
                    kind: "erc20",
                    amount: formatAmount(amount, meta.decimals),
                    amountRaw: amount.toString(),
                });
                events.push({
                    name: "Permit2 Approval",
                    address: log.address,
                    params: {
                        owner,
                        spender,
                        token: meta.symbol,
                        amount: formatAmount(amount, meta.decimals),
                        expiration: expiration.toString(),
                    },
                });
            } catch {
                /* skip */
            }
            continue;
        }

        const named = parseNamedEvent(log);
        if (named) {
            events.push(named);
        } else {
            events.push({
                name: `Event ${topic0.slice(0, 10)}`,
                address: log.address,
                params: { topic0, data: log.data.slice(0, 74) },
                topics: log.topics,
                data: log.data,
            });
        }
    }

    return {
        balanceChanges: finalizeDeltas(deltas),
        approvals,
        events,
    };
}
