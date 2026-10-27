import { AbiCoder, MaxUint256, Result, ethers } from "ethers";
import type { ParamType } from "ethers";
import {
    getChain,
    getKnownToken,
    getSafeOperator,
    getSafeSpender,
} from "../config/chains";
import {
    getTargetAbi,
    isContractAddress,
    knownContractName,
    resolveSelector,
    type SelectorResolution,
} from "../abi/registry";
import { normalizeInput } from "../inputs";
import type {
    DecodedCall,
    DecodedParam,
    DecodedTransaction,
    EntityInfo,
    NormalizedTx,
    RawTxInput,
    SignatureConfidence,
    TxType,
} from "../types";
import { buildSummary, shortAddress } from "./summary";
import { getTokenMeta } from "../token/metadata";
import type { Provider } from "../rpc/provider";

export interface DecodeOptions {
    provider?: Provider;
    chainId?: number;
    to?: string;
    normalized?: NormalizedTx;
}

const EMPTY_SELECTOR = "";
const MAX_CALL_DEPTH = 3;
const MAX_CHILDREN = 20;

function formatValue(value: unknown): string {
    if (typeof value === "bigint") {
        if (value === MaxUint256) return "MAX_UINT256 (unlimited)";
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map(formatValue).join(", ");
    }
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return String(value);
    return String(value);
}

function rawValue(value: unknown): string | undefined {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string" || typeof value === "boolean") return String(value);
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        return value.join(",");
    }
    return undefined;
}

function collectParams(
    inputs: readonly ParamType[],
    args: Result | readonly unknown[],
    prefix = ""
): DecodedParam[] {
    const params: DecodedParam[] = [];
    inputs.forEach((input, index) => {
        const value = (args as readonly unknown[])[index];
        if (input.baseType === "tuple" && input.components) {
            const nested = value as Result | readonly unknown[];
            const childParams = collectParams(input.components, nested, `${prefix}${input.name}.`);
            params.push(...childParams);
            return;
        }
        params.push({
            name: `${prefix}${input.name}`,
            type: input.format(),
            value: formatValue(value),
            raw: rawValue(value),
        });
    });
    return params;
}

function decodeParams(resolution: SelectorResolution, data: string): Result | undefined {
    if (!resolution.iface || !resolution.fragment) return undefined;
    try {
        const parsed = resolution.iface.parseTransaction({ data });
        return parsed?.args;
    } catch {
        return undefined;
    }
}

function isSwapResolution(resolution: SelectorResolution | undefined): boolean {
    if (!resolution) return false;
    const signature = resolution.signature.toLowerCase();
    const name = resolution.functionName.toLowerCase();
    return (
        signature.includes("swap") ||
        name.includes("swap") ||
        resolution.source === "curated" &&
            ["swapExactTokensForTokens", "swapExactETHForTokens", "exactInputSingle", "exactInput", "execute"].includes(
                resolution.functionName
            )
    );
}

function classifyCall(
    resolution: SelectorResolution | undefined,
    target: string,
    chainId: number
): TxType {
    if (!resolution) return "Unknown";
    const known = getKnownToken(chainId, target);
    const signature = resolution.signature.toLowerCase();
    const name = resolution.functionName;

    if (name === "setApprovalForAll") return "ERC-721 Approval";
    if (name === "permit") return "Permit";
    if (name === "approve" || name === "increaseAllowance") {
        return known?.kind === "erc721" ? "ERC-721 Approval" : "ERC-20 Approve";
    }
    if (name === "safeBatchTransferFrom") return "ERC-1155 Transfer";
    if (name === "safeTransferFrom") {
        if (known?.kind === "erc1155" || signature.includes("(address,address,uint256,uint256,bytes)")) {
            return "ERC-1155 Transfer";
        }
        return "ERC-721 Transfer";
    }
    if (name === "transfer" || name === "transferFrom") {
        if (known?.kind === "erc721") return "ERC-721 Transfer";
        if (known?.kind === "erc1155") return "ERC-1155 Transfer";
        return "ERC-20 Transfer";
    }
    if (name.startsWith("aggregate") || name === "multicall") return "Multicall";
    if (isSwapResolution(resolution)) return "Uniswap Swap";
    return "Generic Contract Call";
}

// ── Universal Router ──────────────────────────────────────────────────────────
interface CommandSpec {
    label: string;
    types?: string[];
    names?: string[];
    type: TxType;
}

