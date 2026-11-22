import { Fragment } from "react";
import type { AnalysisResult } from "@evm-safety/core";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { shortAddr } from "../lib/format";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function VerdictPanel({ result }: { result: AnalysisResult }) {
    const { safety, decoded, simulation } = result;

    const state =
        safety.score === "SAFE"
            ? "SAFE"
            : safety.score === "WARNINGS"
                ? "REVIEW BEFORE SIGNING"
                : "DO NOT SIGN";

    const stateClass = safety.score.toLowerCase();
    const filled = Math.max(0, Math.min(10, Math.ceil(safety.riskScore / 10)));
    const meterClass =
        safety.score === "SAFE" ? "is-pos" : safety.score === "WARNINGS" ? "is-warn" : "is-neg";
    const simTag =
        simulation.status === "success"
            ? "badge-green"
            : simulation.status === "revert"
                ? "badge-red"
                : "badge-amber";
    const Icon =
        safety.score === "SAFE" ? ShieldCheck : safety.score === "WARNINGS" ? ShieldAlert : ShieldX;

    const flow: string[] = [];
    if (decoded.from) flow.push(`FROM ${shortAddr(decoded.from)}`);
    if (decoded.valueEth) flow.push(`${decoded.valueEth} ETH`);
    if (decoded.to) flow.push(`TO ${shortAddr(decoded.to)}`);
    if (decoded.type) flow.push(`(${decoded.type})`);

    return (
        <>
            <h2 className={`verdict-state ${stateClass}`}>
                <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{state}</span>
            </h2>

            <p className="verdict-summary">{decoded.summary}</p>

            <div className="verdict-meter">
                <div
                    className={`meter ${meterClass}`}
                    role="img"
                    aria-label={`Risk score ${safety.riskScore} of 100`}
                >
                    {Array.from({ length: 10 }).map((_, i) => (
                        <span key={i} className={`meter-seg ${i < filled ? "on" : ""}`} aria-hidden="true" />
                    ))}
                </div>
                <span className="meter-value">{safety.riskScore} / 100</span>
            </div>

            <div className="verdict-tags">
                <span className={`badge ${simTag}`}>SIM {simulation.status.toUpperCase()}</span>
                <span className={`badge ${safety.warnings.length > 0 ? "badge-amber" : "badge-green"}`}>
                    {safety.warnings.length} WARNING{safety.warnings.length === 1 ? "" : "S"}
                </span>
                <ConfidenceBadge confidence={decoded.signatureConfidence} />
            </div>

            {flow.length > 0 && (
                <div className="flow">
                    {flow.map((part, i) => (
                        <Fragment key={part}>
                            {i > 0 && <span className="flow-arrow" aria-hidden="true">→</span>}
                            <span>{part}</span>
                        </Fragment>
                    ))}
                </div>
            )}
        </>
    );
}
