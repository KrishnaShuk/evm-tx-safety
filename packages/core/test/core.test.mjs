import test from "node:test";
import assert from "node:assert/strict";
import { AbiCoder, ethers, Interface } from "ethers";
import {
    analyzeTx,
    decodeTx,
    detectInputKind,
    normalizeInput,
    runSafetyChecks,
} from "../dist/index.js";
import { ERC20_ABI, MULTICALL3_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from "../dist/abi/abis.js";
import { deriveDiffs } from "../dist/simulator/logs.js";
import { parsePrestateDiff, parseTenderlyStateDiff } from "../dist/simulator/state.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const UNISWAP_V2 = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const UNIVERSAL_ROUTER = "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad";
const SEAPORT = "0x00000000000000adc04c56bf30ac9d3c0aaf14dc";
const SENDER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb";

const erc20 = new Interface(ERC20_ABI);
const multicall3 = new Interface(MULTICALL3_ABI);

function simulation(overrides = {}) {
    return {
        status: "success",
        success: true,
        gasUsed: 50000,
        gasLimit: 100000,
        gasUsedPercent: 50,
        balanceChanges: [],
        approvals: [],
        stateChanges: [],
        events: [],
        revertReason: null,
        backend: "rpc",
        capabilities: {
            success: true,
            gas: true,
            balances: false,
            approvals: false,
            stateChanges: false,
            events: false,
            trace: false,
        },
        notes: [],
        ...overrides,
    };
}

function rules(report) {
    return report.warnings.map((warning) => warning.rule);
}

test("input detection distinguishes hash, raw calldata, and structured input", () => {
    assert.equal(detectInputKind(`0x${"ab".repeat(32)}`), "hash");
    assert.equal(detectInputKind("0x095ea7b3"), "calldata");
    assert.equal(detectInputKind({ to: RECIPIENT, data: "0x" }), "structured");
});

test("raw calldata requires a target", async () => {
    await assert.rejects(
        () => normalizeInput(erc20.encodeFunctionData("approve", [ATTACKER, 1n])),
        /`to` address is required/
    );
    const normalized = await normalizeInput(
        erc20.encodeFunctionData("approve", [ATTACKER, 1n]),
        { to: USDC, chainId: 1 }
    );
    assert.equal(normalized.kind, "calldata");
    assert.equal(normalized.to.toLowerCase(), USDC.toLowerCase());
});

test("decodes an unlimited USDC approval with intent and curated confidence", async () => {
    const data = erc20.encodeFunctionData("approve", [ATTACKER, ethers.MaxUint256]);
    const decoded = await decodeTx({ to: USDC, data }, { chainId: 1 });
    assert.equal(decoded.type, "ERC-20 Approve");
    assert.equal(decoded.signatureConfidence, "curated");
    assert.match(decoded.summary, /unlimited/i);
    assert.equal(decoded.params.find((param) => param.name === "amount")?.value, "MAX_UINT256 (unlimited)");
});

test("Permit2 approvals use the token parameter, not the Permit2 contract", async () => {
    const permit2 = new Interface(PERMIT2_ABI);
    const maxUint160 = (BigInt(1) << BigInt(160)) - BigInt(1);
    const data = permit2.encodeFunctionData("approve", [
        USDC,
        ATTACKER,
        maxUint160,
        0,
    ]);
    const decoded = await decodeTx({ to: PERMIT2, data }, { chainId: 1 });
    assert.equal(decoded.type, "ERC-20 Approve");
    assert.match(decoded.summary, /USDC/i);
    assert.match(decoded.summary, /unlimited/i);
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.ok(rules(report).includes("UNLIMITED_APPROVAL"));
});

test("unlimited approval to an unknown spender is DANGEROUS", async () => {
    const data = erc20.encodeFunctionData("approve", [ATTACKER, ethers.MaxUint256]);
    const decoded = await decodeTx({ to: USDC, data }, { chainId: 1 });
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.equal(report.score, "DANGEROUS");
    assert.ok(rules(report).includes("UNLIMITED_APPROVAL"));
    assert.ok(rules(report).includes("UNVERIFIED_SPENDER"));
    assert.equal(report.passed, false);
});

test("unlimited approval to a known router is a warning, not DANGEROUS", async () => {
    const data = erc20.encodeFunctionData("approve", [UNISWAP_V2, ethers.MaxUint256]);
    const decoded = await decodeTx({ to: USDC, data }, { chainId: 1 });
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.equal(report.score, "WARNINGS");
    assert.ok(!report.warnings.some((warning) => warning.rule === "UNVERIFIED_SPENDER"));
});

test("setApprovalForAll is ignored for a known marketplace operator", async () => {
    const nft = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
    const iface = new Interface([
        "function setApprovalForAll(address operator, bool approved)",
    ]);
    const data = iface.encodeFunctionData("setApprovalForAll", [SEAPORT, true]);
    const decoded = await decodeTx({ to: nft, data }, { chainId: 1 });
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.ok(!rules(report).includes("SET_APPROVAL_FOR_ALL"));
});

test("setApprovalForAll to an unknown operator is HIGH", async () => {
    const nft = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
    const iface = new Interface([
        "function setApprovalForAll(address operator, bool approved)",
    ]);
    const data = iface.encodeFunctionData("setApprovalForAll", [ATTACKER, true]);
    const decoded = await decodeTx({ to: nft, data }, { chainId: 1 });
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.equal(report.score, "DANGEROUS");
    assert.ok(rules(report).includes("SET_APPROVAL_FOR_ALL"));
});

test("transfer to an unknown contract is flagged", async () => {
    const decoded = await decodeTx(
        { to: RECIPIENT, data: "0x", value: "1000" },
        { chainId: 1 }
    );
    decoded.entities[RECIPIENT] = {
        address: RECIPIENT,
        isContract: true,
        known: false,
    };
    const report = runSafetyChecks(decoded, simulation(), { chainId: 1 });
    assert.ok(rules(report).includes("TRANSFER_TO_UNKNOWN_CONTRACT"));
});

test("hidden approvals inside a generic call are HIGH, but known spenders are skipped", async () => {
    const data = erc20.encodeFunctionData("balanceOf", [SENDER]);
    const decoded = await decodeTx({ to: USDC, data }, { chainId: 1 });
    assert.equal(decoded.type, "Generic Contract Call");

    const hidden = simulation({
        approvals: [
            {
                owner: SENDER,
                spender: ATTACKER,
                token: "USDC",
                tokenAddress: USDC,
                kind: "erc20",
                amount: "unlimited",
                amountRaw: ethers.MaxUint256.toString(),
            },
        ],
    });
    const report = runSafetyChecks(decoded, hidden, { chainId: 1 });
    assert.ok(rules(report).includes("HIDDEN_APPROVAL"));
    assert.equal(report.score, "DANGEROUS");

    const safe = simulation({
        approvals: [
            {
                owner: SENDER,
                spender: "0x000000000022d473030f116ddee9f6b43ac78ba3",
                token: "USDC",
                tokenAddress: USDC,
                kind: "erc20",
                amount: "1",
            },
        ],
    });
    const safeReport = runSafetyChecks(decoded, safe, { chainId: 1 });
    assert.ok(!rules(safeReport).includes("HIDDEN_APPROVAL"));
});

test("LOW-only findings produce WARNINGS and passed=false", async () => {
    const decoded = await decodeTx(
        { to: RECIPIENT, data: "0x", value: "1" },
        { chainId: 1 }
    );
    const report = runSafetyChecks(
        decoded,
        simulation({ gasUsed: 50000, gasLimit: 51000 }),
        { chainId: 1 }
    );
    assert.equal(report.score, "WARNINGS");
    assert.equal(report.passed, false);
});

test("reverts are DANGEROUS, unavailable simulations are not", async () => {
    const decoded = await decodeTx(
        { to: RECIPIENT, data: "0x", value: "1" },
        { chainId: 1 }
    );
    const revert = runSafetyChecks(
        decoded,
        simulation({ status: "revert", success: false, revertReason: "execution reverted" }),
        { chainId: 1 }
    );
    assert.equal(revert.score, "DANGEROUS");
    assert.ok(rules(revert).includes("TX_WILL_REVERT"));

    const unavailable = runSafetyChecks(
        decoded,
        simulation({
            status: "unavailable",
            success: false,
            error: { code: "RPC_ERROR", message: "RPC down" },
            capabilities: {
                success: false,
                gas: false,
                balances: false,
                approvals: false,
                stateChanges: false,
                events: false,
                trace: false,
            },
        }),
        { chainId: 1 }
    );
    assert.equal(unavailable.score, "WARNINGS");
    assert.ok(rules(unavailable).includes("SIMULATION_UNAVAILABLE"));
});

test("nested Multicall3 calls are decoded recursively", async () => {
    const child = erc20.encodeFunctionData("transfer", [RECIPIENT, 1000n]);
    const data = multicall3.encodeFunctionData("aggregate3", [
        [[USDC, true, child]],
    ]);
    const decoded = await decodeTx({ to: MULTICALL3, data }, { chainId: 1 });
    assert.equal(decoded.type, "Multicall");
    const childCall = decoded.calls[0].children?.[0];
    assert.ok(childCall, "expected a nested call");
    assert.equal(childCall.functionName, "transfer");
    assert.equal(childCall.type, "ERC-20 Transfer");
});

test("Universal Router commands are decoded into typed sub-calls", async () => {
    const router = new Interface(UNIVERSAL_ROUTER_ABI);
    const inputs = AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "address[]", "bool"],
        [RECIPIENT, 1_000_000n, 0n, [USDC, RECIPIENT], true]
    );
    const data = router.encodeFunctionData("execute(bytes,bytes[],uint256)", ["0x08", [inputs], 9_999_999_999n]);
    const decoded = await decodeTx({ to: UNIVERSAL_ROUTER, data }, { chainId: 1 });
    assert.equal(decoded.type, "Uniswap Swap");
    const command = decoded.calls[0].children?.[0];
    assert.ok(command, "expected a Universal Router command");
    assert.equal(command.command, "V2_SWAP_EXACT_IN");
    assert.equal(command.type, "Uniswap Swap");
    assert.equal(command.params.find((param) => param.name === "amountIn")?.value, "1000000");
});

