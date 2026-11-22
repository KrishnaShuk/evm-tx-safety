export function SeverityBadge({ s }: { s: string }) {
    if (s === "HIGH") return <span className="badge badge-red">{s}</span>;
    if (s === "MEDIUM") return <span className="badge badge-amber">{s}</span>;
    return <span className="badge badge-yellow">{s}</span>;
}
