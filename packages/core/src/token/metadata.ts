import { Interface } from "ethers";
import { getKnownToken } from "../config/chains";
import type { BalanceChangeKind } from "../types";
import type { Provider } from "../rpc/provider";
import { withTimeout } from "../rpc/provider";
import { ERC20_ABI } from "../abi/abis";

export interface TokenMeta {
    symbol: string;
    decimals: number;
    kind: BalanceChangeKind;
}

const cache = new Map<string, TokenMeta>();
const erc20 = new Interface(ERC20_ABI);
const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";
const SUPPORTS_INTERFACE_SELECTOR = "0x01ffc9a7";

const EMPTY_CODE = new Set(["0x", "0x0", "0x00"]);

function fallback(address: string, kind: BalanceChangeKind): TokenMeta {
    return {
        symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
        decimals: kind === "erc20" ? 18 : 0,
        kind,
    };
}

async function supportsInterface(
    provider: Provider,
    address: string,
    interfaceId: string
): Promise<boolean> {
    try {
        const data = `${SUPPORTS_INTERFACE_SELECTOR}${interfaceId.slice(2).padEnd(64, "0")}`;
        const result = await withTimeout(provider.call({ to: address, data }), 2500, "supportsInterface");
        if (!result || result === "0x") return false;
        return BigInt(result) === BigInt(1);
    } catch {
        return false;
    }
}

export async function getTokenMeta(
    provider: Provider | undefined,
    chainId: number,
    address: string,
    hint?: BalanceChangeKind
): Promise<TokenMeta> {
    const key = `${chainId}:${address.toLowerCase()}:${hint ?? ""}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const known = getKnownToken(chainId, address);
    if (known) {
        const kind: BalanceChangeKind =
            known.kind === "erc721" ? "erc721" : known.kind === "erc1155" ? "erc1155" : "erc20";
        const meta: TokenMeta = {
            symbol: known.symbol,
            decimals: kind === "erc20" ? known.decimals : 0,
            kind: hint === "native" ? "native" : hint && hint !== "erc20" ? hint : kind,
        };
        cache.set(key, meta);
        return meta;
    }

    if (!provider) {
        const meta = fallback(address, hint && hint !== "native" ? hint : "erc20");
        cache.set(key, meta);
        return meta;
    }

    let symbol = fallback(address, hint ?? "erc20").symbol;
    let decimals = 18;
    let kind: BalanceChangeKind = hint && hint !== "native" ? hint : "erc20";

    try {
        const [symbolRaw, decimalsRaw, code] = await Promise.all([
            withTimeout(provider.call({ to: address, data: erc20.encodeFunctionData("symbol") }), 2500, "symbol()"),
            withTimeout(provider.call({ to: address, data: erc20.encodeFunctionData("decimals") }), 2500, "decimals()"),
            withTimeout(provider.getCode(address), 2500, "eth_getCode"),
        ]);
        if (code && !EMPTY_CODE.has(code)) {
            try {
                const decoded = erc20.decodeFunctionResult("symbol", symbolRaw);
                if (typeof decoded[0] === "string" && decoded[0].length > 0) symbol = decoded[0];
            } catch {
                /* non-standard symbol */
            }
            let hasDecimals = false;
            try {
                const decoded = erc20.decodeFunctionResult("decimals", decimalsRaw);
                decimals = Number(decoded[0]);
                hasDecimals = true;
            } catch {
                /* not an ERC-20 */
            }
            if (!hint || hint === "erc20") {
                if (await supportsInterface(provider, address, ERC721_INTERFACE_ID)) {
                    kind = "erc721";
                    decimals = 0;
                } else if (await supportsInterface(provider, address, ERC1155_INTERFACE_ID)) {
                    kind = "erc1155";
                    decimals = 0;
                } else if (!hasDecimals) {
                    kind = "erc721";
                    decimals = 0;
                }
            }
        }
    } catch {
        /* keep fallback metadata */
    }

    const meta: TokenMeta = { symbol, decimals, kind };
    cache.set(key, meta);
    return meta;
}

export function clearTokenMetaCache(): void {
    cache.clear();
}
