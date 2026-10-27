#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import {
    analyzeTx,
    defaultRpcForChain,
    type AnalysisResult,
    type SimulationBackend,
} from "@evm-safety/core";

const program = new Command();

const SCORE_RANK: Record<string, number> = { SAFE: 0, WARNINGS: 1, DANGEROUS: 2 };
const FAIL_ON_RANK: Record<string, number> = { safe: 0, warnings: 1, dangerous: 2 };

function short(value: string, size = 10): string {
    if (!value || value.length <= size * 2) return value;
    return `${value.slice(0, size)}…${value.slice(-6)}`;
}

function printCalls(calls: AnalysisResult["decoded"]["calls"], indent = "  "): void {
    for (const call of calls) {
        const label = call.functionSignature ?? call.command ?? call.selector ?? "call";
        const confidence = call.confidence === "verified" ? "" : chalk.yellow(` [${call.confidence}]`);
        console.log(`${indent}${chalk.cyan(label)}${confidence} → ${short(call.target)}`);
        for (const param of call.params) {
            const value = param.value.includes("MAX_UINT256") ? chalk.red(param.value) : param.value;
            console.log(`${indent}  ${chalk.gray(param.name)} (${param.type}) = ${value}`);
        }
        if (call.children?.length) printCalls(call.children, `${indent}  `);
    }
}

function printResult(result: AnalysisResult): void {
    const { decoded, simulation, safety, meta } = result;
    console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.bold.white("  DECODED TRANSACTION"));
    console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(`  Chain      : ${chalk.cyan(meta.chainName)} (${meta.chainId})`);
    if (decoded.txHash) console.log(`  Tx hash    : ${decoded.txHash}`);
    console.log(`  Type       : ${chalk.cyan(decoded.type)}`);
    if (decoded.contractName) console.log(`  Contract   : ${decoded.contractName}`);
    console.log(`  Confidence : ${decoded.signatureConfidence}`);
    console.log(`  Summary    : ${chalk.white(decoded.summary)}`);
    if (decoded.calls.length) {
        console.log("\n  Calls:");
        printCalls(decoded.calls);
    }

    console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.bold.white(`  SIMULATION (${simulation.backend})`));
    console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    if (simulation.status === "success") {
        console.log(`  Status  : ${chalk.green("will succeed")}`);
    } else if (simulation.status === "revert") {
        console.log(`  Status  : ${chalk.red("will revert")}`);
        console.log(`  Reason  : ${chalk.red(simulation.revertReason ?? "unknown")}`);
    } else {
        console.log(`  Status  : ${chalk.yellow("unavailable")}`);
        if (simulation.error) console.log(`  Error   : ${simulation.error.code} — ${simulation.error.message}`);
    }
    if (simulation.status !== "unavailable") {
        console.log(
            `  Gas     : ${simulation.gasUsed.toLocaleString()} / ${simulation.gasLimit.toLocaleString()} (${simulation.gasUsedPercent}%)`
        );
    }
    const caps = Object.entries(simulation.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ");
    console.log(`  Coverage: ${caps || "none"}`);

    if (simulation.balanceChanges.length) {
        console.log("\n  Balance changes:");
        for (const change of simulation.balanceChanges) {
            const color = change.direction === "in" ? chalk.green : chalk.red;
            console.log(`    ${short(change.address)} ${color(change.delta)} ${change.token}`);
        }
    }
    if (simulation.approvals.length) {
        console.log("\n  Approvals:");
        for (const approval of simulation.approvals) {
            console.log(
                `    ${short(approval.owner)} → ${short(approval.spender)} ${approval.token} ${approval.amount ?? (approval.approved ? "all" : "revoked")}`
            );
        }
    }
    if (simulation.stateChanges.length) {
        console.log(`\n  State changes: ${simulation.stateChanges.length} (use --json for details)`);
    }
    if (simulation.notes.length) {
        console.log("\n  Notes:");
        for (const note of simulation.notes) console.log(`    - ${note}`);
    }

    console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    let title = "  SAFETY: ";
    if (safety.score === "SAFE") title += chalk.green("SAFE");
    if (safety.score === "WARNINGS") title += chalk.yellow("WARNINGS");
    if (safety.score === "DANGEROUS") title += chalk.red("DANGEROUS");
    console.log(chalk.bold.white(title) + chalk.gray(`  (risk ${safety.riskScore}/100)`));
    console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    if (safety.warnings.length === 0) {
        console.log(chalk.green("  No warnings detected."));
    } else {
        for (const warning of safety.warnings) {
            const color =
                warning.severity === "HIGH" ? chalk.red : warning.severity === "MEDIUM" ? chalk.yellow : chalk.cyan;
            console.log(`\n  [${color(warning.severity)}] ${chalk.bold(warning.rule)} (${warning.confidence})`);
            console.log(`  ${warning.message}`);
            console.log(chalk.gray(`  Recommendation: ${warning.recommendation}`));
        }
    }
    console.log("");
}

