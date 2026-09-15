import axios from "axios";
import { ethers } from "ethers";
import {
    RawTxInput,
    SimulationResult,
    BalanceChange,
    EmittedEvent,
} from "../types";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// ─── eth_call backend ─────────────────────────────────────────────────────────
async function simulateViaRpc(
    tx: RawTxInput,
    rpcUrl: string
): Promise<SimulationResult> {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const callObj: Record<string, string> = {
        to: tx.to || "0x",
        data: tx.data || "0x",
        value: tx.value ? "0x" + BigInt(tx.value).toString(16) : "0x0",
    };
    if (tx.from) callObj.from = tx.from;
    if (tx.gasLimit) callObj.gas = "0x" + BigInt(tx.gasLimit).toString(16);

    let gasUsed = 21000;
    let success = true;
    let revertReason: string | null = null;

    // Estimate gas (also detects reverts)
    try {
        const gasEst = await provider.estimateGas({
            to: tx.to,
            from: tx.from,
            data: tx.data || "0x",
            value: tx.value ? BigInt(tx.value) : undefined,
        });
        gasUsed = Number(gasEst);
    } catch (err: unknown) {
        success = false;
        if (err instanceof Error) {
            revertReason = err.message.includes("execution reverted")
                ? err.message
                : "Transaction will revert";
        }
    }

    // Detect balance changes by reading ERC-20 Transfer events via eth_call logs simulation
    const balanceChanges: BalanceChange[] = [];
    const events: EmittedEvent[] = [];

    // Naive: try to decode ERC-20 data if it's a transfer/approve
    if (tx.data && tx.data.length >= 10) {
        const selector = tx.data.slice(0, 10).toLowerCase();
        // ERC-20 transfer
        if (selector === "0xa9059cbb") {
            try {
                const iface = new ethers.Interface([
                    "function transfer(address to, uint256 amount)",
                ]);
                const decoded = iface.parseTransaction({ data: tx.data });
                if (decoded) {
                    const token = tx.to || "unknown token";
                    const symbol = await getTokenSymbol(token, provider);
                    const decimals = await getTokenDecimals(token, provider);
                    const amt = ethers.formatUnits(decoded.args[1], decimals);
                    balanceChanges.push(
                        { address: tx.from || "sender", token: symbol, tokenAddress: token, delta: `-${amt}`, deltaRaw: decoded.args[1].toString() },
                        { address: decoded.args[0], token: symbol, tokenAddress: token, delta: `+${amt}`, deltaRaw: decoded.args[1].toString() }
                    );
                    events.push({
                        name: "Transfer",
                        address: token,
                        params: { from: tx.from || "sender", to: decoded.args[0], value: amt },
                    });
                }
            } catch { /* ignore */ }
        }
    }

    const gasLimit = tx.gasLimit ? Number(BigInt(tx.gasLimit)) : gasUsed + 10000;

    return {
        success,
        gasUsed,
        gasLimit,
        gasUsedPercent: Math.round((gasUsed / gasLimit) * 100),
        balanceChanges,
        events,
        revertReason,
        backend: "eth_call",
    };
}

// ─── Tenderly backend ─────────────────────────────────────────────────────────
async function simulateViaTenderly(
    tx: RawTxInput,
    tenderlyKey: string,
    chainId = 1
): Promise<SimulationResult> {
    const NETWORK_ID = String(chainId);

    try {
        const res = await axios.post(
            `https://api.tenderly.co/api/v1/simulate`,
            {
                network_id: NETWORK_ID,
                from: tx.from || "0x0000000000000000000000000000000000000000",
                to: tx.to || "0x",
                input: tx.data || "0x",
                value: tx.value || "0",
                gas: tx.gasLimit ? Number(BigInt(tx.gasLimit)) : 200000,
                gas_price: "0",
                save: false,
                save_if_fails: false,
            },
            {
                headers: {
                    "X-Access-Key": tenderlyKey,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        const sim = res.data?.transaction;
        const gasUsed = sim?.gas_used || 21000;
        const gasLimit = tx.gasLimit ? Number(BigInt(tx.gasLimit)) : gasUsed + 10000;
        const success = sim?.status ?? true;
        const revertReason = sim?.error_message || null;

        // Parse state diff for balance/token changes
        const balanceChanges: BalanceChange[] = [];
        const events: EmittedEvent[] = [];

        const logs = res.data?.transaction?.transaction_info?.logs || [];
        for (const log of logs) {
            const name = log.name || "Event";
            const params: Record<string, string> = {};
            for (const inp of log.inputs || []) {
                params[inp.solname || inp.name] = String(inp.value);
            }
            events.push({ name, address: log.raw?.address || "", params });
        }

        return {
            success,
            gasUsed,
            gasLimit,
            gasUsedPercent: Math.round((gasUsed / gasLimit) * 100),
            balanceChanges,
            events,
            revertReason,
            backend: "tenderly",
        };
    } catch (err: unknown) {
        // Fallback to noting simulation failed
        return {
            success: false,
            gasUsed: 0,
            gasLimit: tx.gasLimit ? Number(BigInt(tx.gasLimit)) : 200000,
            gasUsedPercent: 0,
            balanceChanges: [],
            events: [],
            revertReason: err instanceof Error ? err.message : "Tenderly simulation failed",
            backend: "tenderly",
        };
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getTokenSymbol(
    address: string,
    provider: ethers.JsonRpcProvider
): Promise<string> {
    try {
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        return await contract.symbol();
    } catch {
        return address.slice(0, 8) + "...";
    }
}

async function getTokenDecimals(
    address: string,
    provider: ethers.JsonRpcProvider
): Promise<number> {
    try {
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        return Number(await contract.decimals());
    } catch {
        return 18;
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function simulateTx(
    tx: RawTxInput,
    rpcUrl: string,
    tenderlyKey?: string,
    chainId?: number
): Promise<SimulationResult> {
    if (tenderlyKey) {
        return simulateViaTenderly(tx, tenderlyKey, chainId ?? 1);
    }
    return simulateViaRpc(tx, rpcUrl);
}
