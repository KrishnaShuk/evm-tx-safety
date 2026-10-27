export interface TokenInfo {
    address: string;
    symbol: string;
    decimals: number;
    name?: string;
    kind?: "erc20" | "erc721" | "erc1155";
}

export interface ChainConfig {
    id: number;
    name: string;
    shortName: string;
    nativeSymbol: string;
    nativeDecimals: number;
    rpc: string;
    explorer?: string;
    knownContracts: Record<string, TokenInfo>;
    /** Address -> human-readable protocol name. */
    safeSpenders: Record<string, string>;
    /** Address -> human-readable marketplace/operator name. */
    safeOperators: Record<string, string>;
}

const token = (
    address: string,
    symbol: string,
    decimals: number,
    name?: string,
    kind: TokenInfo["kind"] = "erc20"
): TokenInfo => ({ address: address.toLowerCase(), symbol, decimals, name, kind });

const SAFE_OPERATORS_COMMON: Record<string, string> = {
    "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": "OpenSea Seaport 1.5",
    "0x0000000000000068f116a894984e2db1123eb395": "OpenSea Seaport 1.6",
    "0x1e0049783f008a0085193e00003d00cd54003c71": "OpenSea Conduit",
};

const UNIVERSAL_ROUTER = "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad";
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const CHAINS: Record<number, ChainConfig> = {
    1: {
        id: 1,
        name: "Ethereum Mainnet",
        shortName: "ethereum",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        rpc: "https://eth.llamarpc.com",
        explorer: "https://etherscan.io",
        knownContracts: {
            [token("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC", 6, "USD Coin").address]: token("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC", 6, "USD Coin"),
            [token("0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", 6, "Tether USD").address]: token("0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", 6, "Tether USD"),
            [token("0x6B175474E89094C44Da98b954EedeAC495271d0F", "DAI", 18, "Dai Stablecoin").address]: token("0x6B175474E89094C44Da98b954EedeAC495271d0F", "DAI", 18, "Dai Stablecoin"),
            [token("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", 8, "Wrapped BTC").address]: token("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", 8, "Wrapped BTC"),
            [token("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", 18, "Wrapped Ether").address]: token("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", 18, "Wrapped Ether"),
            "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": token("0x7a250d5630b4cf539739df2c5dacb4c659f2488d", "UNI-V2", 18, "Uniswap V2 Router"),
            "0xe592427a0aece92de3edee1f18e0157c05861564": token("0xe592427a0aece92de3edee1f18e0157c05861564", "UNI-V3", 18, "Uniswap V3 SwapRouter"),
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": token("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "UNI-V3", 18, "Uniswap V3 SwapRouter02"),
            "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": token("0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b", "UNI-UR", 18, "Uniswap Universal Router"),
            [UNIVERSAL_ROUTER]: token(UNIVERSAL_ROUTER, "UNI-UR", 18, "Uniswap Universal Router"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
        },
        safeSpenders: {
            "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
            "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 SwapRouter",
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 SwapRouter02",
            "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap Universal Router",
            [UNIVERSAL_ROUTER]: "Uniswap Universal Router",
            [PERMIT2]: "Permit2",
            "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
            "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5",
            "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": "Aave V3 Pool",
            "0xba12222222228d8ba445958a75a0704d566bf2c8": "Balancer Vault",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
    8453: {
        id: 8453,
        name: "Base",
        shortName: "base",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        rpc: "https://mainnet.base.org",
        explorer: "https://basescan.org",
        knownContracts: {
            [token("0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether").address]: token("0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"),
            [token("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6, "USD Coin").address]: token("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6, "USD Coin"),
            [token("0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", "DAI", 18, "Dai Stablecoin").address]: token("0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", "DAI", 18, "Dai Stablecoin"),
            [token("0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6, "Bridged USD Coin").address]: token("0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6, "Bridged USD Coin"),
            [UNIVERSAL_ROUTER]: token(UNIVERSAL_ROUTER, "UNI-UR", 18, "Uniswap Universal Router"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
            "0x2626664c2603336e57b271c5c0b26f421741e481": token("0x2626664c2603336e57b271c5c0b26f421741e481", "UNI-V3", 18, "Uniswap V3 SwapRouter02"),
            "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": token("0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43", "AERO", 18, "Aerodrome Router"),
        },
        safeSpenders: {
            [UNIVERSAL_ROUTER]: "Uniswap Universal Router",
            [PERMIT2]: "Permit2",
            "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap V3 SwapRouter02",
            "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": "Aerodrome Router",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
    42161: {
        id: 42161,
        name: "Arbitrum One",
        shortName: "arbitrum",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        rpc: "https://arb1.arbitrum.io/rpc",
        explorer: "https://arbiscan.io",
        knownContracts: {
            [token("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18, "Wrapped Ether").address]: token("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18, "Wrapped Ether"),
            [token("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6, "USD Coin").address]: token("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6, "USD Coin"),
            [token("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT", 6, "Tether USD").address]: token("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT", 6, "Tether USD"),
            [token("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18, "Dai Stablecoin").address]: token("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18, "Dai Stablecoin"),
            "0x5e325eda8064b456f4781070c0738d849c824258": token("0x5e325eda8064b456f4781070c0738d849c824258", "UNI-UR", 18, "Uniswap Universal Router"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": token("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "UNI-V3", 18, "Uniswap V3 SwapRouter02"),
            "0xe592427a0aece92de3edee1f18e0157c05861564": token("0xe592427a0aece92de3edee1f18e0157c05861564", "UNI-V3", 18, "Uniswap V3 SwapRouter"),
        },
        safeSpenders: {
            "0x5e325eda8064b456f4781070c0738d849c824258": "Uniswap Universal Router",
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 SwapRouter02",
            "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 SwapRouter",
            [PERMIT2]: "Permit2",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
    10: {
        id: 10,
        name: "Optimism",
        shortName: "optimism",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        rpc: "https://mainnet.optimism.io",
        explorer: "https://optimistic.etherscan.io",
        knownContracts: {
            [token("0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether").address]: token("0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"),
            [token("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", 6, "USD Coin").address]: token("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", 6, "USD Coin"),
            [token("0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "USDT", 6, "Tether USD").address]: token("0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "USDT", 6, "Tether USD"),
            [token("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18, "Dai Stablecoin").address]: token("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18, "Dai Stablecoin"),
            [UNIVERSAL_ROUTER]: token(UNIVERSAL_ROUTER, "UNI-UR", 18, "Uniswap Universal Router"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": token("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "UNI-V3", 18, "Uniswap V3 SwapRouter02"),
            "0xe592427a0aece92de3edee1f18e0157c05861564": token("0xe592427a0aece92de3edee1f18e0157c05861564", "UNI-V3", 18, "Uniswap V3 SwapRouter"),
        },
        safeSpenders: {
            [UNIVERSAL_ROUTER]: "Uniswap Universal Router",
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 SwapRouter02",
            "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 SwapRouter",
            [PERMIT2]: "Permit2",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
    137: {
        id: 137,
        name: "Polygon",
        shortName: "polygon",
        nativeSymbol: "MATIC",
        nativeDecimals: 18,
        rpc: "https://polygon.llamarpc.com",
        explorer: "https://polygonscan.com",
        knownContracts: {
            [token("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "WMATIC", 18, "Wrapped Matic").address]: token("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "WMATIC", 18, "Wrapped Matic"),
            [token("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC", 6, "USD Coin").address]: token("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC", 6, "USD Coin"),
            [token("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "USDC.e", 6, "Bridged USD Coin").address]: token("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "USDC.e", 6, "Bridged USD Coin"),
            [token("0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6, "Tether USD").address]: token("0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6, "Tether USD"),
            [token("0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", "WETH", 18, "Wrapped Ether").address]: token("0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", "WETH", 18, "Wrapped Ether"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": token("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "UNI-V3", 18, "Uniswap V3 SwapRouter02"),
            "0xe592427a0aece92de3edee1f18e0157c05861564": token("0xe592427a0aece92de3edee1f18e0157c05861564", "UNI-V3", 18, "Uniswap V3 SwapRouter"),
        },
        safeSpenders: {
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 SwapRouter02",
            "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 SwapRouter",
            [PERMIT2]: "Permit2",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
    56: {
        id: 56,
        name: "BNB Chain",
        shortName: "bsc",
        nativeSymbol: "BNB",
        nativeDecimals: 18,
        rpc: "https://bsc-dataseed.binance.org",
        explorer: "https://bscscan.com",
        knownContracts: {
            [token("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "WBNB", 18, "Wrapped BNB").address]: token("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "WBNB", 18, "Wrapped BNB"),
            [token("0x55d398326f99059fF775485246999027B3197955", "USDT", 18, "Tether USD").address]: token("0x55d398326f99059fF775485246999027B3197955", "USDT", 18, "Tether USD"),
            [token("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18, "USD Coin").address]: token("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18, "USD Coin"),
            [token("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", "BUSD", 18, "Binance USD").address]: token("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", "BUSD", 18, "Binance USD"),
            "0x10ed43c718714eb63d5aa57b78b54704e256024e": token("0x10ed43c718714eb63d5aa57b78b54704e256024e", "CAKE", 18, "PancakeSwap V2 Router"),
            "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": token("0x13f4ea83d0bd40e75c8222255bc855a974568dd4", "CAKE", 18, "PancakeSwap SmartRouter"),
            [PERMIT2]: token(PERMIT2, "PERMIT2", 18, "Permit2"),
            [MULTICALL3]: token(MULTICALL3, "MULTICALL3", 18, "Multicall3"),
        },
        safeSpenders: {
            "0x10ed43c718714eb63d5aa57b78b54704e256024e": "PancakeSwap V2 Router",
            "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": "PancakeSwap SmartRouter",
            [PERMIT2]: "Permit2",
        },
        safeOperators: SAFE_OPERATORS_COMMON,
    },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChain(chainId: number | undefined): ChainConfig {
    const id = chainId ?? 1;
    const chain = CHAINS[id];
    if (!chain) {
        throw new Error(`Unsupported chain ID ${id}. Supported: ${SUPPORTED_CHAIN_IDS.join(", ")}`);
    }
    return chain;
}

export function getChainOrNull(chainId: number | undefined): ChainConfig | null {
    if (chainId === undefined) return null;
    return CHAINS[chainId] ?? null;
}

export function listChains(): ChainConfig[] {
    return Object.values(CHAINS);
}

export function getKnownToken(chainId: number, address: string | undefined): TokenInfo | undefined {
    if (!address) return undefined;
    const chain = getChainOrNull(chainId);
    return chain?.knownContracts[address.toLowerCase()];
}

export function getSafeSpender(chainId: number, address: string | undefined): string | undefined {
    if (!address) return undefined;
    return getChainOrNull(chainId)?.safeSpenders[address.toLowerCase()];
}

export function getSafeOperator(chainId: number, address: string | undefined): string | undefined {
    if (!address) return undefined;
    return getChainOrNull(chainId)?.safeOperators[address.toLowerCase()];
}
