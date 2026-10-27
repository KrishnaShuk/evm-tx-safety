import { ethers, Interface, FunctionFragment } from "ethers";
import { getKnownToken, getChainOrNull } from "../config/chains";
import type { SignatureConfidence } from "../types";
import type { Provider } from "../rpc/provider";
import { safeGetCode, withTimeout } from "../rpc/provider";
import {
    ERC20_ABI,
    ERC721_ABI,
    ERC1155_ABI,
    WETH_ABI,
    UNISWAP_V2_ROUTER_ABI,
    UNISWAP_V3_ROUTER_ABI,
    UNIVERSAL_ROUTER_ABI,
    PERMIT2_ABI,
    MULTICALL3_ABI,
} from "./abis";

const ABI_BY_KEY: Record<string, { abi: string[]; label: string }> = {
    erc20: { abi: ERC20_ABI, label: "ERC-20" },
    erc721: { abi: ERC721_ABI, label: "ERC-721" },
    erc1155: { abi: ERC1155_ABI, label: "ERC-1155" },
    weth: { abi: WETH_ABI, label: "Wrapped Native" },
    uniswap_v2: { abi: UNISWAP_V2_ROUTER_ABI, label: "Uniswap V2 Router" },
    uniswap_v3: { abi: UNISWAP_V3_ROUTER_ABI, label: "Uniswap V3 Router" },
    universal_router: { abi: UNIVERSAL_ROUTER_ABI, label: "Uniswap Universal Router" },
    permit2: { abi: PERMIT2_ABI, label: "Permit2" },
    multicall3: { abi: MULTICALL3_ABI, label: "Multicall3" },
};

export interface SelectorResolution {
    signature: string;
    functionName: string;
    confidence: SignatureConfidence;
    iface?: Interface;
    fragment?: FunctionFragment;
    candidates?: string[];
    source: "curated" | "verified" | "openchain" | "4byte";
}

export interface TargetAbi {
    iface: Interface;
    source: "curated" | "verified" | "proxy";
    label?: string;
    implementation?: string;
}

interface CacheEntry<T> {
    value: T;
    expires: number;
}

const TTL_MS = 10 * 60 * 1000;
const selectorCache = new Map<string, CacheEntry<SelectorResolution | null>>();
const targetAbiCache = new Map<string, CacheEntry<TargetAbi | null>>();
const codeCache = new Map<string, CacheEntry<string>>();
const proxyCache = new Map<string, CacheEntry<string | null>>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
        map.delete(key);
        return undefined;
    }
    return entry.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): T {
    map.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
}

// ── Local selector index ──────────────────────────────────────────────────────
const curatedInterfaces = Object.entries(ABI_BY_KEY).map(([key, value]) => ({
    key,
    label: value.label,
    iface: new Interface(value.abi),
}));

const localSelectorIndex = new Map<string, SelectorResolution[]>();
for (const entry of curatedInterfaces) {
    for (const rawFragment of entry.iface.fragments) {
        if (rawFragment.type !== "function") continue;
        const fragment = rawFragment as FunctionFragment;
        const selector = fragment.selector.toLowerCase();
        const resolution: SelectorResolution = {
            signature: fragment.format("sighash"),
            functionName: fragment.name,
            confidence: "curated",
            iface: entry.iface,
            fragment,
            source: "curated",
        };
        const existing = localSelectorIndex.get(selector) ?? [];
        if (!existing.some((item) => item.signature === resolution.signature)) {
            existing.push(resolution);
            localSelectorIndex.set(selector, existing);
        }
    }
}

export function formatSignature(fragment: FunctionFragment): string {
    return fragment.format("sighash");
}

export function getLocalResolution(selector: string): SelectorResolution | null {
    const hit = localSelectorIndex.get(selector.toLowerCase());
    return hit?.[0] ?? null;
}

export function getLocalInterfaceForKnownContract(chainId: number, address: string): TargetAbi | null {
    const known = getKnownToken(chainId, address);
    if (!known) return null;
    const name = (known.name ?? "").toLowerCase();
    let key: keyof typeof ABI_BY_KEY = "erc20";
    if (known.kind === "erc721") key = "erc721";
    else if (known.kind === "erc1155") key = "erc1155";
    else if (name.includes("universal router")) key = "universal_router";
    else if (name.includes("permit2")) key = "permit2";
    else if (name.includes("multicall3")) key = "multicall3";
    else if (name.includes("uniswap v2") || name.includes("pancakeswap v2")) key = "uniswap_v2";
    else if (name.includes("uniswap v3") || name.includes("smartrouter")) key = "uniswap_v3";
    else if (["weth", "wbnb", "wmatic"].includes(known.symbol.toLowerCase()) || name.includes("wrapped")) key = "weth";
    const abi = ABI_BY_KEY[key];
    if (!abi) return null;
    return { iface: new Interface(abi.abi), source: "curated", label: known.name ?? abi.label };
}

