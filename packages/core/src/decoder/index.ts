import { ethers } from "ethers";
import axios from "axios";
import {
    RawTxInput,
    DecodedTransaction,
    DecodedParam,
    TxType,
} from "../types";

// ─── Known 4-byte selectors ──────────────────────────────────────────────────
const KNOWN_SELECTORS: Record<string, { sig: string; name: string }> = {
    "0xa9059cbb": { sig: "transfer(address,uint256)", name: "ERC-20 Transfer" },
    "0x23b872dd": {
        sig: "transferFrom(address,address,uint256)",
        name: "ERC-20 TransferFrom",
    },
    "0x095ea7b3": { sig: "approve(address,uint256)", name: "ERC-20 Approve" },
    "0x70a08231": { sig: "balanceOf(address)", name: "balanceOf" },
    "0x18160ddd": { sig: "totalSupply()", name: "totalSupply" },
    "0x42842e0e": {
        sig: "safeTransferFrom(address,address,uint256)",
        name: "ERC-721 Transfer",
    },
    "0xb88d4fde": {
        sig: "safeTransferFrom(address,address,uint256,bytes)",
        name: "ERC-721 Transfer (data)",
    },
    "0xf242432a": {
        sig: "safeTransferFrom(address,address,uint256,uint256,bytes)",
        name: "ERC-1155 Transfer",
    },
    "0x2eb2c2d6": {
        sig: "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
        name: "ERC-1155 Batch Transfer",
    },
    "0xa22cb465": {
        sig: "setApprovalForAll(address,bool)",
        name: "Set Approval For All",
    },
    "0x7ff36ab5": {
        sig: "swapExactETHForTokens(uint256,address[],address,uint256)",
        name: "Uniswap Swap ETH→Token",
    },
    "0x38ed1739": {
        sig: "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
        name: "Uniswap Swap Token→Token",
    },
    "0x18cbafe5": {
        sig: "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
        name: "Uniswap Swap Token→ETH",
    },
    "0x414bf389": {
        sig: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
        name: "Uniswap V3 Swap",
    },
    "0xac9650d8": { sig: "multicall(bytes[])", name: "Multicall" },
    "0x3593564c": {
        sig: "execute(bytes,bytes[],uint256)",
        name: "Uniswap Universal Router",
    },
};

// ─── Known contract names ─────────────────────────────────────────────────────
const KNOWN_CONTRACTS: Record<string, string> = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USD Coin (USDC)",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "Tether USD (USDT)",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "Dai Stablecoin (DAI)",
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "Wrapped Bitcoin (WBTC)",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "Wrapped Ether (WETH)",
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
    "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap Universal Router",
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
};

