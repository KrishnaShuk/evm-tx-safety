"use client";

import { useState } from "react";
import type { AnalysisResult } from "@evm-safety/core";
import { CHAINS } from "./lib/chains";
import type { InputMode } from "./lib/types";
import { shortAddr } from "./lib/format";
import { CopyButton } from "./components/CopyButton";
import { ScoreBadge } from "./components/ScoreBadge";
import { SeverityBadge } from "./components/SeverityBadge";
import { TxTypeBadge } from "./components/TxTypeBadge";
import { ConfidenceBadge } from "./components/ConfidenceBadge";
import { CallTree } from "./components/CallTree";
import { CapabilityChips } from "./components/CapabilityChips";
import { GasBar } from "./components/GasBar";
import { LoadingState } from "./components/LoadingState";

/* ──────────────────────────────────────────── */
/* MAIN PAGE                                    */
/* ──────────────────────────────────────────── */
export default function Home() {
    const [mode, setMode] = useState<InputMode>("hash");
    const [txHash, setTxHash] = useState("");
    const [rawHex, setRawHex] = useState("");
    const [fields, setFields] = useState({ to: "", from: "", data: "", value: "", gasLimit: "" });
    const [rpcUrl, setRpcUrl] = useState(CHAINS[0].rpc);
    const [tenderlyKey, setTenderlyKey] = useState("");
    const [chainId, setChainId] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadStep, setLoadStep] = useState(0);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showRaw, setShowRaw] = useState(false);

    const selectedChain = CHAINS.find(c => c.id === chainId) ?? CHAINS[0];

    function handleChainChange(id: number) {
        setChainId(id);
        const chain = CHAINS.find(c => c.id === id);
        if (chain) setRpcUrl(chain.rpc);
    }

    async function handleAnalyze() {
        setLoading(true);
        setError(null);
        setResult(null);
        setLoadStep(0);

        // Animate step progress
        const stepTimer1 = setTimeout(() => setLoadStep(1), 800);
        const stepTimer2 = setTimeout(() => setLoadStep(2), 1600);

        const tx =
            mode === "hash"
                ? txHash.trim()
                : mode === "hex"
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
            clearTimeout(stepTimer1);
            clearTimeout(stepTimer2);
            setLoading(false);
        }
    }

    const canAnalyze =
        mode === "hash"
            ? /^0x[0-9a-fA-F]{64}$/.test(txHash.trim())
            : mode === "hex"
                ? rawHex.trim().length > 10
                : fields.to.length > 0 || fields.data.length > 2;

    return (
        <main className="page-wrap">

            {/* ── HERO ── */}
            <div className="header">
                <div className="header-badge">
                    <span className="pulse-dot" />
                    EVM Transaction Safety
                </div>
                <h1>Analyze Before You Sign</h1>
                <p>
                    Decode, simulate, and safety-check any Ethereum transaction
                    before broadcasting it to the network.
                </p>
                <div className="header-chips">
                    <span className="header-chip">🔓 Decode Calldata</span>
                    <span className="header-chip">🧪 Simulate Execution</span>
                    <span className="header-chip">🛡 Safety Scoring</span>
                    <span className="header-chip">⛓ 6 Networks</span>
                </div>
            </div>

            {/* ── INPUT PANEL ── */}
            <div className="card">
                <div className="card-title">
                    <span className="card-title-icon">🔬</span>
                    Transaction Input
                </div>

                {/* Mode tabs */}
                <div className="tabs">
                    <button
                        className={`tab ${mode === "hash" ? "active" : ""}`}
                        onClick={() => setMode("hash")}
                        id="tab-hash"
                    >
                        Tx Hash
                    </button>
                    <button
                        className={`tab ${mode === "hex" ? "active" : ""}`}
                        onClick={() => setMode("hex")}
                        id="tab-hex"
                    >
                        Signed Hex
                    </button>
                    <button
                        className={`tab ${mode === "fields" ? "active" : ""}`}
                        onClick={() => setMode("fields")}
                        id="tab-fields"
                    >
                        Calldata / Fields
                    </button>
                </div>

                {mode === "hash" ? (
                    <div className="form-group">
                        <label className="form-label" htmlFor="tx-hash">
                            Transaction Hash
                            <span className="label-badge">on-chain</span>
                        </label>
                        <input
                            id="tx-hash"
                            className="form-input"
                            placeholder="0x9f1c…"
                            value={txHash}
                            onChange={e => setTxHash(e.target.value)}
                            style={{ fontFamily: "'JetBrains Mono',monospace" }}
                        />
                        <p className="field-hint">
                            The transaction is fetched from the selected chain before decoding, then simulated.
                        </p>
                    </div>
                ) : mode === "hex" ? (
                    <div className="form-group">
                        <label className="form-label" htmlFor="raw-hex">
                            Signed Transaction Hex
                            <span className="label-badge">RLP-encoded</span>
                        </label>
                        <textarea
                            id="raw-hex"
                            className="form-textarea"
                            placeholder="0x02f87601808459682f00851176592e0082520894…"
                            value={rawHex}
                            onChange={e => setRawHex(e.target.value)}
                            style={{ minHeight: 96, fontSize: 12 }}
                        />
                    </div>
                ) : (
                    <>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-to">To Address</label>
                                <input
                                    id="field-to"
                                    className="form-input"
                                    placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE…"
                                    value={fields.to}
                                    onChange={e => setFields({ ...fields, to: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-from">From Address</label>
                                <input
                                    id="field-from"
                                    className="form-input"
                                    placeholder="0xYourWallet…"
                                    value={fields.from}
                                    onChange={e => setFields({ ...fields, from: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="field-data">
                                Calldata
                                <span className="label-badge">hex</span>
                            </label>
                            <input
                                id="field-data"
                                className="form-input"
                                placeholder="0x095ea7b3…"
                                value={fields.data}
                                onChange={e => setFields({ ...fields, data: e.target.value })}
                            />
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-value">
                                    Value
                                    <span className="label-badge">wei</span>
                                </label>
                                <input
                                    id="field-value"
                                    className="form-input"
                                    placeholder="0"
                                    value={fields.value}
                                    onChange={e => setFields({ ...fields, value: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-gas">Gas Limit</label>
                                <input
                                    id="field-gas"
                                    className="form-input"
                                    placeholder="200000"
                                    value={fields.gasLimit}
                                    onChange={e => setFields({ ...fields, gasLimit: e.target.value })}
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* Network + RPC */}
                <div className="form-grid" style={{ marginTop: "0.25rem" }}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="select-chain">Network</label>
                        <div style={{ position: "relative" }}>
                            <select
                                id="select-chain"
                                className="form-select form-input"
                                value={chainId}
                                onChange={e => handleChainChange(Number(e.target.value))}
                                style={{ paddingLeft: 32 }}
                            >
                                {CHAINS.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span
                                className="chain-indicator"
                                style={{ background: selectedChain.color, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="rpc-url">
                            RPC URL
                            <span className="rpc-status-dot" />
                        </label>
                        <input
                            id="rpc-url"
                            className="form-input"
                            value={rpcUrl}
                            onChange={e => setRpcUrl(e.target.value)}
                        />
                    </div>
                </div>

                {/* Tenderly */}
                <div className="form-group">
                    <label className="form-label" htmlFor="tenderly-key">
                        Tenderly API Key
                        <span className="label-badge">optional</span>
                    </label>
                    <input
                        id="tenderly-key"
                        className="form-input"
                        type="password"
                        placeholder="Enables Tenderly when the server has TENDERLY_ACCOUNT and TENDERLY_PROJECT"
                        value={tenderlyKey}
                        onChange={e => setTenderlyKey(e.target.value)}
                    />
                    <p className="field-hint">
                        Without Tenderly, the analyzer tries a trace-capable RPC, then falls back to eth_call + gas estimation.
                    </p>
                </div>

                <button
                    className="btn btn-primary"
                    id="analyze-btn"
                    onClick={handleAnalyze}
                    disabled={loading || !canAnalyze}
                >
                    {loading ? "⏳ Analyzing…" : "🔍  Analyze Transaction"}
                </button>
            </div>

            {/* ── ERROR ── */}
            {error && !loading && (
                <div className="error-box" style={{ marginBottom: "1.25rem" }}>
                    <span className="error-icon">⚠️</span>
                    <div>
                        <p style={{ fontWeight: 700, color: "var(--red-2)", marginBottom: 4 }}>Analysis Failed</p>
                        <p className="text-secondary" style={{ fontSize: 13 }}>{error}</p>
                    </div>
                </div>
            )}

            {/* ── LOADING ── */}
            {loading && <LoadingState step={loadStep} />}

            {/* ── RESULTS ── */}
            {result && !loading && (
                <>
                    {/* ── Decoded Transaction ── */}
                    <div className="card">
                        <div className="card-title">
                            <span className="card-title-icon">📜</span>
                            Decoded Transaction
                            <span style={{ marginLeft: "auto" }}>
                                <span className="badge badge-cyan">{result.decoded.txTypeEIP}</span>
                            </span>
                        </div>

                        <div className="tx-summary">
                            <span className="tx-summary-label">What this does</span>
                            <p>{result.decoded.summary}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "1.25rem" }}>
                            <TxTypeBadge type={result.decoded.type} />
                            <ConfidenceBadge confidence={result.decoded.signatureConfidence} />
                            {result.decoded.contractName && (
                                <span className="text-secondary" style={{ fontSize: 13 }}>
                                    — {result.decoded.contractName}
                                </span>
                            )}
                            {result.decoded.txHash && (
                                <span className="tx-hash-chip" title={result.decoded.txHash}>
                                    {shortAddr(result.decoded.txHash)} <CopyButton text={result.decoded.txHash} />
                                </span>
                            )}
                        </div>

                        {result.decoded.functionSignature && (
                            <div style={{ marginBottom: "1.25rem" }}>
                                <div className="section-label">Function</div>
                                <div className="fn-sig">
                                    <code>{result.decoded.functionSignature}</code>
                                    <CopyButton text={result.decoded.functionSignature} />
                                </div>
                            </div>
                        )}

                        {result.decoded.params.length > 0 && (
                            <div style={{ marginBottom: "1.25rem" }}>
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
                                                <td>
                                                    {p.value.includes("MAX_UINT256") ? (
                                                        <span className="max-uint-warn">
                                                            ⚠ {p.value}
                                                        </span>
                                                    ) : p.value}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {result.decoded.calls.some(call => (call.children?.length ?? 0) > 0) && (
                            <div style={{ marginBottom: "1.25rem" }}>
                                <div className="section-label">Execution Path</div>
                                <CallTree calls={result.decoded.calls} />
                            </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className="metric-pair">
                                <div className="metric-label">Value</div>
                                <div className="metric-val">{result.decoded.valueEth} ETH</div>
                            </div>
                            <div className="metric-pair">
                                <div className="metric-label">Gas Limit</div>
                                <div className="metric-val">{Number(result.decoded.gasLimit).toLocaleString()}</div>
                            </div>
                        </div>

                        {result.decoded.rawData && result.decoded.rawData !== "0x" && (
                            <div style={{ marginTop: "1.25rem" }}>
                                <button className="collapsible-toggle" onClick={() => setShowRaw(!showRaw)}>
                                    {showRaw ? "▾" : "▸"} Raw Calldata
                                </button>
                                {showRaw && (
                                    <div className="raw-data-box">{result.decoded.rawData}</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Simulation ── */}
                    <div className="card">
                        <div className="card-title">
                            <span className="card-title-icon">🧪</span>
                            Simulation Result
                            <span style={{ marginLeft: "auto" }}>
                                <span className="badge badge-indigo" style={{ fontSize: 10 }}>
                                    {result.simulation.backend}
                                </span>
                            </span>
                        </div>

                        <div className={`sim-status-pill ${result.simulation.status === "success" ? "success" : result.simulation.status === "revert" ? "fail" : "unavailable"}`}>
                            <span style={{ fontSize: 20 }}>
                                {result.simulation.status === "success" ? "✅" : result.simulation.status === "revert" ? "❌" : "⚠"}
                            </span>
                            {result.simulation.status === "success" && "Transaction will succeed"}
                            {result.simulation.status === "revert" && "Transaction will revert"}
                            {result.simulation.status === "unavailable" && "Execution could not be simulated"}
                        </div>

                        {result.simulation.status === "revert" && result.simulation.revertReason && (
                            <div className="revert-box" style={{ marginBottom: "1.25rem" }}>
                                <div className="revert-label">Revert Reason</div>
                                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                                    {result.simulation.revertReason}
                                </p>
                            </div>
                        )}

                        {result.simulation.status === "unavailable" && result.simulation.error && (
                            <div className="revert-box" style={{ marginBottom: "1.25rem", background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)" }}>
                                <div className="revert-label" style={{ color: "var(--amber-2)" }}>
                                    {result.simulation.error.code}
                                </div>
                                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                                    {result.simulation.error.message}
                                </p>
                            </div>
                        )}

                        <div className="section-label">Simulation Coverage</div>
                        <CapabilityChips capabilities={result.simulation.capabilities} />

                        {result.simulation.status !== "unavailable" && (
                            <>
                                <div className="section-label" style={{ marginTop: "1.25rem" }}>Gas Usage</div>
                                <GasBar used={result.simulation.gasUsed} limit={result.simulation.gasLimit} />
                            </>
                        )}

                        {result.simulation.balanceChanges.length > 0 && (
                            <div style={{ marginTop: "1.5rem" }}>
                                <div className="section-label">Balance Changes</div>
                                {result.simulation.balanceChanges.map((bc, i) => (
                                    <div key={i} className="balance-row">
                                        <span className="monospace text-secondary" style={{ fontSize: 12 }}>
                                            {shortAddr(bc.address)}
                                        </span>
                                        <span className="balance-delta" style={{
                                            color: bc.direction === "in" ? "var(--green-2)" : "var(--red-2)"
                                        }}>
                                            {bc.direction === "in" ? "↑" : "↓"} {bc.delta} {bc.token}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {result.simulation.approvals.length > 0 && (
                            <div style={{ marginTop: "1.5rem" }}>
                                <div className="section-label">Approvals</div>
                                {result.simulation.approvals.map((approval, i) => (
                                    <div key={i} className="balance-row">
                                        <span className="monospace text-secondary" style={{ fontSize: 12 }}>
                                            {shortAddr(approval.owner)} → {shortAddr(approval.spender)}
                                        </span>
                                        <span className="balance-delta" style={{ color: "var(--amber-2)" }}>
                                            {approval.kind === "all"
                                                ? (approval.approved ? "all NFTs" : "revoked")
                                                : `${approval.amount ?? "?"} ${approval.token}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {result.simulation.stateChanges.length > 0 && (
                            <div style={{ marginTop: "1.5rem" }}>
                                <div className="section-label">State Changes ({result.simulation.stateChanges.length})</div>
                                {result.simulation.stateChanges.slice(0, 20).map((change, i) => (
                                    <div key={i} className="state-row">
                                        <span className="monospace text-secondary">{shortAddr(change.address)}</span>
                                        <span className="badge badge-blue">{change.kind}</span>
                                        <span className="monospace state-value">
                                            {change.key ? `${shortAddr(change.key)}: ` : ""}
                                            {change.before ? `${shortAddr(change.before)} → ` : ""}
                                            {shortAddr(change.after ?? "")}
                                        </span>
                                    </div>
                                ))}
                                {result.simulation.stateChanges.length > 20 && (
                                    <p className="field-hint">Showing 20 of {result.simulation.stateChanges.length}. Use the API or CLI --json for all.</p>
                                )}
                            </div>
                        )}

                        {result.simulation.events.length > 0 && (
                            <div style={{ marginTop: "1.5rem" }}>
                                <div className="section-label">Emitted Events</div>
                                <div className="events-list">
                                    {result.simulation.events.slice(0, 30).map((ev, i) => (
                                        <div key={i} className="event-item">
                                            <div className="event-name">
                                                {ev.name} <span className="text-muted">· {shortAddr(ev.address)}</span>
                                            </div>
                                            {Object.entries(ev.params).map(([k, v]) => (
                                                <div key={k} className="event-param">
                                                    {k}: <span>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.simulation.notes.length > 0 && (
                            <div style={{ marginTop: "1.5rem" }}>
                                <div className="section-label">Backend Notes</div>
                                {result.simulation.notes.map((note, i) => (
                                    <p key={i} className="field-hint">— {note}</p>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Safety Report ── */}
                    <div className="card">
                        <div className="card-title">
                            <span className="card-title-icon">🛡️</span>
                            Safety Report
                        </div>

                        <div className={`score-banner score-${result.safety.score.toLowerCase()}`}>
                            <div className="score-line" />
                            <div>
                                <div className="score-label-text" style={{
                                    color: result.safety.score === "SAFE"
                                        ? "var(--green-2)"
                                        : result.safety.score === "WARNINGS"
                                            ? "var(--amber-2)"
                                            : "var(--red-2)"
                                }}>
                                    {result.safety.score === "SAFE" && "✓ All checks passed"}
                                    {result.safety.score === "WARNINGS" && `⚠ ${result.safety.warnings.length} warning${result.safety.warnings.length > 1 ? "s" : ""} found`}
                                    {result.safety.score === "DANGEROUS" && `🚨 ${result.safety.warnings.length} critical issue${result.safety.warnings.length > 1 ? "s" : ""} detected`}
                                </div>
                                <div className="score-sub">
                                    {result.safety.score === "SAFE"
                                        ? "This transaction looks safe to send."
                                        : "Review the warnings below before signing."}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="risk-score">Risk {result.safety.riskScore}/100</span>
                                <ScoreBadge score={result.safety.score} />
                            </div>
                        </div>

                        {result.safety.warnings.map((w, i) => (
                            <div
                                key={i}
                                className={`warning-item severity-${w.severity.toLowerCase()}`}
                            >
                                <div className="warning-header">
                                    <SeverityBadge s={w.severity} />
                                    <span className="warning-rule">{w.rule}</span>
                                    <span className="badge badge-blue">{w.confidence}</span>
                                </div>
                                <p className="warning-message">{w.message}</p>
                                <p className="warning-rec">
                                    <span style={{ flexShrink: 0 }}>💡</span>
                                    {w.recommendation}
                                </p>
                                {w.evidence && Object.keys(w.evidence).length > 0 && (
                                    <details className="warning-evidence">
                                        <summary>Evidence</summary>
                                        <pre>{JSON.stringify(w.evidence, null, 2)}</pre>
                                    </details>
                                )}
                            </div>
                        ))}

                        {result.safety.warnings.length === 0 && (
                            <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-muted)", fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                                No warnings — transaction appears safe to proceed.
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Footer ── */}
            <div style={{ textAlign: "center", marginTop: "3rem", color: "var(--text-muted)", fontSize: 12 }}>
                <span>EVM TX Safety v0.6 · Decode · Simulate · Protect</span>
            </div>

        </main>
    );
}
