export interface Chain {
    id: number;
    name: string;
    rpc: string;
    color: string;
    symbol: string;
}

export const CHAINS: Chain[] = [
    { id: 1, name: "Ethereum Mainnet", rpc: "https://ethereum-rpc.publicnode.com", color: "#627eea", symbol: "ETH" },
    { id: 137, name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", color: "#8247e5", symbol: "MATIC" },
    { id: 42161, name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", color: "#12aaff", symbol: "ARB" },
    { id: 8453, name: "Base", rpc: "https://mainnet.base.org", color: "#0052ff", symbol: "BASE" },
    { id: 10, name: "Optimism", rpc: "https://mainnet.optimism.io", color: "#ff0420", symbol: "OP" },
    { id: 56, name: "BNB Chain", rpc: "https://bsc-dataseed.binance.org", color: "#f0b90b", symbol: "BNB" },
];
