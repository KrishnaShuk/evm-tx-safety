export function ScoreBadge({ score }: { score: string }) {
    if (score === "SAFE") return <span className="badge badge-green">✓ Safe</span>;
    if (score === "WARNINGS") return <span className="badge badge-amber">⚠ Warnings</span>;
    return <span className="badge badge-red">✕ Dangerous</span>;
}