// ─── ABI fragments for decoding ───────────────────────────────────────────────
const ABI_FRAGMENTS: Record<string, string[]> = {
    "0xa9059cbb": ["function transfer(address to, uint256 amount)"],
    "0x23b872dd": [
        "function transferFrom(address from, address to, uint256 amount)",
    ],
    "0x095ea7b3": ["function approve(address spender, uint256 amount)"],
    "0x42842e0e": [
        "function safeTransferFrom(address from, address to, uint256 tokenId)",
    ],
    "0xf242432a": [
        "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
    ],
    "0xa22cb465": [
        "function setApprovalForAll(address operator, bool approved)",
    ],
    "0x7ff36ab5": [
        "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)",
    ],
    "0x38ed1739": [
        "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
    ],
    "0x18cbafe5": [
        "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
    ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseTxInput(tx: RawTxInput | string): ethers.TransactionLike {
    if (typeof tx === "string") {
        const parsed = ethers.Transaction.from(tx);
        return parsed;
    }
    return {
        to: tx.to,
        from: tx.from,
        data: tx.data || "0x",
        value: tx.value ? BigInt(tx.value) : BigInt(0),
        gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : BigInt(200000),
        nonce: tx.nonce ?? 0,
        chainId: tx.chainId ?? 1,
    };
}

function classifyTx(selector: string, to: string | null): TxType {
    if (!to) return "Contract Deployment";
    if (!selector || selector === "0x") return "ETH Transfer";
    const known = KNOWN_SELECTORS[selector];
    if (!known) return "Generic Contract Call";
    if (known.name.includes("ERC-20 Transfer") || known.name === "ERC-20 TransferFrom") return "ERC-20 Transfer";
    if (known.name === "ERC-20 Approve") return "ERC-20 Approve";
    if (known.name.includes("ERC-721")) return "ERC-721 Transfer";
    if (known.name.includes("ERC-1155")) return "ERC-1155 Transfer";
    if (known.name.toLowerCase().includes("swap") || known.name.includes("Uniswap")) return "Uniswap Swap";
    return "Generic Contract Call";
}

async function lookupSelector(selector: string): Promise<{ sig: string; name: string } | null> {
    if (KNOWN_SELECTORS[selector]) return KNOWN_SELECTORS[selector];
    try {
        const res = await axios.get(
            `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`,
            { timeout: 3000 }
        );
        const results = res.data?.results;
        if (results?.length > 0) {
            const sig = results[0].text_signature as string;
            const name = sig.split("(")[0];
            return { sig, name };
        }
    } catch {
        // ignore network errors, fallback gracefully
    }
    return null;
}

function decodeParams(selector: string, data: string): DecodedParam[] {
    const abiFragments = ABI_FRAGMENTS[selector];
    if (!abiFragments) return [];
    try {
        const iface = new ethers.Interface(abiFragments);
        const decoded = iface.parseTransaction({ data });
        if (!decoded) return [];
        const params: DecodedParam[] = [];
        decoded.fragment.inputs.forEach((input, i) => {
            let value = decoded.args[i];
            // Format BigInt values
            if (typeof value === "bigint") {
                // Check for MAX_UINT256
                if (value === ethers.MaxUint256) {
                    value = "MAX_UINT256 (unlimited)";
                } else {
                    value = value.toString();
                }
            } else if (Array.isArray(value)) {
                value = value.join(", ");
            } else {
                value = String(value);
            }
            params.push({ name: input.name, type: input.type, value });
        });
        return params;
    } catch {
        return [];
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function decodeTx(
    tx: RawTxInput | string
): Promise<DecodedTransaction> {
    const parsed = parseTxInput(tx);
    const data = (parsed.data as string) || "0x";
    const to = (parsed.to as string) || null;
    const value = parsed.value ? BigInt(parsed.value as bigint) : BigInt(0);
    const gasLimit = parsed.gasLimit
        ? BigInt(parsed.gasLimit as bigint)
        : BigInt(200000);

    const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : "";

    // Look up selector
    const selectorInfo = selector ? await lookupSelector(selector) : null;
    const functionSignature = selectorInfo?.sig;
    const functionName = selectorInfo?.name;

    // Classify
    const type = classifyTx(selector, to);

    // Decode params
    const params = selector ? decodeParams(selector, data) : [];

    // Contract name
    const toNorm = to?.toLowerCase() || "";
    const contractName = KNOWN_CONTRACTS[toNorm];

    // TX type (EIP)
    let txTypeEIP: "Legacy" | "EIP-2930" | "EIP-1559" = "Legacy";
    if (typeof tx === "string") {
        const rawTx = ethers.Transaction.from(tx);
        if (rawTx.type === 2) txTypeEIP = "EIP-1559";
        else if (rawTx.type === 1) txTypeEIP = "EIP-2930";
    }

    return {
        type,
        from: (parsed.from as string) || "unknown",
        to: to || "null (contract deployment)",
        contractName,
        functionSignature,
        functionName,
        params,
        valueEth: ethers.formatEther(value),
        gasLimit: gasLimit.toString(),
        nonce: parsed.nonce as number | undefined,
        txTypeEIP,
        rawData: data,
    };
}
