"use client";

import { useState } from "react";
import type { AnalysisResult } from "@evm-safety/core";

const CHAINS = [
    { id: 1, name: "Ethereum Mainnet", rpc: "https://eth.llamarpc.com" },
    { id: 137, name: "Polygon", rpc: "https://polygon.llamarpc.com" },
    { id: 42161, name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc" },
    { id: 8453, name: "Base", rpc: "https://mainnet.base.org" },
    { id: 10, name: "Optimism", rpc: "https://mainnet.optimism.io" },
    { id: 56, name: "BNB Chain", rpc: "https://bsc-dataseed.binance.org" },
];

type InputMode = "hex" | "fields";

function Skeleton() {
    return (
        <div>
            {[100, 80, 65, 90].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: `${w}%` }} />
            ))}
        </div>
    );
}

function ScoreBadge({ score }: { score: string }) {
    if (score === "SAFE") return <span className="badge badge-green">✓ Safe</span>;
    if (score === "WARNINGS") return <span className="badge badge-amber">⚠ Warnings</span>;
    return <span className="badge badge-red">✕ Dangerous</span>;
}

function SeverityBadge({ s }: { s: string }) {
    if (s === "HIGH") return <span className="badge badge-red">{s}</span>;
    if (s === "MEDIUM") return <span className="badge badge-amber">{s}</span>;
    return <span className="badge badge-yellow">{s}</span>;
}

function TxTypeBadge({ type }: { type: string }) {
    const map: Record<string, string> = {
        "ERC-20 Approve": "badge-red",
        "ERC-20 Transfer": "badge-blue",
        "ETH Transfer": "badge-purple",
        "Uniswap Swap": "badge-blue",
        "ERC-721 Transfer": "badge-purple",
        "Contract Deployment": "badge-amber",
    };
    return <span className={`badge ${map[type] || "badge-blue"}`}>{type}</span>;
}

function GasBar({ used, limit }: { used: number; limit: number }) {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const color = pct > 85 ? "var(--red)" : pct > 60 ? "var(--amber)" : "var(--green)";
    return (
        <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontSize: 13 }}>
                    {used.toLocaleString()} / {limit.toLocaleString()} gas
                </span>
                <span style={{ fontSize: 12, color }}>{pct}%</span>
            </div>
            <div className="gas-bar-wrap">
                <div className="gas-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

