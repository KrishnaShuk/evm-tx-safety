export function shortAddr(address: string): string {
    if (!address || address.length < 12) return address || "unknown";
    return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export function truncateMiddle(value: string, head = 10, tail = 8): string {
    if (!value) return "";
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatNumber(value: number | string): string {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString();
}