// ── Remote lookups ────────────────────────────────────────────────────────────
async function fetchJson(url: string, timeoutMs = 3000): Promise<unknown | null> {
    try {
        const response = await withTimeout(
            fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) }),
            timeoutMs,
            "registry fetch"
        );
        if (!response.ok) return null;
        return (await response.json()) as unknown;
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function fetchSourcifyAbi(chainId: number, address: string): Promise<{ abi: unknown[]; name?: string } | null> {
    let checksummed: string;
    try {
        checksummed = ethers.getAddress(address);
    } catch {
        return null;
    }
    for (const match of ["full_match", "partial_match"]) {
        const url = `https://repo.sourcify.dev/contracts/${match}/${chainId}/${checksummed}/metadata.json`;
        const data = asRecord(await fetchJson(url, 2500));
        if (!data) continue;
        const output = asRecord(data.output);
        const abi = output?.abi;
        if (!Array.isArray(abi)) continue;
        let name: string | undefined;
        const settings = asRecord(data.settings);
        const target = asRecord(settings?.compilationTarget);
        if (target) {
            const first = Object.values(target)[0];
            if (typeof first === "string") name = first;
        }
        return { abi, name };
    }
    return null;
}

async function lookupOpenChain(selector: string): Promise<SelectorResolution | null> {
    const url = `https://api.openchain.xyz/signature-database/v1/lookup?function=${encodeURIComponent(selector)}&filter=true`;
    const data = asRecord(await fetchJson(url, 2500));
    if (!data || data.ok !== true) return null;
    const result = asRecord(data.result);
    const fn = asRecord(result?.function);
    const entries = fn?.[selector] ?? fn?.[selector.toLowerCase()];
    if (!Array.isArray(entries)) return null;
    const names = entries
        .map((entry) => asRecord(entry)?.name)
        .filter((name): name is string => typeof name === "string" && name.includes("("));
    const unique = Array.from(new Set(names));
    if (unique.length === 0) return null;
    const ranked = unique.sort((a, b) => a.length - b.length);
    const signature = ranked[0];
    try {
        const iface = new Interface([`function ${signature}`]);
        const fragment = iface.fragments.find(
            (item): item is FunctionFragment => item.type === "function"
        );
        return {
            signature,
            functionName: signature.slice(0, signature.indexOf("(")),
            confidence: "registry",
            iface,
            fragment,
            candidates: ranked.slice(0, 5),
            source: "openchain",
        };
    } catch {
        return null;
    }
}