export default function Home() {
    const [mode, setMode] = useState<InputMode>("hex");
    const [rawHex, setRawHex] = useState("");
    const [fields, setFields] = useState({ to: "", from: "", data: "", value: "", gasLimit: "" });
    const [rpcUrl, setRpcUrl] = useState(CHAINS[0].rpc);
    const [tenderlyKey, setTenderlyKey] = useState("");
    const [chainId, setChainId] = useState(1);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showRaw, setShowRaw] = useState(false);

    function handleChainChange(id: number) {
        setChainId(id);
        const chain = CHAINS.find((c) => c.id === id);
        if (chain) setRpcUrl(chain.rpc);
    }

    async function handleAnalyze() {
        setLoading(true);
        setError(null);
        setResult(null);

        const tx =
            mode === "hex"
                ? rawHex.trim()
                : {
                    to: fields.to || undefined,
                    from: fields.from || undefined,
                    data: fields.data || "0x",
                    value: fields.value || "0",
                    gasLimit: fields.gasLimit || "200000",
                };

        try {
            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tx, rpcUrl, tenderlyKey: tenderlyKey || undefined, chainId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Analysis failed");
            setResult(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    const canAnalyze = mode === "hex" ? rawHex.trim().length > 10 : fields.to.length > 0 || fields.data.length > 2;

    return (
        <main className="page-wrap">
            {/* Header */}
            <div className="header">
                <div className="header-badge">⛓ EVM Transaction Safety</div>
                <h1>Analyze Before You Sign</h1>
                <p>Decode, simulate, and safety-check any Ethereum transaction before broadcasting it to the network.</p>
            </div>

            {/* ── Input Panel ── */}
            <div className="card">
                <div className="card-title"><span className="icon">🔬</span> Transaction Input</div>

                <div className="tabs">
                    <button className={`tab ${mode === "hex" ? "active" : ""}`} onClick={() => setMode("hex")}>Raw Hex</button>
                    <button className={`tab ${mode === "fields" ? "active" : ""}`} onClick={() => setMode("fields")}>Fields</button>
                </div>

                {mode === "hex" ? (
                    <div className="form-group">
                        <label className="form-label">Raw Signed Transaction Hex</label>
                        <textarea
                            className="form-textarea"
                            placeholder="0x02f87601808459682f00851176592e0082520894..."
                            value={rawHex}
                            onChange={(e) => setRawHex(e.target.value)}
                            style={{ minHeight: 90, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}
                        />
                    </div>
                ) : (
                    <>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">To Address</label>
                                <input className="form-input" placeholder="0xA0b8..." value={fields.to} onChange={(e) => setFields({ ...fields, to: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">From Address</label>
                                <input className="form-input" placeholder="0xYourWallet..." value={fields.from} onChange={(e) => setFields({ ...fields, from: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Calldata (hex)</label>
                            <input className="form-input" placeholder="0x095ea7b3..." value={fields.data} onChange={(e) => setFields({ ...fields, data: e.target.value })} />
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Value (wei)</label>
                                <input className="form-input" placeholder="0" value={fields.value} onChange={(e) => setFields({ ...fields, value: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Gas Limit</label>
                                <input className="form-input" placeholder="200000" value={fields.gasLimit} onChange={(e) => setFields({ ...fields, gasLimit: e.target.value })} />
                            </div>
                        </div>
                    </>
                )}

                <div className="form-grid" style={{ marginTop: "0.25rem" }}>
                    <div className="form-group">
                        <label className="form-label">Network</label>
                        <select className="form-select form-input" value={chainId} onChange={(e) => handleChainChange(Number(e.target.value))}>
                            {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">RPC URL</label>
                        <input className="form-input" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Tenderly API Key <span className="text-muted">(optional — enables full state simulation)</span></label>
                    <input className="form-input" type="password" placeholder="••••••••" value={tenderlyKey} onChange={(e) => setTenderlyKey(e.target.value)} />
                </div>

                <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading || !canAnalyze}>
                    {loading ? "⏳ Analyzing..." : "🔍 Analyze Transaction"}
                </button>
            </div>

            {error && (
                <div className="card" style={{ border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.06)" }}>
                    <p className="text-red" style={{ fontWeight: 600 }}>Error</p>
                    <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{error}</p>
                </div>
            )}

            {loading && (
                <div className="card"><div className="card-title"><span>📡</span> Analyzing…</div><Skeleton /></div>
            )}

            {result && !loading && (
                <>
                    {/* ── Decoded Transaction ── */}
                    <div className="card">
                        <div className="card-title"><span className="icon">📜</span> Decoded Transaction</div>
                        <div className="flex items-center gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
                            <TxTypeBadge type={result.decoded.type} />
                            <span className="badge badge-blue">{result.decoded.txTypeEIP}</span>
                            {result.decoded.contractName && (
                                <span className="text-secondary" style={{ fontSize: 13 }}>— {result.decoded.contractName}</span>
                            )}
                        </div>

                        {result.decoded.functionSignature && (
                            <div style={{ marginBottom: "1rem" }}>
                                <div className="section-label">Function</div>
                                <code className="monospace" style={{ fontSize: 13, color: "var(--accent-blue)" }}>
                                    {result.decoded.functionSignature}
                                </code>
                            </div>
                        )}

                        {result.decoded.params.length > 0 && (
                            <div style={{ marginBottom: "1rem" }}>
                                <div className="section-label">Parameters</div>
                                <table className="params-table">
                                    <thead>
                                        <tr><th>Name</th><th>Type</th><th>Value</th></tr>
                                    </thead>
                                    <tbody>
                                        {result.decoded.params.map((p, i) => (
                                            <tr key={i}>
                                                <td>{p.name}</td>
                                                <td>{p.type}</td>
                                                <td style={{ color: p.value.includes("MAX_UINT256") ? "var(--red)" : "var(--text-primary)" }}>
                                                    {p.value}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="form-grid">
                            <div>
                                <div className="section-label">Value</div>
                                <span className="monospace" style={{ fontSize: 13 }}>{result.decoded.valueEth} ETH</span>
                            </div>
                            <div>
                                <div className="section-label">Gas Limit</div>
                                <span className="monospace" style={{ fontSize: 13 }}>{Number(result.decoded.gasLimit).toLocaleString()}</span>
                            </div>
                        </div>

                        {result.decoded.rawData && result.decoded.rawData !== "0x" && (
                            <div style={{ marginTop: "1rem" }}>
                                <button className="collapsible-toggle" onClick={() => setShowRaw(!showRaw)}>
                                    {showRaw ? "▾" : "▸"} Raw Calldata
                                </button>
                                {showRaw && (
                                    <div style={{ background: "var(--bg-input)", borderRadius: 8, padding: "10px 14px", marginTop: 6, wordBreak: "break-all", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8 }}>
                                        {result.decoded.rawData}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Simulation ── */}
                    <div className="card">
                        <div className="card-title"><span className="icon">🧪</span> Simulation Result
                            <span className="badge badge-blue" style={{ marginLeft: "auto", fontSize: 10 }}>{result.simulation.backend}</span>
                        </div>

                        <div className="flex items-center gap-3" style={{ marginBottom: "1.25rem" }}>
                            {result.simulation.success
                                ? <span style={{ fontSize: 22 }}>✅</span>
                                : <span style={{ fontSize: 22 }}>❌</span>}
                            <span style={{ fontWeight: 600, fontSize: 15 }}>
                                {result.simulation.success ? "Transaction will succeed" : "Transaction will revert"}
                            </span>
                        </div>

                        {result.simulation.revertReason && (
                            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem" }}>
                                <span className="text-red" style={{ fontWeight: 600, fontSize: 12 }}>REVERT REASON</span>
                                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{result.simulation.revertReason}</p>
                            </div>
                        )}

                        <div className="section-label">Gas Usage</div>
                        <GasBar used={result.simulation.gasUsed} limit={result.simulation.gasLimit} />

                        {result.simulation.balanceChanges.length > 0 && (
                            <div style={{ marginTop: "1.25rem" }}>
                                <div className="section-label">Balance Changes</div>
                                {result.simulation.balanceChanges.map((bc, i) => (
                                    <div key={i} className="balance-row">
                                        <span className="monospace text-secondary" style={{ fontSize: 12 }}>
                                            {bc.address.slice(0, 10)}…{bc.address.slice(-6)}
                                        </span>
                                        <span style={{ fontWeight: 600 }}>
                                            <span className="monospace" style={{ fontSize: 12, color: bc.delta.startsWith("+") ? "var(--green)" : "var(--red)" }}>
                                                {bc.delta} {bc.token}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {result.simulation.events.length > 0 && (
                            <div style={{ marginTop: "1.25rem" }}>
                                <div className="section-label">Emitted Events</div>
                                <div className="events-list">
                                    {result.simulation.events.map((ev, i) => (
                                        <div key={i} className="event-item">
                                            <div className="event-name">{ev.name}</div>
                                            {Object.entries(ev.params).map(([k, v]) => (
                                                <div key={k} className="event-param">{k}: <span style={{ color: "var(--text-primary)" }}>{v}</span></div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Safety Report ── */}
                    <div className="card">
                        <div className="card-title"><span className="icon">🛡️</span> Safety Report</div>

                        <div className={`score-banner score-${result.safety.score.toLowerCase()}`}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>
                                    {result.safety.score === "SAFE" && "✓ All checks passed"}
                                    {result.safety.score === "WARNINGS" && `⚠ ${result.safety.warnings.length} warning${result.safety.warnings.length > 1 ? "s" : ""} found`}
                                    {result.safety.score === "DANGEROUS" && `🚨 ${result.safety.warnings.length} critical issue${result.safety.warnings.length > 1 ? "s" : ""} detected`}
                                </div>
                                <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                                    {result.safety.score === "SAFE" ? "This transaction looks safe to send." : "Review the warnings below before signing."}
                                </div>
                            </div>
                            <ScoreBadge score={result.safety.score} />
                        </div>

                        {result.safety.warnings.map((w, i) => (
                            <div key={i} className="warning-item">
                                <div className="warning-header">
                                    <SeverityBadge s={w.severity} />
                                    <span className="warning-rule">{w.rule}</span>
                                </div>
                                <p className="warning-message">{w.message}</p>
                                <p className="warning-rec">💡 {w.recommendation}</p>
                            </div>
                        ))}

                        {result.safety.warnings.length === 0 && (
                            <p className="text-secondary" style={{ fontSize: 13, textAlign: "center", padding: "1rem 0" }}>
                                No warnings — transaction appears safe.
                            </p>
                        )}
                    </div>
                </>
            )}
        </main>
    );
}
