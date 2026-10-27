import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { analyzeTx, decodeTx, runSafetyChecks } from "../dist/index.js";

const REPO_ROOT = new URL("../../../", import.meta.url);
const SAFE_TX = JSON.parse(fs.readFileSync(new URL("examples/safe_tx.json", REPO_ROOT), "utf8"));
const DANGEROUS_TX = JSON.parse(fs.readFileSync(new URL("examples/dangerous_tx.json", REPO_ROOT), "utf8"));

function successSimulation(overrides = {}) {
    return {
        status: "success",
        success: true,
        gasUsed: 21000,
        gasLimit: 30000,
        gasUsedPercent: 70,
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

function startRpc({ revert = false } = {}) {
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            const request = JSON.parse(body);
            const handle = (item) => {
                const result = (value) => ({ jsonrpc: "2.0", id: item.id, result: value });
                const error = (code, message) => ({ jsonrpc: "2.0", id: item.id, error: { code, message } });
                switch (item.method) {
                    case "eth_chainId":
                        return result("0x1");
                    case "eth_call":
                        return revert
                            ? error(3, "execution reverted: test revert")
                            : result("0x");
                    case "eth_estimateGas":
                        return result("0x5208");
                    case "eth_getCode":
                        return result("0x");
                    default:
                        return error(-32601, "method not found");
                }
            };
            const response = Array.isArray(request) ? request.map(handle) : handle(request);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(response));
        });
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

test("T1: decodes a simple ETH transfer", async () => {
    const decoded = await decodeTx(SAFE_TX, { chainId: 1 });
    assert.equal(decoded.type, "ETH Transfer");
    assert.equal(decoded.valueEth, "0.000001");
});

test("T2: decodes an unlimited ERC-20 approval", async () => {
    const decoded = await decodeTx(DANGEROUS_TX, { chainId: 1 });
    assert.equal(decoded.type, "ERC-20 Approve");
    assert.equal(decoded.signatureConfidence, "curated");
    assert.equal(
        decoded.params.find((param) => param.name === "amount")?.value,
        "MAX_UINT256 (unlimited)"
    );
});

test("T3: simulates a successful transaction", async () => {
    const { server, url } = await startRpc();
    try {
        const result = await analyzeTx({
            tx: { to: "0x1111111111111111111111111111111111111111", data: "0x", value: "1", gasLimit: "30000" },
            rpcUrl: url,
            chainId: 1,
            simulationBackend: "rpc",
            timeoutMs: 5000,
        });
        assert.equal(result.simulation.status, "success");
        assert.equal(result.simulation.backend, "rpc");
        assert.equal(result.simulation.gasUsed, 21000);
    } finally {
        server.close();
    }
});

test("T4: simulates a revert", async () => {
    const { server, url } = await startRpc({ revert: true });
    try {
        const result = await analyzeTx({
            tx: { to: "0x1111111111111111111111111111111111111111", data: "0x", value: "1" },
            rpcUrl: url,
            chainId: 1,
            simulationBackend: "rpc",
            timeoutMs: 5000,
        });
        assert.equal(result.simulation.status, "revert");
        assert.ok(result.safety.warnings.some((warning) => warning.rule === "TX_WILL_REVERT"));
    } finally {
        server.close();
    }
});

test("T5: a normal transfer is SAFE", async () => {
    const decoded = await decodeTx(SAFE_TX, { chainId: 1 });
    const report = runSafetyChecks(decoded, successSimulation(), { chainId: 1 });
    assert.equal(report.score, "SAFE");
    assert.equal(report.passed, true);
    assert.equal(report.warnings.length, 0);
});

test("T6: an unlimited approval is DANGEROUS", async () => {
    const decoded = await decodeTx(DANGEROUS_TX, { chainId: 1 });
    const report = runSafetyChecks(
        decoded,
        successSimulation({ gasUsed: 46000, gasLimit: 200000, gasUsedPercent: 23 }),
        { chainId: 1 }
    );
    assert.equal(report.score, "DANGEROUS");
    assert.ok(report.warnings.some((warning) => warning.rule === "UNLIMITED_APPROVAL"));
});
