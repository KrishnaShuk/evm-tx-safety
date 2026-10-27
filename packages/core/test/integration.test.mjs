import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { ethers, Interface } from "ethers";
import { analyzeTx, assertSafeRpcUrl } from "../dist/index.js";
import { ERC20_ABI } from "../dist/abi/abis.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const SENDER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb";
const TX_HASH = `0x${"ab".repeat(32)}`;

const erc20 = new Interface(ERC20_ABI);
const approveData = erc20.encodeFunctionData("approve", [ATTACKER, ethers.MaxUint256]);
const transferData = erc20.encodeFunctionData("transfer", [RECIPIENT, 1_000_000n]);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const pad = (address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

function startRpc(options = {}) {
    const supportsTrace = options.supportsTrace ?? false;
    const state = { requests: [] };
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            let payload;
            try {
                payload = JSON.parse(body);
            } catch {
                res.writeHead(400).end();
                return;
            }
            const handle = (request) => {
                state.requests.push(request.method);
                const { id, method, params } = request;
                const result = (value) => ({ jsonrpc: "2.0", id, result: value });
                const error = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
                switch (method) {
                    case "eth_chainId":
                        return result("0x1");
                    case "eth_call":
                        return result("0x");
                    case "eth_estimateGas":
                        return result("0x5208");
                    case "eth_getCode": {
                        const address = String(params?.[0] ?? "").toLowerCase();
                        return result(address === USDC ? "0x60006000" : "0x");
                    }
                    case "eth_getStorageAt":
                        return result(`0x${"0".repeat(64)}`);
                    case "eth_getTransactionByHash":
                        return result({
                            hash: TX_HASH,
                            from: SENDER,
                            to: USDC,
                            data: approveData,
                            value: "0x0",
                            gasLimit: "0x30d40",
                            nonce: 0,
                            chainId: 1,
                            type: 2,
                            gasPrice: "0x3b9aca00",
                            maxFeePerGas: "0x3b9aca00",
                            v: "0x1b",
                            r: `0x${"11".repeat(32)}`,
                            s: `0x${"22".repeat(32)}`,
                        });
                    case "debug_traceCall": {
                        if (!supportsTrace) return error(-32601, "method not found");
                        const tracer = params?.[2]?.tracer;
                        if (tracer === "prestateTracer") {
                            return result({
                                pre: { [RECIPIENT]: { balance: "0x0" } },
                                post: { [RECIPIENT]: { balance: "0x1" } },
                            });
                        }
                        return result({
                            from: SENDER,
                            to: USDC,
                            value: "0x0",
                            gasUsed: "0xc350",
                            calls: [],
                            logs: [
                                {
                                    address: USDC,
                                    topics: [TRANSFER_TOPIC, pad(SENDER), pad(RECIPIENT)],
                                    data: `0x${(1_000_000n).toString(16).padStart(64, "0")}`,
                                },
                            ],
                        });
                    }
                    default:
                        return error(-32601, "method not found");
                }
            };
            const response = Array.isArray(payload) ? payload.map(handle) : handle(payload);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(response));
        });
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            resolve({ server, state, url: `http://127.0.0.1:${port}` });
        });
    });
}

test("hash input + RPC fallback does not misclassify an unsupported trace", async () => {
    const { server, state, url } = await startRpc({ supportsTrace: false });
    try {
        const result = await analyzeTx({
            tx: TX_HASH,
            rpcUrl: url,
            chainId: 1,
            timeoutMs: 8000,
        });
        assert.equal(result.meta.inputKind, "hash");
        assert.equal(result.decoded.txHash, TX_HASH);
        assert.equal(result.decoded.type, "ERC-20 Approve");
        assert.equal(result.simulation.backend, "rpc");
        assert.equal(result.simulation.status, "success");
        assert.equal(result.safety.score, "DANGEROUS");
        assert.ok(state.requests.includes("debug_traceCall"));
        assert.ok(state.requests.includes("eth_call"));
    } finally {
        server.close();
    }
});

