export function ConfidenceBadge({ confidence }: { confidence: string }) {
    const map: Record<string, string> = {
        verified: "badge-green",
        curated: "badge-blue",
        registry: "badge-amber",
        unverified: "badge-red",
    };
    return <span className={`badge ${map[confidence] || "badge-blue"}`}>{confidence}</span>;
}