program
    .name("evm-safety")
    .description("Analyze an EVM transaction for safety before broadcasting")
    .version("0.6.0");

program
    .command("check")
    .description("Decode, simulate, and safety-check a transaction")
    .option("-f, --file <path>", "JSON file containing tx fields")
    .option("--tx <value>", "Tx hash, signed hex, or raw calldata")
    .option("--to <address>", "Target address (required for raw calldata)")
    .option("--from <address>", "Sender address")
    .option("--data <hex>", "Calldata hex")
    .option("--value <wei>", "Value in wei")
    .option("--gas-limit <wei>", "Gas limit")
    .option("--gas-price <wei>", "Gas price in wei")
    .option("--nonce <number>", "Sender nonce")
    .option("--chain-id <id>", "Chain ID (default: 1 or tx chain)")
    .option("--rpc <url>", "RPC URL (default: chain public RPC)")
    .option("--simulation <backend>", "auto | tenderly | trace | rpc", "auto")
    .option("--tenderly-key <key>", "Tenderly access key")
    .option("--tenderly-account <slug>", "Tenderly account slug")
    .option("--tenderly-project <slug>", "Tenderly project slug")
    .option("--timeout <ms>", "Analysis timeout", "20000")
    .option("--json", "Print the full AnalysisResult as JSON")
    .option("--fail-on <level>", "safe | warnings | dangerous", "dangerous")
    .action(async (options) => {
        try {
            let tx: unknown;
            if (options.file) {
                const parsed = JSON.parse(fs.readFileSync(options.file, "utf8")) as Record<string, unknown>;
                tx = parsed.tx ?? parsed;
            } else if (options.tx) {
                tx = options.tx;
            } else if (options.to || options.data) {
                tx = {
                    to: options.to,
                    from: options.from,
                    data: options.data,
                    value: options.value,
                    gasLimit: options.gasLimit,
                    gasPrice: options.gasPrice,
                    nonce: options.nonce ? Number(options.nonce) : undefined,
                };
            } else {
                console.error(chalk.red("Error: provide --tx, --file, or --to/--data."));
                process.exit(2);
            }

            const explicitChainId = options.chainId ? Number(options.chainId) : undefined;
            const embeddedChainId =
                tx && typeof tx === "object" && "chainId" in tx && (tx as { chainId?: unknown }).chainId
                    ? Number((tx as { chainId?: unknown }).chainId)
                    : undefined;
            const chainId = explicitChainId ?? embeddedChainId;
            const rpcUrl = options.rpc || defaultRpcForChain(chainId ?? 1);
            const backend = String(options.simulation) as SimulationBackend;
            if (!["auto", "tenderly", "trace", "rpc"].includes(backend)) {
                console.error(chalk.red("Error: --simulation must be auto, tenderly, trace, or rpc."));
                process.exit(2);
            }

            const spinner = ora("Analyzing transaction...").start();
            const result = await analyzeTx({
                tx: tx as Parameters<typeof analyzeTx>[0]["tx"],
                rpcUrl,
                chainId,
                to: options.to,
                tenderlyKey: options.tenderlyKey,
                tenderlyAccount: options.tenderlyAccount,
                tenderlyProject: options.tenderlyProject,
                simulationBackend: backend,
                timeoutMs: Number(options.timeout) || 20000,
            });
            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                printResult(result);
            }

            const failOn = String(options.failOn).toLowerCase();
            if (!(failOn in FAIL_ON_RANK)) {
                console.error(chalk.red("Error: --fail-on must be safe, warnings, or dangerous."));
                process.exit(2);
            }
            if (SCORE_RANK[result.safety.score] >= FAIL_ON_RANK[failOn]) {
                process.exit(1);
            }
        } catch (err: unknown) {
            console.error(
                chalk.red("\nFatal Error:"),
                err instanceof Error ? err.message : String(err)
            );
            process.exit(2);
        }
    });

program.parse();
