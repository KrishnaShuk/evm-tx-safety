import type { AnalysisResult } from "@evm-safety/core";

const LABELS: Record<string, string> = {
    success: "Outcome",
    gas: "Gas",
    balances: "Balances",
    approvals: "Approvals",
    stateChanges: "State",
    events: "Events",
    trace: "Trace",
};

const REASONS: Record<string, string> = {
    success: "not run",
    gas: "not run",
    balances: "needs trace",
    approvals: "needs trace",
    stateChanges: "needs trace",
    events: "needs logs",
    trace: "needs trace",
};

export function CapabilityChips({ capabilities }: { capabilities: AnalysisResult["simulation"]["capabilities"] }) {
    return (
        <div className="capability-row">
            {Object.entries(capabilities).map(([key, enabled]) => (
                <span key={key} className={`capability-chip ${enabled ? "on" : "off"}`}>
                    <span aria-hidden="true">{enabled ? "✓" : "–"}</span>
                    <span>{LABELS[key] ?? key}</span>
                    {!enabled && (
                        <span className="capability-reason">· {REASONS[key] ?? "not available"}</span>
                    )}
                </span>
            ))}
        </div>
    );
}
