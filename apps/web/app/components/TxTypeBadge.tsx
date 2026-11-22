export function TxTypeBadge({ type }: { type: string }) {
    const map: Record<string, string> = {
        "ERC-20 Approve": "badge-red",
        "ERC-20 Transfer": "badge-blue",
        "ETH Transfer": "badge-purple",
        "Uniswap Swap": "badge-indigo",
        "ERC-721 Transfer": "badge-cyan",
        "ERC-721 Approval": "badge-cyan",
        "ERC-1155 Transfer": "badge-cyan",
        "Multicall": "badge-indigo",
        "Permit": "badge-amber",
        "Contract Deployment": "badge-amber",
    };
    return <span className={`badge ${map[type] || "badge-blue"}`}>{type}</span>;
}
