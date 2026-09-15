#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { analyzeTx } from "@evm-safety/core";

const program = new Command();

program
    .name("evm-safety")
    .description("Analyze an EVM transaction for safety before broadcasting")
    .version("1.0.0");

program
    .command("check")
    .description("Simulate and safety-check a transaction")
    .option("-f, --file <path>", "Path to JSON file containing tx details")
    .option("--to <address>", "Recipient address")
    .option("--from <address>", "Sender address")
    .option("--data <hex>", "Calldata hex")
    .option("--value <wei>", "Value in wei")
    .option("--rpc <url>", "RPC URL string (required)")
    .action(async (options) => {
        try {
            if (!options.rpc) {
                console.error(chalk.red("Error: --rpc URL is required."));
                process.exit(1);
            }

            let txInput: any = {};
            if (options.file) {
                const fileContent = fs.readFileSync(options.file, "utf8");
                const parsed = JSON.parse(fileContent);
                txInput = parsed.tx || parsed;
            } else {
                if (!options.to && !options.data) {
                    console.error(chalk.red("Error: Must provide --file or inline tx options (--to, --data, etc.)"));
                    process.exit(1);
                }
                txInput = {
                    to: options.to,
                    from: options.from,
                    data: options.data,
                    value: options.value,
                };
            }

            const spinner = ora("Analyzing transaction...").start();

            const result = await analyzeTx({
                tx: txInput,
                rpcUrl: options.rpc,
                tenderlyKey: process.env.TENDERLY_ACCESS_KEY,
            });

            spinner.stop();

            // Output Decoded
            console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            console.log(chalk.bold.white("  🔍 DECODED TRANSACTION"));
            console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            console.log(`  Type    : ${chalk.cyan(result.decoded.type)}`);
            if (result.decoded.contractName) console.log(`  Contract: ${result.decoded.contractName}`);
            if (result.decoded.functionSignature) console.log(`  Function: ${result.decoded.functionSignature}`);
            for (const p of result.decoded.params) {
                let pVal = p.value;
                if (pVal.includes("MAX_UINT256")) pVal = chalk.red(pVal);
                console.log(`  Param   : ${p.name} = ${pVal}`);
            }

            // Output Simulation
            console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            console.log(chalk.bold.white(`  🧪 SIMULATION RESULT (${result.simulation.backend})`));
            console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            if (result.simulation.success) {
                console.log(`  Status  : ${chalk.green("✅ Will succeed")}`);
            } else {
                console.log(`  Status  : ${chalk.red("❌ Will revert")}`);
                if (result.simulation.revertReason) {
                    console.log(`  Reason  : ${chalk.red(result.simulation.revertReason)}`);
                }
            }
            console.log(`  Gas used: ${result.simulation.gasUsed.toLocaleString()} / ${result.simulation.gasLimit.toLocaleString()}`);

            if (result.simulation.balanceChanges.length > 0) {
                console.log("\n  Balance Changes:");
                for (const bc of result.simulation.balanceChanges) {
                    const color = bc.delta.startsWith("+") ? "green" : "red";
                    console.log(`    - ${bc.address.slice(0, 10)}...: ${chalk[color](bc.delta)} ${bc.token}`);
                }
            }

            // Output Safety
            console.log(chalk.bold.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            let safetyTitle = "  🛡️ SAFETY REPORT: ";
            if (result.safety.score === "SAFE") safetyTitle += chalk.green("SAFE");
            if (result.safety.score === "WARNINGS") safetyTitle += chalk.yellow("WARNINGS");
            if (result.safety.score === "DANGEROUS") safetyTitle += chalk.red("DANGEROUS");
            console.log(chalk.bold.white(safetyTitle));
            console.log(chalk.bold.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

            if (result.safety.warnings.length === 0) {
                console.log(chalk.green("  ✓ No warnings detected."));
            } else {
                for (const w of result.safety.warnings) {
                    const sevColor = w.severity === "HIGH" ? "red" : w.severity === "MEDIUM" ? "yellow" : "cyan";
                    console.log(`\n  [${chalk.bold[sevColor](w.severity)}] ${chalk.bold(w.rule)}`);
                    console.log(`  ${w.message}`);
                    console.log(chalk.gray(`  Recommendation: ${w.recommendation}`));
                }
            }
            console.log("");

            if (result.safety.score === "DANGEROUS") {
                process.exit(1);
            }
        } catch (err: unknown) {
            console.error(chalk.red("\nFatal Error:"), err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

program.parse();
