import { getChain, getSafeOperator, getSafeSpender } from "../config/chains";
import type {
    DecodedCall,
    DecodedParam,
    DecodedTransaction,
    SafetyReport,
    SafetyWarning,
    Severity,
    SimulationResult,
} from "../types";
import { shortAddress } from "../decoder/summary";

const MAX_UINT256_DECIMAL =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const MAX_UINT160_DECIMAL = "1461501637330902918203684832716283019655932542975";
const GWEI = BigInt(1_000_000_000);
const NATIVE_HIGH_VALUE = BigInt("1000000000000000000"); // 1 native unit
const NATIVE_VERY_HIGH_VALUE = BigInt("10000000000000000000"); // 10 native units

export interface SafetyOptions {
    chainId?: number;
}

interface CheckContext {
    decoded: DecodedTransaction;
    simulation: SimulationResult;
    chainId: number;
    chain: ReturnType<typeof getChain>;
    gasPriceWei: bigint;
}

interface Rule {
    id: string;
    evaluate: (ctx: CheckContext) => SafetyWarning[];
}

function warning(
    rule: string,
    severity: Severity,
    message: string,
    recommendation: string,
    confidence: SafetyWarning["confidence"],
    evidence?: Record<string, unknown>
): SafetyWarning {
    return { rule, severity, message, recommendation, confidence, evidence };
}

function params(call: DecodedCall): DecodedParam[] {
    return call.params ?? [];
}

function findParam(call: DecodedCall, ...names: string[]): DecodedParam | undefined {
    for (const name of names) {
        const hit = params(call).find(
            (item) => item.name === name || item.name.endsWith(`.${name}`)
        );
        if (hit) return hit;
    }
    return undefined;
}

function isUnlimited(value: string | undefined): boolean {
    if (!value) return false;
    return (
        value.includes("MAX_UINT256") ||
        value.split(",").includes(MAX_UINT256_DECIMAL) ||
        value.split(",").includes(MAX_UINT160_DECIMAL)
    );
}

function entity(ctx: CheckContext, address: string | undefined) {
    if (!address) return undefined;
    return ctx.decoded.entities[address.toLowerCase()];
}

function walkCalls(calls: DecodedCall[]): DecodedCall[] {
    const result: DecodedCall[] = [];
    const visit = (call: DecodedCall) => {
        result.push(call);
        for (const child of call.children ?? []) visit(child);
    };
    for (const call of calls) visit(call);
    return result;
}

function approvalCalls(decoded: DecodedTransaction): DecodedCall[] {
    return walkCalls(decoded.calls).filter(
        (call) => call.type === "ERC-20 Approve" || call.type === "Permit"
    );
}

// ── Approval rules ───────────────────────────────────────────────────────────
const unlimitedApprovalRule: Rule = {
    id: "UNLIMITED_APPROVAL",
    evaluate(ctx) {
        const warnings: SafetyWarning[] = [];
        for (const call of approvalCalls(ctx.decoded)) {
            const amount = findParam(call, "amount", "value", "_value", "details.amount");
            if (!isUnlimited(amount?.value)) continue;
            const spender = findParam(call, "spender", "_spender", "permitSingle.spender");
            const safeName = getSafeSpender(ctx.chainId, spender?.value);
            warnings.push(
                warning(
                    "UNLIMITED_APPROVAL",
                    safeName ? "MEDIUM" : "HIGH",
                    `Unlimited token approval granted to ${shortAddress(spender?.value ?? "unknown")}${safeName ? ` (${safeName})` : ""}.`,
                    safeName
                        ? "Unlimited approvals to audited routers are common, but they remain risky if the protocol is compromised. Prefer exact amounts where possible."
                        : "Approve only the exact amount you need. Unlimited approvals are a common attack vector.",
                    "high",
                    { spender: spender?.value, amount: amount?.value, knownAs: safeName ?? null }
                )
            );
        }
        return warnings;
    },
};

const unverifiedSpenderRule: Rule = {
    id: "UNVERIFIED_SPENDER",
    evaluate(ctx) {
        const warnings: SafetyWarning[] = [];
        for (const call of approvalCalls(ctx.decoded)) {
            const spender = findParam(call, "spender", "_spender", "permitSingle.spender");
            if (!spender) continue;
            if (getSafeSpender(ctx.chainId, spender.value)) continue;
            const owner = entity(ctx, spender.value);
            if (owner?.isContract === false) continue; // handled by APPROVAL_TO_EOA
            warnings.push(
                warning(
                    "UNVERIFIED_SPENDER",
                    "MEDIUM",
                    `The spender ${shortAddress(spender.value)} is not in the known-protocol allowlist.`,
                    "Verify the spender contract before granting a token approval.",
                    "medium",
                    { spender: spender.value, isContract: owner?.isContract ?? null }
                )
            );
        }
        return warnings;
    },
};