async function lookup4byte(selector: string): Promise<SelectorResolution | null> {
    const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${encodeURIComponent(selector)}`;
    const data = asRecord(await fetchJson(url, 2500));
    const results = data?.results;
    if (!Array.isArray(results)) return null;
    const names: string[] = [];
    for (const item of results) {
        const text = asRecord(item)?.text_signature;
        if (typeof text !== "string" || !text.includes("(")) continue;
        try {
            new Interface([`function ${text}`]);
            if (!names.includes(text)) names.push(text);
        } catch {
            /* skip malformed signatures */
        }
    }
    if (names.length === 0) return null;
    const ranked = names.sort((a, b) => {
        const aPenalty = /test|fake|spam|claim|visit|http/i.test(a) ? 1 : 0;
        const bPenalty = /test|fake|spam|claim|visit|http/i.test(b) ? 1 : 0;
        if (aPenalty !== bPenalty) return aPenalty - bPenalty;
        return a.length - b.length;
    });
    const signature = ranked[0];
    try {
        const iface = new Interface([`function ${signature}`]);
        const fragment = iface.fragments.find(
            (item): item is FunctionFragment => item.type === "function"
        );
        return {
            signature,
            functionName: signature.slice(0, signature.indexOf("(")),
            confidence: "unverified",
            iface,
            fragment,
            candidates: ranked.slice(0, 5),
            source: "4byte",
        };
    } catch {
        return null;
    }
}

async function getCodeCached(provider: Provider | undefined, address: string): Promise<string | null> {
    if (!provider) return null;
    const key = address.toLowerCase();
    const cached = cacheGet(codeCache, key);
    if (cached !== undefined) return cached;
    const result = await safeGetCode(provider, address);
    if (!result.ok || result.code === undefined) return null;
    return cacheSet(codeCache, key, result.code);
}

export async function isContractAddress(provider: Provider | undefined, address: string): Promise<boolean | undefined> {
    const code = await getCodeCached(provider, address);
    if (code === null) return undefined;
    return code !== "0x" && code !== "0x0";
}

async function resolveProxyImplementation(provider: Provider | undefined, address: string): Promise<string | null> {
    if (!provider) return null;
    const key = address.toLowerCase();
    const cached = cacheGet(proxyCache, key);
    if (cached !== undefined) return cached;

    const code = await getCodeCached(provider, address);
    if (!code) return cacheSet(proxyCache, key, null);

    const minimal = code.match(/^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3/);
    if (minimal) {
        return cacheSet(proxyCache, key, ethers.getAddress(`0x${minimal[1]}`));
    }

    const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
    try {
        const raw = await withTimeout(provider.getStorage(address, implementationSlot), 3000, "eth_getStorageAt");
        const impl = ethers.getAddress(`0x${raw.slice(-40)}`);
        if (impl !== ethers.ZeroAddress) return cacheSet(proxyCache, key, impl);
    } catch {
        /* not an EIP-1967 proxy */
    }
    try {
        const raw = await withTimeout(provider.getStorage(address, beaconSlot), 3000, "eth_getStorageAt");
        const beacon = ethers.getAddress(`0x${raw.slice(-40)}`);
        if (beacon !== ethers.ZeroAddress) {
            const result = await withTimeout(
                provider.call({ to: beacon, data: ethers.id("implementation()").slice(0, 10) }),
                3000,
                "beacon implementation()"
            );
            const impl = ethers.getAddress(`0x${result.slice(-40)}`);
            if (impl !== ethers.ZeroAddress) return cacheSet(proxyCache, key, impl);
        }
    } catch {
        /* not a beacon proxy */
    }
    return cacheSet(proxyCache, key, null);
}

export async function getTargetAbi(
    target: string,
    chainId: number,
    provider?: Provider
): Promise<TargetAbi | null> {
    const key = `${chainId}:${target.toLowerCase()}`;
    const cached = cacheGet(targetAbiCache, key);
    if (cached !== undefined) return cached;

    const known = getLocalInterfaceForKnownContract(chainId, target);
    if (known) {
        return cacheSet(targetAbiCache, key, known);
    }

    const sourcify = await fetchSourcifyAbi(chainId, target);
    if (sourcify) {
        try {
            const iface = new Interface(sourcify.abi as ethers.InterfaceAbi);
            return cacheSet(targetAbiCache, key, {
                iface,
                source: "verified",
                label: sourcify.name,
            });
        } catch {
            /* malformed verified ABI */
        }
    }

    const implementation = await resolveProxyImplementation(provider, target);
    if (implementation) {
        const implSourcify = await fetchSourcifyAbi(chainId, implementation);
        if (implSourcify) {
            try {
                const iface = new Interface(implSourcify.abi as ethers.InterfaceAbi);
                return cacheSet(targetAbiCache, key, {
                    iface,
                    source: "proxy",
                    label: implSourcify.name,
                    implementation,
                });
            } catch {
                /* ignore */
            }
        }
    }

    return cacheSet(targetAbiCache, key, null);
}

function findFragment(target: TargetAbi, selector: string): SelectorResolution | null {
    for (const rawFragment of target.iface.fragments) {
        if (rawFragment.type !== "function") continue;
        const fragment = rawFragment as FunctionFragment;
        if (fragment.selector.toLowerCase() === selector) {
            return {
                signature: fragment.format("sighash"),
                functionName: fragment.name,
                confidence: target.source === "curated" ? "curated" : "verified",
                iface: target.iface,
                fragment,
                source: target.source === "curated" ? "curated" : "verified",
            };
        }
    }
    return null;
}

export async function resolveSelector(
    selector: string,
    options: { target?: string; chainId: number; provider?: Provider; preferTarget?: boolean } = { chainId: 0 }
): Promise<SelectorResolution | null> {
    const normalized = selector.toLowerCase();
    if (normalized.length !== 10) return null;

    const cached = cacheGet(selectorCache, `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`);
    if (cached !== undefined) return cached;

    const local = getLocalResolution(normalized);
    // The local ABI already fully determines parameter types for known
    // selectors. Only pay for a Sourcify/proxy lookup when the selector is
    // unknown (or a caller explicitly asks for target-level verification).
    if (local && !options.preferTarget) {
        return cacheSet(
            selectorCache,
            `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`,
            local
        );
    }

    const target = options.target
        ? await getTargetAbi(options.target, options.chainId, options.provider)
        : null;

    if (target) {
        const match = findFragment(target, normalized);
        if (match) {
            return cacheSet(
                selectorCache,
                `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`,
                match
            );
        }
    }

    if (local) {
        return cacheSet(
            selectorCache,
            `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`,
            local
        );
    }

    const openchain = await lookupOpenChain(normalized);
    if (openchain) {
        return cacheSet(
            selectorCache,
            `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`,
            openchain
        );
    }

    const fourByte = await lookup4byte(normalized);
    return cacheSet(
        selectorCache,
        `${options.chainId}:${options.target?.toLowerCase() ?? ""}:${normalized}`,
        fourByte
    );
}

export function tryParseSignature(signature: string): { iface: Interface; fragment?: FunctionFragment } | null {
    try {
        const iface = new Interface([`function ${signature}`]);
        const fragment = iface.fragments.find(
            (item): item is FunctionFragment => item.type === "function"
        );
        return { iface, fragment };
    } catch {
        return null;
    }
}

export function knownContractName(chainId: number, address: string | undefined): string | undefined {
    if (!address) return undefined;
    return getChainOrNull(chainId)?.knownContracts[address.toLowerCase()]?.name;
}
