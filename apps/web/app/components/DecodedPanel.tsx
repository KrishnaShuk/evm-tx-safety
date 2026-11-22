"use client";

import { useState } from "react";
import type { AnalysisResult } from "@evm-safety/core";
import { TriangleAlert } from "lucide-react";
import { shortAddr } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { TxTypeBadge } from "./TxTypeBadge";

export function DecodedPanel({ decoded }: { decoded: AnalysisResult["decoded"] }) {
    const [showRaw, setShowRaw] = useState(false);

    return (
        <>
            <div className="decoded-tags">
                <TxTypeBadge type={decoded.type} />
                <ConfidenceBadge confidence={decoded.signatureConfidence} />
                {decoded.txHash && (
                    <span className="tx-hash-chip" title={decoded.txHash}>
                        {shortAddr(decoded.txHash)} <CopyButton text={decoded.txHash} />
                    </span>
                )}
            </div>

            <div className="kv-list">
                <div className="kv">
                    <span className="kv-k">Value</span>
                    <span className="kv-v">{decoded.valueEth} ETH</span>
                </div>
                <div className="kv">
                    <span className="kv-k">Gas Limit</span>
                    <span className="kv-v">{Number(decoded.gasLimit).toLocaleString()}</span>
                </div>
                {decoded.contractName && (
                    <div className="kv">
                        <span className="kv-k">Contract</span>
                        <span className="kv-v">{decoded.contractName}</span>
                    </div>
                )}
                {decoded.functionSignature && (
                    <div className="kv">
                        <span className="kv-k">Function</span>
                        <span className="kv-v">
                            <code>{decoded.functionSignature}</code>{" "}
                            <CopyButton text={decoded.functionSignature} />
                        </span>
                    </div>
                )}
            </div>

            {decoded.params.length > 0 && (
                <div>
                    <div className="section-label">Parameters</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead>
                                <tr><th>Name</th><th>Type</th><th>Value</th></tr>
                            </thead>
                            <tbody>
                                {decoded.params.map((p, i) => (
                                    <tr key={i}>
                                        <td>{p.name}</td>
                                        <td>{p.type}</td>
                                        <td>
                                            {p.value.includes("MAX_UINT256") ? (
                                                <span className="max-uint-warn">
                                                    <TriangleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
                                                    {p.value}
                                                </span>
                                            ) : p.value}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {decoded.rawData && decoded.rawData !== "0x" && (
                <div>
                    <button
                        type="button"
                        className="collapsible-toggle"
                        onClick={() => setShowRaw(!showRaw)}
                        aria-expanded={showRaw}
                    >
                        <span aria-hidden="true">{showRaw ? "▾" : "▸"}</span> Raw Calldata
                    </button>
                    {showRaw && <div className="raw-data-box">{decoded.rawData}</div>}
                </div>
            )}
        </>
    );
}