const approvalToEoaRule: Rule = {
    id: "APPROVAL_TO_EOA",
    evaluate(ctx) {
        const warnings: SafetyWarning[] = [];
        const seen = new Set<string>();
        for (const call of approvalCalls(ctx.decoded)) {
            const spender = findParam(call, "spender", "_spender", "permitSingle.spender");
            if (!spender || seen.has(spender.value.toLowerCase())) continue;
            const owner = entity(ctx, spender.value);
            if (owner?.isContract !== false) continue;
            seen.add(spender.value.toLowerCase());
            warnings.push(
                warning(
                    "APPROVAL_TO_EOA",
                    "HIGH",
                    `The approval target ${shortAddress(spender.value)} is an externally owned account, not a contract.`,
                    "Token approvals to EOAs can be used to drain your balance. Revoke this approval unless you control that wallet.",
                    "high",
                    { spender: spender.value }
                )
            );
        }
        return warnings;
    },
};

const setApprovalForAllRule: Rule = {
    id: "SET_APPROVAL_FOR_ALL",
    evaluate(ctx) {
        const warnings: SafetyWarning[] = [];
        for (const call of walkCalls(ctx.decoded.calls)) {
            if (call.functionName !== "setApprovalForAll" && call.type !== "ERC-721 Approval") continue;
            const approved = findParam(call, "approved");
            if (approved?.value === "false") continue;
            const operator = findParam(call, "operator", "to");
            if (!operator) continue;
            if (getSafeOperator(ctx.chainId, operator.value)) continue;
            warnings.push(
                warning(
                    "SET_APPROVAL_FOR_ALL",
                    "HIGH",
                    `This transaction gives ${shortAddress(operator.value)} full control over all NFTs in ${ctx.decoded.entities[call.target.toLowerCase()]?.name ?? ctx.decoded.contractName ?? shortAddress(call.target)}.`,
                    "Only use setApprovalForAll with marketplaces you trust. Revoke it when you are done.",
                    "high",
                    { operator: operator.value, approved: true, collection: call.target }
                )
            );
        }
        return warnings;
    },
};

const hiddenApprovalRule: Rule = {
    id: "HIDDEN_APPROVAL",
    evaluate(ctx) {
        if (ctx.simulation.approvals.length === 0) return [];
        const topLevelApproval = ["ERC-20 Approve", "Permit", "ERC-721 Approval"].includes(
            ctx.decoded.type
        );
        if (topLevelApproval) return [];
        return ctx.simulation.approvals
            .filter((approval) => !getSafeSpender(ctx.chainId, approval.spender))
            .map((approval) =>
                warning(
                    "HIDDEN_APPROVAL",
                    "HIGH",
                    `Execution grants ${shortAddress(approval.spender)} approval over ${approval.token} even though the transaction is not an approval call.`,
                    "Hidden approvals inside swaps or multicalls are a common drainer pattern. Reject unless you explicitly intended this.",
                    "high",
                    {
                        owner: approval.owner,
                        spender: approval.spender,
                        token: approval.token,
                        tokenAddress: approval.tokenAddress,
                        amount: approval.amount,
                    }
                )
            );
    },
};

// ── Transfer / movement rules ────────────────────────────────────────────────
function transferRecipient(decoded: DecodedTransaction): string | undefined {
    if (decoded.type === "ETH Transfer") return decoded.to;
    const call = decoded.calls[0];
    return findParam(call, "to", "recipient", "dst")?.value;
}

const transferToUnknownContractRule: Rule = {
    id: "TRANSFER_TO_UNKNOWN_CONTRACT",
    evaluate(ctx) {
        if (
            ![
                "ETH Transfer",
                "ERC-20 Transfer",
                "ERC-721 Transfer",
                "ERC-1155 Transfer",
            ].includes(ctx.decoded.type)
        ) {
            return [];
        }
        const recipient = transferRecipient(ctx.decoded);
        if (!recipient) return [];
        const info = entity(ctx, recipient);
        if (!info || info.isContract !== true || info.known) return [];
        return [
            warning(
                "TRANSFER_TO_UNKNOWN_CONTRACT",
                "MEDIUM",
                `Assets are sent to ${shortAddress(recipient)}, a contract that is not in the known-contract registry.`,
                "Confirm the recipient contract is intended and can receive these assets. Transfers to the wrong contract are usually unrecoverable.",
                "medium",
                { recipient, valueWei: ctx.decoded.valueWei }
            ),
        ];
    },
};

