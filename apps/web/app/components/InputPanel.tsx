"use client";

import { Hourglass, Search } from "lucide-react";
import type { Chain } from "../lib/chains";
import type { InputMode, TxFields } from "../lib/types";

export function InputPanel({
    mode,
    onModeChange,
    txHash,
    onTxHashChange,
    rawHex,
    onRawHexChange,
    fields,
    onFieldsChange,
    chains,
    chainId,
    onChainChange,
    rpcUrl,
    onRpcUrlChange,
    tenderlyKey,
    onTenderlyKeyChange,
    loading,
    canAnalyze,
    onAnalyze,
    compact,
}: {
    mode: InputMode;
    onModeChange: (mode: InputMode) => void;
    txHash: string;
    onTxHashChange: (value: string) => void;
    rawHex: string;
    onRawHexChange: (value: string) => void;
    fields: TxFields;
    onFieldsChange: (fields: TxFields) => void;
    chains: Chain[];
    chainId: number;
    onChainChange: (id: number) => void;
    rpcUrl: string;
    onRpcUrlChange: (value: string) => void;
    tenderlyKey: string;
    onTenderlyKeyChange: (value: string) => void;
    loading: boolean;
    canAnalyze: boolean;
    onAnalyze: () => void;
    compact?: boolean;
}) {
    const selectedChain = chains.find((chain) => chain.id === chainId) ?? chains[0];

    return (
        <div className="input-panel" data-compact={compact ? "true" : "false"}>
            <div className="tabs" role="tablist" aria-label="Transaction input mode">
                <button
                    type="button"
                    role="tab"
                    id="tab-hash"
                    aria-selected={mode === "hash"}
                    aria-controls="tabpanel-input"
                    tabIndex={mode === "hash" ? 0 : -1}
                    className={`tab ${mode === "hash" ? "active" : ""}`}
                    onClick={() => onModeChange("hash")}
                >
                    Tx Hash
                </button>
                <button
                    type="button"
                    role="tab"
                    id="tab-hex"
                    aria-selected={mode === "hex"}
                    aria-controls="tabpanel-input"
                    tabIndex={mode === "hex" ? 0 : -1}
                    className={`tab ${mode === "hex" ? "active" : ""}`}
                    onClick={() => onModeChange("hex")}
                >
                    Signed Hex
                </button>
                <button
                    type="button"
                    role="tab"
                    id="tab-fields"
                    aria-selected={mode === "fields"}
                    aria-controls="tabpanel-input"
                    tabIndex={mode === "fields" ? 0 : -1}
                    className={`tab ${mode === "fields" ? "active" : ""}`}
                    onClick={() => onModeChange("fields")}
                >
                    Calldata / Fields
                </button>
            </div>

            <div id="tabpanel-input" role="tabpanel" aria-labelledby={`tab-${mode}`}>
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
                            onChange={(e) => onTxHashChange(e.target.value)}
                            data-first-field="true"
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
                            onChange={(e) => onRawHexChange(e.target.value)}
                            data-first-field="true"
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
                                    onChange={(e) => onFieldsChange({ ...fields, to: e.target.value })}
                                    data-first-field="true"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-from">From Address</label>
                                <input
                                    id="field-from"
                                    className="form-input"
                                    placeholder="0xYourWallet…"
                                    value={fields.from}
                                    onChange={(e) => onFieldsChange({ ...fields, from: e.target.value })}
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
                                onChange={(e) => onFieldsChange({ ...fields, data: e.target.value })}
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
                                    onChange={(e) => onFieldsChange({ ...fields, value: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="field-gas">Gas Limit</label>
                                <input
                                    id="field-gas"
                                    className="form-input"
                                    placeholder="200000"
                                    value={fields.gasLimit}
                                    onChange={(e) => onFieldsChange({ ...fields, gasLimit: e.target.value })}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label className="form-label" htmlFor="select-chain">Network</label>
                    <div className="select-wrap">
                        <select
                            id="select-chain"
                            className="form-select form-input"
                            value={chainId}
                            onChange={(e) => onChainChange(Number(e.target.value))}
                        >
                            {chains.map((chain) => (
                                <option key={chain.id} value={chain.id}>{chain.name}</option>
                            ))}
                        </select>
                        <span className={`chain-dot chain-dot-${selectedChain.id}`} aria-hidden="true" />
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="rpc-url">
                        RPC URL
                        <span className="rpc-status-dot" aria-hidden="true" />
                    </label>
                    <input
                        id="rpc-url"
                        className="form-input"
                        value={rpcUrl}
                        onChange={(e) => onRpcUrlChange(e.target.value)}
                    />
                </div>
            </div>

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
                    onChange={(e) => onTenderlyKeyChange(e.target.value)}
                />
                <p className="field-hint">
                    Without Tenderly, the analyzer tries a trace-capable RPC, then falls back to eth_call + gas estimation.
                </p>
            </div>

            <button
                className="btn btn-primary"
                id="analyze-btn"
                type="button"
                onClick={onAnalyze}
                disabled={loading || !canAnalyze}
                aria-busy={loading}
            >
                {loading ? (
                    <><Hourglass size={16} strokeWidth={1.5} aria-hidden="true" /> Analyzing…</>
                ) : (
                    <><Search size={16} strokeWidth={1.5} aria-hidden="true" /> Analyze Transaction</>
                )}
            </button>
        </div>
    );
}
