import type { AnalysisResult } from "@evm-safety/core";

export function CapabilityChips({ capabilities }: { capabilities: AnalysisResult["simulation"]["capabilities"] }) {
    const labels: Record<string, string> = {
        success: "Outcome",
        gas: "Gas",
        balances: "Balances",
        approvals: "Approvals",
        stateChanges: "State",
        events: "Events",
        trace: "Trace",
    };
    return (
        <div className="capability-row">
            {Object.entries(capabilities).map(([key, enabled]) => (
                <span key={key} className={`capability-chip ${enabled ? "on" : "off"}`}>
                    {enabled ? "✓" : "—"} {labels[key] ?? key}
                </span>
            ))}
        </div>
    );
}
