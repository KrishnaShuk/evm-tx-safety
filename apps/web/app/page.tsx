"use client";

import { useCallback, useState } from "react";
import type { AnalysisResult } from "@evm-safety/core";
import { CHAINS } from "./lib/chains";
import type { InputMode, TxFields } from "./lib/types";
import { TopBar } from "./components/TopBar";
import { NetworkStrip } from "./components/NetworkStrip";
import { Panel } from "./components/Panel";
import { InputPanel } from "./components/InputPanel";
import { VerdictPanel } from "./components/VerdictPanel";
import { DecodedPanel } from "./components/DecodedPanel";
import { FunctionKeyBar } from "./components/FunctionKeyBar";
import { SafetyPanel } from "./components/SafetyPanel";
import { CallTree } from "./components/CallTree";
import { SimulationPanel } from "./components/SimulationPanel";
import { ActivityPanel } from "./components/ActivityPanel";
import { LoadingState } from "./components/LoadingState";

/* ──────────────────────────────────────────── */
/* MAIN PAGE                                    */
/* ──────────────────────────────────────────── */
export default function Home() {
    const [mode, setMode] = useState<InputMode>("hash");
    const [txHash, setTxHash] = useState("");
    const [rawHex, setRawHex] = useState("");
    const [fields, setFields] = useState<TxFields>({ to: "", from: "", data: "", value: "", gasLimit: "" });
    const [rpcUrl, setRpcUrl] = useState(CHAINS[0].rpc);
    const [tenderlyKey, setTenderlyKey] = useState("");
    const [chainId, setChainId] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadStep, setLoadStep] = useState(0);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);

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

    const statusInput =
        mode === "hash" ? txHash : mode === "hex" ? rawHex : fields.to || fields.data;

    const focusInput = useCallback(() => {
        document.querySelector<HTMLElement>("#panel-input [data-first-field]")?.focus();
    }, []);

    const scrollToPanel = useCallback((id: string) => {
        const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(id)?.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "start",
        });
    }, []);

    const goVerdict = useCallback(() => scrollToPanel("panel-verdict"), [scrollToPanel]);
    const goSafety = useCallback(() => scrollToPanel("panel-safety"), [scrollToPanel]);
    const openRawLog = useCallback(() => {
        scrollToPanel("panel-backend");
        const details = document.querySelector<HTMLDetailsElement>("#panel-backend details");
        if (details) details.open = true;
    }, [scrollToPanel]);

    return (
        <>
            <a className="skip-link" href="#results">Skip to results</a>

            <TopBar
                mode={mode}
                input={statusInput}
                chainName={selectedChain.name}
                version={result?.meta.version}
            />
            <NetworkStrip chains={CHAINS} chainId={chainId} onSelect={handleChainChange} />

            <main className="page-wrap">
                <div id="results" className="grid">

                    {/* ── 01 TRANSACTION INPUT ── */}
                    <Panel num="01" title="Transaction Input" id="panel-input" className="panel-span-2">
                        <InputPanel
                            mode={mode}
                            onModeChange={setMode}
                            txHash={txHash}
                            onTxHashChange={setTxHash}
                            rawHex={rawHex}
                            onRawHexChange={setRawHex}
                            fields={fields}
                            onFieldsChange={setFields}
                            chains={CHAINS}
                            chainId={chainId}
                            onChainChange={handleChainChange}
                            rpcUrl={rpcUrl}
                            onRpcUrlChange={setRpcUrl}
                            tenderlyKey={tenderlyKey}
                            onTenderlyKeyChange={setTenderlyKey}
                            loading={loading}
                            canAnalyze={canAnalyze}
                            onAnalyze={handleAnalyze}
                            compact={!!result}
                        />
                    </Panel>

                    {/* ── ERROR ── */}
                    {error && !loading && (
                        <div className="panel-span-2">
                            <div className="error-box">
                                <span className="error-icon">⚠️</span>
                                <div>
                                    <p style={{ fontWeight: 700, color: "var(--neg)", marginBottom: 4 }}>Analysis Failed</p>
                                    <p className="text-secondary">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── LOADING ── */}
                    {loading && (
                        <div className="panel-span-2">
                            <LoadingState step={loadStep} />
                        </div>
                    )}

                    {/* ── RESULTS ── */}
                    {result && !loading && (
                        <>
                            {/* ── 02 VERDICT ── */}
                            <Panel num="02" title="Verdict" id="panel-verdict" className="panel-span-2">
                                <VerdictPanel result={result} />
                            </Panel>

                            {/* ── 03 DECODED TRANSACTION ── */}
                            <Panel
                                num="03"
                                title="Decoded Transaction"
                                id="panel-decoded"
                                right={<span className="badge badge-cyan">{result.decoded.txTypeEIP}</span>}
                            >
                                <DecodedPanel decoded={result.decoded} />
                            </Panel>

                            {/* ── 04 EXECUTION PATH ── */}
                            {result.decoded.calls.some(call => (call.children?.length ?? 0) > 0) && (
                                <Panel num="04" title="Execution Path" id="panel-path">
                                    <CallTree calls={result.decoded.calls} />
                                </Panel>
                            )}

                            {/* ── 05 SIMULATION RESULT ── */}
                            <Panel
                                num="05"
                                title="Simulation Result"
                                id="panel-simulation"
                                right={<span className="badge badge-indigo">{result.simulation.backend}</span>}
                            >
                                <SimulationPanel simulation={result.simulation} />

                                {result.simulation.notes.length > 0 && (
                                    <div>
                                        <div className="section-label">Backend Notes</div>
                                        {result.simulation.notes.map((note, i) => (
                                            <p key={i} className="field-hint">— {note}</p>
                                        ))}
                                    </div>
                                )}
                            </Panel>

                            {/* ── 06 BALANCES, APPROVALS, STATE, EVENTS ── */}
                            {(result.simulation.balanceChanges.length > 0 ||
                                result.simulation.approvals.length > 0 ||
                                result.simulation.stateChanges.length > 0 ||
                                result.simulation.events.length > 0) && (
                                <Panel
                                    num="06"
                                    title="Balances, Approvals, State, Events"
                                    id="panel-activity"
                                    className="panel-span-2"
                                >
                                    <ActivityPanel simulation={result.simulation} />
                                </Panel>
                            )}

                            {/* ── 07 SAFETY REPORT ── */}
                            <Panel num="07" title="Safety Report" id="panel-safety">
                                <SafetyPanel safety={result.safety} />
                            </Panel>
                        </>
                    )}

                </div>

                <div className="footer">
                    EVM TX Safety v0.6 · Decode · Simulate · Protect
                </div>
            </main>

            <FunctionKeyBar
                onFocusInput={focusInput}
                onVerdict={goVerdict}
                onSafety={goSafety}
                onRawLog={openRawLog}
            />
        </>
    );
}
