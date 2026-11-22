import type { AnalysisResult } from "@evm-safety/core";
import { Lightbulb, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { ScoreBadge } from "./ScoreBadge";
import { SeverityBadge } from "./SeverityBadge";

export function SafetyPanel({ safety }: { safety: AnalysisResult["safety"] }) {
    const count = safety.warnings.length;
    const Icon =
        safety.score === "SAFE" ? ShieldCheck : safety.score === "WARNINGS" ? TriangleAlert : ShieldX;
    const headline =
        safety.score === "SAFE"
            ? "All checks passed"
            : safety.score === "WARNINGS"
                ? `${count} warning${count === 1 ? "" : "s"} found`
                : `${count} critical issue${count === 1 ? "" : "s"} detected`;
    const sub =
        safety.score === "SAFE"
            ? "This transaction looks safe to send."
            : "Review the findings before signing.";

    return (
        <>
            <div className={`score-banner score-${safety.score.toLowerCase()}`}>
                <div>
                    <div className="score-label-text score-headline">
                        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span>{headline}</span>
                    </div>
                    <div className="score-sub">{sub}</div>
                </div>
                <div className="score-right">
                    <span className="risk-score">Risk {safety.riskScore} / 100</span>
                    <ScoreBadge score={safety.score} />
                </div>
            </div>

            {safety.warnings.map((w, i) => (
                <div key={i} className={`warning-item severity-${w.severity.toLowerCase()}`}>
                    <div className="warning-header">
                        <SeverityBadge s={w.severity} />
                        <span className="warning-rule">{w.rule}</span>
                        <span className="badge conf-tag">CONF {w.confidence}</span>
                    </div>
                    <p className="warning-message">{w.message}</p>
                    <p className="warning-rec">
                        <Lightbulb size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span>{w.recommendation}</span>
                    </p>
                    {w.evidence && Object.keys(w.evidence).length > 0 && (
                        <details className="warning-evidence">
                            <summary>Evidence</summary>
                            <pre>{JSON.stringify(w.evidence, null, 2)}</pre>
                        </details>
                    )}
                </div>
            ))}

            {count === 0 && (
                <div className="safety-empty">
                    <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span>No warnings — transaction appears safe to proceed.</span>
                </div>
            )}
        </>
    );
}
