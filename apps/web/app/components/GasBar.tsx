import type { AnalysisResult } from "@evm-safety/core";

export function GasBar({
    used,
    limit,
    status,
}: {
    used: number;
    limit: number;
    status?: AnalysisResult["simulation"]["status"];
}) {
    const ratio = limit > 0 ? used / limit : 0;
    const pct = Math.round(ratio * 100);
    const over = limit > 0 && used > limit;
    const failed = status === "revert";
    const near = ratio >= 0.85;

    const tone = over || failed ? "is-neg" : near ? "is-warn" : "is-info";
    const filled = ratio <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(ratio * 10)));

    return (
        <div>
            <div className="gas-meta">
                <span className="text-secondary">
                    {used.toLocaleString()} / {limit.toLocaleString()} gas
                </span>
                <span className="gas-pct-chip">{pct}%</span>
            </div>
            <div
                className={`meter ${tone}`}
                role="img"
                aria-label={`Gas used ${used} of ${limit}, ${pct} percent`}
            >
                {Array.from({ length: 10 }).map((_, i) => (
                    <span
                        key={i}
                        className={`meter-seg ${i < filled ? "on" : ""}`}
                        aria-hidden="true"
                    />
                ))}
            </div>
        </div>
    );
}