test("ERC-20 Transfer logs become balance changes", async () => {
    const topic = ethers.id("Transfer(address,address,uint256)");
    const pad = (address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
    const value = 1_000_000n;
    const diffs = await deriveDiffs({
        logs: [
            {
                address: USDC,
                topics: [topic, pad(SENDER), pad(RECIPIENT)],
                data: `0x${value.toString(16).padStart(64, "0")}`,
            },
        ],
        chainId: 1,
        nativeSymbol: "ETH",
    });
    const sender = diffs.balanceChanges.find(
        (change) => change.address.toLowerCase() === SENDER && change.direction === "out"
    );
    const recipient = diffs.balanceChanges.find(
        (change) => change.address.toLowerCase() === RECIPIENT && change.direction === "in"
    );
    assert.equal(sender?.delta, "-1");
    assert.equal(recipient?.delta, "+1");
    assert.equal(sender?.token, "USDC");
    assert.equal(diffs.events[0].name, "Transfer");
});

test("prestate and Tenderly state diffs are parsed", () => {
    const prestate = parsePrestateDiff({
        pre: {
            [RECIPIENT]: { balance: "0x1", storage: { "0x01": "0x02" } },
        },
        post: {
            [RECIPIENT]: { balance: "0x2", storage: { "0x01": "0x03" } },
        },
    });
    assert.ok(prestate.some((change) => change.kind === "balance"));
    assert.ok(prestate.some((change) => change.kind === "storage"));

    const tenderly = parseTenderlyStateDiff({
        [RECIPIENT]: { storage: { "0x01": "0x03" }, balance: "2" },
    });
    assert.equal(tenderly.length, 2);
});

test("analyzeTx works without an RPC and marks simulation unavailable", async () => {
    const result = await analyzeTx({
        tx: { to: RECIPIENT, data: "0x", value: "1" },
        chainId: 1,
        timeoutMs: 5000,
    });
    assert.equal(result.meta.version, "0.6.0");
    assert.equal(result.simulation.status, "unavailable");
    assert.equal(result.safety.score, "WARNINGS");
});