const hiddenTransferRule: Rule = {
    id: "UNEXPECTED_TRANSFER",
    evaluate(ctx) {
        if (!["Generic Contract Call", "Multicall"].includes(ctx.decoded.type)) return [];
        const sender = ctx.decoded.from.toLowerCase();
        const warnings: SafetyWarning[] = [];
        for (const event of ctx.simulation.events) {
            if (event.name !== "Transfer") continue;
            const from = (event.params.from ?? "").toLowerCase();
            const to = event.params.to ?? "";
            if (from !== sender || !to) continue;
            const info = entity(ctx, to);
            if (!info || info.isContract !== true || info.known) continue;
            warnings.push(
                warning(
                    "UNEXPECTED_TRANSFER",
                    "MEDIUM",
                    `Execution transfers ${event.params.token ?? "tokens"} from your account to the unverified contract ${shortAddress(to)}.`,
                    "Inspect the decoded calls and simulation before signing. Unexpected outflows are a drainer pattern.",
                    "medium",
                    { from: event.params.from, to, token: event.params.token }
                )
            );
        }
        return warnings;
    },
};

const highValueTransferRule: Rule = {
    id: "HIGH_VALUE_TRANSFER",
    evaluate(ctx) {
        let value: bigint;
        try {
            value = BigInt(ctx.decoded.valueWei);
        } catch {
            return [];
        }
        if (value < NATIVE_HIGH_VALUE) return [];
        const veryHigh = value >= NATIVE_VERY_HIGH_VALUE;
        return [
            warning(
                "HIGH_VALUE_TRANSFER",
                veryHigh ? "HIGH" : "MEDIUM",
                `This transaction sends ${ctx.decoded.valueEth} ${ctx.chain.nativeSymbol} — a significant amount.`,
                "Double-check the recipient address and the decoded intent before sending.",
                "high",
                { valueWei: ctx.decoded.valueWei, valueEth: ctx.decoded.valueEth }
            ),
        ];
    },
};

const zeroAddressRule: Rule = {
    id: "ZERO_ADDRESS_TARGET",
    evaluate(ctx) {
        const zero = "0x0000000000000000000000000000000000000000";
        const targets: string[] = [];
        if (ctx.decoded.to.toLowerCase() === zero) targets.push("to");
        for (const call of walkCalls(ctx.decoded.calls)) {
            for (const param of call.params) {
                if (!param.type.includes("address")) continue;
                if (["spender", "operator", "owner"].some((name) => param.name.endsWith(name))) continue;
                if (param.value.toLowerCase().split(",").map((item) => item.trim()).includes(zero)) {
                    targets.push(param.name);
                }
            }
        }
        if (targets.length === 0) return [];
        return [
            warning(
                "ZERO_ADDRESS_TARGET",
                "HIGH",
                `The transaction targets or references the zero address (${targets.join(", ")}).`,
                "The zero address is a burn address. Assets sent there are unrecoverable.",
                "high",
                { fields: targets }
            ),
        ];
    },
};

// ── Execution / gas rules ────────────────────────────────────────────────────
const txWillRevertRule: Rule = {
    id: "TX_WILL_REVERT",
    evaluate(ctx) {
        if (ctx.simulation.status !== "revert") return [];
        return [
            warning(
                "TX_WILL_REVERT",
                "HIGH",
                `This transaction will revert: ${ctx.simulation.revertReason ?? "unknown reason"}.`,
                "Fix the transaction parameters before sending. A reverted transaction still costs gas.",
                "high",
                { revertReason: ctx.simulation.revertReason, backend: ctx.simulation.backend }
            ),
        ];
    },
};

const simulationUnavailableRule: Rule = {
    id: "SIMULATION_UNAVAILABLE",
    evaluate(ctx) {
        if (ctx.simulation.status !== "unavailable") return [];
        return [
            warning(
                "SIMULATION_UNAVAILABLE",
                "MEDIUM",
                `Execution could not be simulated: ${ctx.simulation.error?.message ?? "no backend available"}.`,
                "Treat this analysis as static-only. Retry with a working RPC or a Tenderly/Trace-capable backend.",
                "high",
                { code: ctx.simulation.error?.code ?? null, notes: ctx.simulation.notes }
            ),
        ];
    },
};

