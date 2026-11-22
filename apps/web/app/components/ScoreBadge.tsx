export function ScoreBadge({ score }: { score: string }) {
    if (score === "SAFE") return <span className="badge badge-green">SAFE</span>;
    if (score === "WARNINGS") return <span className="badge badge-amber">WARNINGS</span>;
    return <span className="badge badge-red">DANGEROUS</span>;
}