const UNIVERSAL_COMMANDS: Record<number, CommandSpec> = {
    0x00: {
        label: "V3_SWAP_EXACT_IN",
        types: ["address", "uint256", "uint256", "bytes", "bool"],
        names: ["recipient", "amountIn", "amountOutMinimum", "path", "payerIsUser"],
        type: "Uniswap Swap",
    },
    0x01: {
        label: "V3_SWAP_EXACT_OUT",
        types: ["address", "uint256", "uint256", "bytes", "bool"],
        names: ["recipient", "amountOut", "amountInMaximum", "path", "payerIsUser"],
        type: "Uniswap Swap",
    },
    0x04: {
        label: "SWEEP",
        types: ["address", "address", "uint256"],
        names: ["token", "recipient", "amountMinimum"],
        type: "ERC-20 Transfer",
    },
    0x05: {
        label: "TRANSFER",
        types: ["address", "address", "uint256"],
        names: ["token", "recipient", "amountMinimum"],
        type: "ERC-20 Transfer",
    },
    0x06: {
        label: "PAY_PORTION",
        types: ["address", "address", "uint256"],
        names: ["token", "recipient", "bips"],
        type: "ERC-20 Transfer",
    },
    0x08: {
        label: "V2_SWAP_EXACT_IN",
        types: ["address", "uint256", "uint256", "address[]", "bool"],
        names: ["recipient", "amountIn", "amountOutMinimum", "path", "payerIsUser"],
        type: "Uniswap Swap",
    },
    0x09: {
        label: "V2_SWAP_EXACT_OUT",
        types: ["address", "uint256", "uint256", "address[]", "bool"],
        names: ["recipient", "amountOut", "amountInMaximum", "path", "payerIsUser"],
        type: "Uniswap Swap",
    },
    0x0a: { label: "PERMIT2_PERMIT", type: "Permit" },
    0x0b: {
        label: "WRAP_ETH",
        types: ["address", "uint256"],
        names: ["recipient", "amount"],
        type: "Generic Contract Call",
    },
    0x0c: {
        label: "UNWRAP_WETH",
        types: ["address", "uint256"],
        names: ["recipient", "amountMinimum"],
        type: "Generic Contract Call",
    },
    0x0d: {
        label: "PERMIT2_TRANSFER_FROM",
        types: ["address", "address", "uint160"],
        names: ["token", "recipient", "amount"],
        type: "ERC-20 Transfer",
    },
    0x0e: { label: "PERMIT2_PERMIT_BATCH", type: "Permit" },
    0x0f: { label: "PERMIT2_TRANSFER_FROM_BATCH", type: "ERC-20 Transfer" },
};

function decodeV3Path(pathHex: string): string[] {
    const raw = pathHex.startsWith("0x") ? pathHex.slice(2) : pathHex;
    const tokens: string[] = [];
    let index = 0;
    if (raw.length < 40) return tokens;
    tokens.push(`0x${raw.slice(0, 40)}`);
    index = 40;
    while (index + 46 <= raw.length) {
        index += 6;
        tokens.push(`0x${raw.slice(index, index + 40)}`);
        index += 40;
    }
    return tokens;
}

function decodeUniversalCommand(
    target: string,
    command: number,
    input: string
): DecodedCall {
    const spec = UNIVERSAL_COMMANDS[command];
    const selector = `0x${command.toString(16).padStart(2, "0")}`;
    if (!spec) {
        return {
            target,
            selector,
            type: "Unknown",
            functionSignature: `UNKNOWN_COMMAND_${selector}`,
            functionName: `UNKNOWN_COMMAND_${selector}`,
            confidence: "unverified",
            params: [],
            command: `UNKNOWN_${selector}`,
        };
    }

    const params: DecodedParam[] = [];
    if (spec.types) {
        try {
            const decoded = AbiCoder.defaultAbiCoder().decode(spec.types, input);
            decoded.forEach((value, index) => {
                const name = spec.names?.[index] ?? `arg${index}`;
                const type = spec.types?.[index] ?? "unknown";
                if (name === "path") {
                    if (type === "bytes") {
                        const tokens = decodeV3Path(String(value));
                        params.push({
                            name,
                            type: "address[]",
                            value: tokens.map((token) => shortAddress(token)).join(" → "),
                            raw: tokens.join(","),
                        });
                    } else {
                        const tokens = (value as unknown[]).map((token) => String(token));
                        params.push({
                            name,
                            type,
                            value: tokens.map((token) => shortAddress(token)).join(" → "),
                            raw: tokens.join(","),
                        });
                    }
                    return;
                }
                params.push({ name, type, value: formatValue(value), raw: rawValue(value) });
            });
        } catch {
            /* keep command label even if the payload cannot be decoded */
        }
    }

    return {
        target,
        selector,
        type: spec.type,
        functionSignature: spec.label,
        functionName: spec.label,
        confidence: "verified",
        params,
        command: spec.label,
    };
}

