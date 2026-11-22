export function GasBar({ used, limit }: { used: number; limit: number }) {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const grad = pct > 85
        ? "linear-gradient(90deg, #ef4444, #f87171)"
        : pct > 60
            ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
            : "linear-gradient(90deg, #10b981, #34d399)";
    const chipColor = pct > 85 ? "var(--red-2)" : pct > 60 ? "var(--amber-2)" : "var(--green-2)";

    return (
        <div>
            <div className="gas-meta">
                <span className="text-secondary" style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>
                    {used.toLocaleString()} / {limit.toLocaleString()} gas
                </span>
                <span className="gas-pct-chip" style={{ color: chipColor, background: `${chipColor}18`, border: `1px solid ${chipColor}44` }}>
                    {pct}%
                </span>
            </div>
            <div className="gas-bar-wrap">
                <div className="gas-bar-fill" style={{ width: `${pct}%`, background: grad }} />
            </div>
        </div>
    );
}
