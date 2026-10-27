import { AnalysisError } from "../errors";
import { getChain, listChains } from "./chains";

const DEFAULT_RPC_HOSTS = new Set(
    listChains().map((chain) => new URL(chain.rpc).hostname.toLowerCase())
);

function envList(name: string): string[] {
    return (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

function isPrivateIpv4(host: string): boolean {
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function isPrivateIp(host: string): boolean {
    const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return isPrivateIpv4(normalized);
    return false;
}

function blockedHostname(host: string): boolean {
    return (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host === "metadata.google.internal" ||
        host === "metadata" ||
        isPrivateIp(host)
    );
}

function customRpcAllowed(): boolean {
    return process.env.ALLOW_CUSTOM_RPC === "true";
}

/**
 * Validate a client-supplied RPC URL before it is used server-side.
 *
 * Default policy: only HTTPS hosts from the built-in chain registry (plus
 * ALLOWED_RPC_HOSTS) are accepted. Self-hosted deployments can opt into custom
 * public RPCs with ALLOW_CUSTOM_RPC=true; private/link-local targets stay
 * blocked either way.
 */
export async function assertSafeRpcUrl(
    rpcUrl: string,
    chainId?: number,
    options: { allowAnyPublicHost?: boolean } = {}
): Promise<string> {
    let url: URL;
    try {
        url = new URL(rpcUrl);
    } catch {
        throw new AnalysisError("INVALID_INPUT", "RPC URL is not a valid URL.");
    }

    if (url.protocol !== "https:" && !(url.protocol === "http:" && process.env.ALLOW_HTTP_RPC === "true")) {
        throw new AnalysisError("RPC_NOT_ALLOWED", "RPC URL must use HTTPS.");
    }

    const host = url.hostname.toLowerCase();
    if (blockedHostname(host)) {
        throw new AnalysisError("RPC_NOT_ALLOWED", "RPC URL points to a private or link-local host.");
    }

    const allowedHosts = new Set([...DEFAULT_RPC_HOSTS, ...envList("ALLOWED_RPC_HOSTS")]);
    const allowAny = options.allowAnyPublicHost ?? customRpcAllowed();
    if (!allowedHosts.has(host) && !allowAny) {
        throw new AnalysisError(
            "RPC_NOT_ALLOWED",
            `RPC host ${host} is not allowlisted. Set ALLOWED_RPC_HOSTS or ALLOW_CUSTOM_RPC=true on the server.`
        );
    }

    if (allowAny && !allowedHosts.has(host)) {
        // Resolve custom hosts and reject any private answer to reduce DNS rebinding.
        try {
            const dns = await import("node:dns/promises");
            const answers = await dns.lookup(host, { all: true });
            if (answers.length === 0 || answers.some((answer) => isPrivateIp(answer.address))) {
                throw new AnalysisError("RPC_NOT_ALLOWED", "RPC host resolves to a private address.");
            }
        } catch (err) {
            if (err instanceof AnalysisError) throw err;
            throw new AnalysisError("RPC_NOT_ALLOWED", `Unable to resolve RPC host ${host}.`);
        }
    }

    if (chainId !== undefined) {
        const chain = getChain(chainId);
        if (!chain) {
            throw new AnalysisError("INVALID_INPUT", `Unsupported chain ID ${chainId}.`);
        }
    }

    return url.toString();
}

export function defaultRpcForChain(chainId: number): string {
    return getChain(chainId).rpc;
}

export function isDefaultRpc(rpcUrl: string): boolean {
    try {
        return DEFAULT_RPC_HOSTS.has(new URL(rpcUrl).hostname.toLowerCase());
    } catch {
        return false;
    }
}