function decodeUniversalExecute(call: DecodedCall, args: Result): DecodedCall[] {
    const commandsHex = String(args[0] ?? "0x").replace(/^0x/, "");
    const inputs = (args[1] ?? []) as unknown[];
    const bytes = commandsHex.match(/.{1,2}/g) ?? [];
    const children: DecodedCall[] = [];
    for (let index = 0; index < Math.min(bytes.length, inputs.length, MAX_CHILDREN); index += 1) {
        const command = parseInt(bytes[index], 16);
        const input = String(inputs[index] ?? "0x");
        children.push(decodeUniversalCommand(call.target, command, input));
    }
    return children;
}

async function decodeChildren(
    call: DecodedCall,
    args: Result | undefined,
    resolution: SelectorResolution | undefined,
    chainId: number,
    provider: Provider | undefined,
    depth: number
): Promise<DecodedCall[]> {
    if (!args || !resolution || depth >= MAX_CALL_DEPTH) return [];
    const name = resolution.functionName;

    if (resolution.signature.startsWith("execute(") && call.command === undefined) {
        return decodeUniversalExecute(call, args);
    }

    if (name === "aggregate" || name === "aggregate3" || name === "aggregate3Value") {
        const entries = (args[0] ?? []) as unknown[];
        const children: DecodedCall[] = [];
        for (const entry of entries.slice(0, MAX_CHILDREN)) {
            const item = entry as readonly unknown[];
            const childTarget = String(item[0] ?? "");
            const childData = String(
                name === "aggregate3Value" ? item[3] : name === "aggregate3" ? item[2] : item[1] ?? "0x"
            );
            if (!ethers.isAddress(childTarget)) continue;
            const decoded = await decodeCallData(childTarget, childData, chainId, provider, depth + 1);
            children.push(decoded.call);
        }
        return children;
    }

    if (name === "multicall") {
        const arrays = args.filter((value) => Array.isArray(value)) as unknown[][];
        const payloads = arrays[arrays.length - 1] ?? [];
        const children: DecodedCall[] = [];
        for (const payload of payloads.slice(0, MAX_CHILDREN)) {
            const decoded = await decodeCallData(call.target, String(payload), chainId, provider, depth + 1);
            children.push(decoded.call);
        }
        return children;
    }

    return [];
}

async function decodeCallData(
    target: string,
    data: string,
    chainId: number,
    provider: Provider | undefined,
    depth: number
): Promise<{ call: DecodedCall; args?: Result; resolution?: SelectorResolution }> {
    const normalizedData = data && data.startsWith("0x") ? data : "0x";
    if (normalizedData === "0x") {
        return {
            call: {
                target,
                selector: EMPTY_SELECTOR,
                type: "ETH Transfer",
                confidence: "verified",
                params: [],
            },
        };
    }
    const selector = normalizedData.length >= 10 ? normalizedData.slice(0, 10).toLowerCase() : "";
    if (!selector) {
        return {
            call: { target, selector, type: "Unknown", confidence: "unverified", params: [] },
        };
    }

    const resolution = (await resolveSelector(selector, { target, chainId, provider })) ?? undefined;
    const args = resolution ? decodeParams(resolution, normalizedData) : undefined;
    const params = resolution?.fragment && args ? collectParams(resolution.fragment.inputs, args) : [];
    const type = classifyCall(resolution, target, chainId);
    const call: DecodedCall = {
        target,
        selector,
        type,
        functionSignature: resolution?.signature,
        functionName: resolution?.functionName,
        confidence: resolution?.confidence ?? "unverified",
        signatureCandidates: resolution?.candidates,
        params,
    };
    call.children = await decodeChildren(call, args, resolution, chainId, provider, depth);
    if (call.type !== "Uniswap Swap" && (call.children ?? []).some((child) => child.type === "Uniswap Swap")) {
        call.type = "Uniswap Swap";
    }
    return { call, args, resolution };
}

// ── Entities & token metadata ────────────────────────────────────────────────
function collectAddresses(calls: DecodedCall[], from: string | undefined, to: string | undefined): string[] {
    const set = new Set<string>();
    const add = (address: string | undefined) => {
        if (!address) return;
        if (!ethers.isAddress(address)) return;
        if (address === ethers.ZeroAddress) return;
        set.add(ethers.getAddress(address));
    };
    add(from);
    add(to);
    const visit = (call: DecodedCall) => {
        add(call.target);
        for (const param of call.params) {
            if (param.type.includes("address")) {
                const matches = param.value.match(/0x[0-9a-fA-F]{40}/g) ?? [];
                for (const match of matches) add(match);
            }
        }
        for (const child of call.children ?? []) visit(child);
    };
    for (const call of calls) visit(call);
    return Array.from(set).slice(0, 16);
}