const gasLimitTooLowRule: Rule = {
    id: "GAS_LIMIT_TOO_LOW",
    evaluate(ctx) {
        if (ctx.simulation.status !== "success") return [];
        if (ctx.simulation.gasUsed <= 0 || ctx.simulation.gasLimit <= 0) return [];
        const ratio = ctx.simulation.gasLimit / ctx.simulation.gasUsed;
        if (ratio >= 1.1) return [];
        return [
            warning(
                "GAS_LIMIT_TOO_LOW",
                "LOW",
                `Gas limit (${ctx.simulation.gasLimit.toLocaleString()}) is less than 10% above simulated usage (${ctx.simulation.gasUsed.toLocaleString()}).`,
                "Increase the gas limit by at least 20% to avoid out-of-gas failures.",
                "medium",
                { gasLimit: ctx.simulation.gasLimit, gasUsed: ctx.simulation.gasUsed, ratio }
            ),
        ];
    },
};

const highGasPriceRule: Rule = {
    id: "HIGH_GAS_PRICE",
    evaluate(ctx) {
        const threshold = BigInt(200) * GWEI;
        if (ctx.gasPriceWei <= threshold) return [];
        return [
            warning(
                "HIGH_GAS_PRICE",
                "MEDIUM",
                `Gas price is ${(Number(ctx.gasPriceWei) / 1e9).toLocaleString()} gwei, above the 200 gwei caution threshold.`,
                "Wait for lower network fees or verify this is intentional before signing.",
                "medium",
                { gasPriceWei: ctx.gasPriceWei.toString() }
            ),
        ];
    },
};

const highGasLimitRule: Rule = {
    id: "HIGH_GAS_LIMIT",
    evaluate(ctx) {
        if (ctx.simulation.gasLimit < 2_000_000) return [];
        return [
            warning(
                "HIGH_GAS_LIMIT",
                "LOW",
                `Gas limit is ${ctx.simulation.gasLimit.toLocaleString()}, which is unusually high.`,
                "Confirm the transaction is not a griefing or gas-burning attempt.",
                "low",
                { gasLimit: ctx.simulation.gasLimit }
            ),
        ];
    },
};

const unverifiedSignatureRule: Rule = {
    id: "UNVERIFIED_FUNCTION",
    evaluate(ctx) {
        if (ctx.decoded.signatureConfidence !== "unverified") return [];
        if (!ctx.decoded.functionSignature) return [];
        return [
            warning(
                "UNVERIFIED_FUNCTION",
                "LOW",
                `The selector ${ctx.decoded.calls[0]?.selector ?? ""} could not be verified against a contract ABI. Displayed signature may be incorrect.`,
                "Verify the target contract's ABI on a block explorer before signing.",
                "low",
                {
                    selector: ctx.decoded.calls[0]?.selector,
                    candidates: ctx.decoded.signatureCandidates ?? [],
                }
            ),
        ];
    },
};

const RULES: Rule[] = [
    txWillRevertRule,
    simulationUnavailableRule,
    unlimitedApprovalRule,
    approvalToEoaRule,
    unverifiedSpenderRule,
    setApprovalForAllRule,
    hiddenApprovalRule,
    transferToUnknownContractRule,
    hiddenTransferRule,
    zeroAddressRule,
    highValueTransferRule,
    gasLimitTooLowRule,
    highGasPriceRule,
    highGasLimitRule,
    unverifiedSignatureRule,
];

const SEVERITY_RANK: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const SEVERITY_POINTS: Record<Severity, number> = { HIGH: 90, MEDIUM: 50, LOW: 15 };

export function runSafetyChecks(
    decoded: DecodedTransaction,
    simulation: SimulationResult,
    options: SafetyOptions = {}
): SafetyReport {
    const chainId = options.chainId ?? decoded.chainId;
    const chain = getChain(chainId);
    let gasPriceWei = BigInt(0);
    try {
        gasPriceWei = BigInt(simulation.gasPriceWei ?? decoded.gasPriceWei ?? "0");
    } catch {
        gasPriceWei = BigInt(0);
    }

    const ctx: CheckContext = { decoded, simulation, chainId, chain, gasPriceWei };
    const collected = RULES.flatMap((rule) => {
        try {
            return rule.evaluate(ctx);
        } catch {
            return [];
        }
    });

    const seen = new Set<string>();
    const warnings = collected
        .filter((item) => {
            const key = `${item.rule}:${item.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => {
            const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
            if (severity !== 0) return severity;
            return a.rule.localeCompare(b.rule);
        });

    const hasHigh = warnings.some((item) => item.severity === "HIGH");
    const score = hasHigh ? "DANGEROUS" : warnings.length > 0 ? "WARNINGS" : "SAFE";
    const riskScore = warnings.reduce(
        (max, item) => Math.max(max, SEVERITY_POINTS[item.severity]),
        0
    );

    return {
        passed: warnings.length === 0,
        score,
        riskScore,
        warnings,
    };
}