test("an RPC that reports the wrong chain is rejected", async () => {
    const { server, url } = await startRpc({ supportsTrace: false });
    try {
        await assert.rejects(
            () =>
                analyzeTx({
                    tx: { to: RECIPIENT, data: "0x", value: "1" },
                    rpcUrl: url,
                    chainId: 8453,
                    timeoutMs: 4000,
                }),
            /chain 1|CHAIN_MISMATCH|reports chain/i
        );
    } finally {
        server.close();
    }
});

test("trace backend produces token balance and state diffs", async () => {
    const { server, url } = await startRpc({ supportsTrace: true });
    try {
        const result = await analyzeTx({
            tx: {
                from: SENDER,
                to: USDC,
                data: transferData,
                value: "0",
                gasLimit: "200000",
            },
            rpcUrl: url,
            chainId: 1,
            simulationBackend: "trace",
            timeoutMs: 8000,
        });
        assert.equal(result.simulation.backend, "trace");
        assert.equal(result.simulation.status, "success");
        assert.ok(result.simulation.balanceChanges.some((change) => change.delta === "-1" && change.token === "USDC"));
        assert.ok(result.simulation.balanceChanges.some((change) => change.delta === "+1" && change.token === "USDC"));
        assert.ok(result.simulation.stateChanges.some((change) => change.kind === "balance"));
        assert.equal(result.safety.score, "SAFE");
    } finally {
        server.close();
    }
});

test("Tenderly backend uses the account/project endpoint and asset changes", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedBody = null;
    globalThis.fetch = async (url, init) => {
        requestedUrl = String(url);
        requestedBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
            JSON.stringify({
                transaction: {
                    status: true,
                    gas_used: 50000,
                    transaction_info: {
                        logs: [],
                        asset_changes: [
                            {
                                from: SENDER,
                                to: RECIPIENT,
                                amount: "1000000",
                                token_info: {
                                    type: "ERC20",
                                    address: USDC,
                                    symbol: "USDC",
                                    decimals: 6,
                                },
                            },
                        ],
                        raw_state_diff: {
                            [RECIPIENT]: { storage: { "0x01": "0x02" } },
                        },
                    },
                },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
        );
    };
    try {
        const result = await analyzeTx({
            tx: {
                from: SENDER,
                to: USDC,
                data: transferData,
                value: "0",
                gasLimit: "200000",
            },
            chainId: 1,
            tenderlyKey: "test-key",
            tenderlyAccount: "acme",
            tenderlyProject: "proj",
            simulationBackend: "tenderly",
            timeoutMs: 8000,
        });
        assert.match(requestedUrl, /\/account\/acme\/project\/proj\/simulate$/);
        assert.equal(requestedBody.network_id, "1");
        assert.equal(result.simulation.backend, "tenderly");
        assert.equal(result.simulation.status, "success");
        assert.ok(result.simulation.balanceChanges.some((change) => change.delta === "-1"));
        assert.ok(result.simulation.balanceChanges.some((change) => change.delta === "+1"));
        assert.equal(result.simulation.stateChanges.length, 1);
        assert.equal(result.safety.score, "SAFE");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("RPC URL policy blocks private hosts and allows the default registry", async () => {
    const previousHttp = process.env.ALLOW_HTTP_RPC;
    const previousCustom = process.env.ALLOW_CUSTOM_RPC;
    process.env.ALLOW_HTTP_RPC = "true";
    process.env.ALLOW_CUSTOM_RPC = "false";
    try {
        await assert.rejects(() => assertSafeRpcUrl("http://127.0.0.1:8545", 1), /private|link-local/i);
        const allowed = await assertSafeRpcUrl("https://eth.llamarpc.com", 1);
        assert.match(allowed, /llamarpc/);
    } finally {
        if (previousHttp === undefined) delete process.env.ALLOW_HTTP_RPC;
        else process.env.ALLOW_HTTP_RPC = previousHttp;
        if (previousCustom === undefined) delete process.env.ALLOW_CUSTOM_RPC;
        else process.env.ALLOW_CUSTOM_RPC = previousCustom;
    }
});