async function buildEntities(
    calls: DecodedCall[],
    from: string | undefined,
    to: string | undefined,
    chainId: number,
    provider: Provider | undefined
): Promise<Record<string, EntityInfo>> {
    const addresses = collectAddresses(calls, from, to);
    const entries = await Promise.all(
        addresses.map(async (address) => {
            const known = getKnownToken(chainId, address);
            const spenderName = getSafeSpender(chainId, address);
            const operatorName = getSafeOperator(chainId, address);
            const isContract = await isContractAddress(provider, address);
            const info: EntityInfo = {
                address,
                name: known?.name ?? spenderName ?? operatorName,
                known: Boolean(known || spenderName || operatorName),
                isContract,
                isToken: known
                    ? !/router|permit2|multicall3/i.test(known.name ?? "") &&
                      ["erc20", "erc721", "erc1155"].includes(known.kind ?? "erc20")
                    : undefined,
            };
            return [address.toLowerCase(), info] as const;
        })
    );
    return Object.fromEntries(entries);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function decodeTx(
    tx: RawTxInput | string,
    options: DecodeOptions = {}
): Promise<DecodedTransaction> {
    const chainId =
        options.chainId ??
        options.normalized?.chainId ??
        (typeof tx !== "string" ? tx.chainId : undefined) ??
        1;
    const chain = getChain(chainId);
    const normalized =
        options.normalized ??
        (await normalizeInput(tx, { provider: options.provider, to: options.to, chainId }));

    const from = normalized.from;
    const to = normalized.to;
    const data = normalized.data;
    const isDeployment = !to;

    let call: DecodedCall;
    let args: Result | undefined;
    let resolution: SelectorResolution | undefined;

    if (isDeployment) {
        call = {
            target: "null (contract deployment)",
            selector: data.length >= 10 ? data.slice(0, 10).toLowerCase() : EMPTY_SELECTOR,
            type: "Contract Deployment",
            confidence: "verified",
            params: [],
        };
    } else {
        const decoded = await decodeCallData(to, data, chainId, options.provider, 0);
        call = decoded.call;
        args = decoded.args;
        resolution = decoded.resolution;
    }

    const entities = await buildEntities(
        to ? [call] : [],
        from,
        to,
        chainId,
        options.provider
    );
    const toIsContract = to ? entities[to.toLowerCase()]?.isContract : false;
    const targetAbi = to && toIsContract ? await getTargetAbi(to, chainId, options.provider) : null;
    const contractName = knownContractName(chainId, to) ?? targetAbi?.label;

    let tokenAddress =
        to && ["ERC-20 Transfer", "ERC-20 Approve", "Permit"].includes(call.type) ? to : undefined;
    // Permit2 calls carry the actual token as a parameter; `to` is Permit2.
    if (tokenAddress && /permit2/i.test(contractName ?? "")) {
        const tokenParam = call.params.find(
            (param) => param.name === "token" || param.name.endsWith(".token")
        );
        if (tokenParam) tokenAddress = tokenParam.value;
    }
    const token = tokenAddress
        ? await getTokenMeta(options.provider, chainId, tokenAddress)
        : undefined;

    const summary = buildSummary({
        type: call.type,
        to: to ?? "null (contract deployment)",
        contractName,
        functionName: call.functionName,
        functionSignature: call.functionSignature,
        confidence: call.confidence,
        selector: call.selector,
        params: call.params,
        valueEth: ethers.formatEther(BigInt(normalized.valueWei)),
        nativeSymbol: chain.nativeSymbol,
        calls: [call],
        entities,
        token,
    });

    const confidence: SignatureConfidence = call.confidence;
    const txTypeEIP =
        normalized.txType === 2
            ? "EIP-1559"
            : normalized.txType === 1
                ? "EIP-2930"
                : "Legacy";

    return {
        type: call.type,
        from: from ?? "unknown",
        to: to ?? "null (contract deployment)",
        chainId,
        contractName,
        functionSignature: call.functionSignature,
        functionName: call.functionName,
        signatureConfidence: confidence,
        signatureCandidates: call.signatureCandidates,
        params: call.params,
        summary,
        calls: [call],
        entities,
        valueEth: ethers.formatEther(BigInt(normalized.valueWei)),
        valueWei: normalized.valueWei,
        gasLimit: normalized.gasLimitWei ?? "200000",
        gasPriceWei: normalized.gasPriceWei,
        nonce: normalized.nonce,
        txTypeEIP,
        rawData: data,
        txHash: normalized.txHash,
    };
}

export { buildSummary } from "./summary";
