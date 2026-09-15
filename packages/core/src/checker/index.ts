import { ethers } from "ethers";
import {
    DecodedTransaction,
    SimulationResult,
    SafetyReport,
    SafetyWarning,
} from "../types";

const MAX_UINT256 = ethers.MaxUint256.toString();

// ─── Known safe spenders (well-audited protocols) ────────────────────────────
const KNOWN_SAFE_SPENDERS = new Set([
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
    "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 Router 2
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b", // Uniswap Universal Router
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // 0x Exchange Proxy
    "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch V5
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // Aave V3 Pool
    "0xba12222222228d8ba445958a75a0704d566bf2c8", // Balancer Vault
]);

// ─── Rule implementations ─────────────────────────────────────────────────────
function checkUnlimitedApproval(decoded: DecodedTransaction): SafetyWarning | null {
    if (decoded.type !== "ERC-20 Approve") return null;
    const amountParam = decoded.params.find((p) => p.name === "amount" || p.name === "_value");
    if (!amountParam) return null;
    const isUnlimited =
        amountParam.value.includes("MAX_UINT256") ||
        amountParam.value === MAX_UINT256;
    if (!isUnlimited) return null;
    return {
        rule: "UNLIMITED_APPROVAL",
        severity: "HIGH",
        message: `This transaction grants unlimited token spending to ${decoded.params.find((p) => p.name === "spender")?.value || "an address"
            }.`,
        recommendation:
            "Approve only the exact amount you need. Unlimited approvals are a common attack vector.",
    };
}

function checkUnverifiedSpender(decoded: DecodedTransaction): SafetyWarning | null {
    if (decoded.type !== "ERC-20 Approve") return null;
    const spenderParam = decoded.params.find((p) => p.name === "spender" || p.name === "_spender");
    if (!spenderParam) return null;
    const spender = spenderParam.value.toLowerCase();
    if (KNOWN_SAFE_SPENDERS.has(spender)) return null;
    return {
        rule: "UNVERIFIED_SPENDER",
        severity: "MEDIUM",
        message: `The spender address ${spenderParam.value} is not a known protocol.`,
        recommendation:
            "Verify the spender contract on Etherscan before granting token approval.",
    };
}

function checkTxWillRevert(simulation: SimulationResult): SafetyWarning | null {
    if (simulation.success) return null;
    return {
        rule: "TX_WILL_REVERT",
        severity: "HIGH",
        message: `This transaction will revert: ${simulation.revertReason || "unknown reason"}.`,
        recommendation:
            "Fix the transaction parameters before sending. A reverted tx still costs gas.",
    };
}

function checkHighValueTransfer(decoded: DecodedTransaction): SafetyWarning | null {
    if (decoded.type !== "ETH Transfer") return null;
    const eth = parseFloat(decoded.valueEth);
    if (eth < 1) return null;
    return {
        rule: "HIGH_VALUE_TRANSFER",
        severity: "MEDIUM",
        message: `This transaction sends ${decoded.valueEth} ETH — a significant amount.`,
        recommendation: "Double-check the recipient address before sending.",
    };
}

function checkZeroAddress(decoded: DecodedTransaction): SafetyWarning | null {
    const zeroAddr = "0x0000000000000000000000000000000000000000";
    if (
        decoded.to === zeroAddr ||
        decoded.params.some(
            (p) => p.type === "address" && p.value.toLowerCase() === zeroAddr
        )
    ) {
        return {
            rule: "ZERO_ADDRESS_TARGET",
            severity: "HIGH",
            message: "Transaction targets or references the zero address (0x000...000).",
            recommendation:
                "The zero address is a burn address. Sending funds here are unrecoverable.",
        };
    }
    return null;
}

function checkGasLimit(simulation: SimulationResult): SafetyWarning | null {
    if (!simulation.success) return null;
    const buffer = simulation.gasLimit / simulation.gasUsed;
    if (buffer >= 1.1) return null;
    return {
        rule: "GAS_LIMIT_TOO_LOW",
        severity: "LOW",
        message: `Gas limit (${simulation.gasLimit}) is less than 10% above estimated usage (${simulation.gasUsed}).`,
        recommendation:
            "Increase gas limit by at least 20% to avoid out-of-gas failures.",
    };
}

function checkSetApprovalForAll(decoded: DecodedTransaction): SafetyWarning | null {
    if (decoded.functionName !== "Set Approval For All") return null;
    const approvedParam = decoded.params.find((p) => p.name === "approved");
    if (approvedParam?.value !== "true") return null;
    return {
        rule: "SET_APPROVAL_FOR_ALL",
        severity: "HIGH",
        message: `This transaction gives an operator full control over ALL your NFTs.`,
        recommendation:
            "Only use setApprovalForAll with trusted marketplace contracts (OpenSea, Blur, etc.).",
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function runSafetyChecks(
    decoded: DecodedTransaction,
    simulation: SimulationResult
): SafetyReport {
    const warnings: SafetyWarning[] = [
        checkUnlimitedApproval(decoded),
        checkUnverifiedSpender(decoded),
        checkTxWillRevert(simulation),
        checkHighValueTransfer(decoded),
        checkZeroAddress(decoded),
        checkGasLimit(simulation),
        checkSetApprovalForAll(decoded),
    ].filter((w): w is SafetyWarning => w !== null);

    const hasHigh = warnings.some((w) => w.severity === "HIGH");
    const hasMedium = warnings.some((w) => w.severity === "MEDIUM");

    const score = hasHigh ? "DANGEROUS" : hasMedium ? "WARNINGS" : "SAFE";

    return {
        passed: warnings.length === 0,
        score,
        warnings,
    };
}
