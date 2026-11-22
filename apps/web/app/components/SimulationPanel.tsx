import type { AnalysisResult } from "@evm-safety/core";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { CapabilityChips } from "./CapabilityChips";
import { GasBar } from "./GasBar";

export function SimulationPanel({ simulation }: { simulation: AnalysisResult["simulation"] }) {
    const status = simulation.status;
    const Icon = status === "success" ? CircleCheck : status === "revert" ? CircleX : TriangleAlert;
    const label =
        status === "success"
            ? "Transaction will succeed"
            : status === "revert"
                ? "Transaction will revert"
                : "Execution could not be simulated";
    const pillClass = status === "success" ? "success" : status === "revert" ? "fail" : "unavailable";

    return (
        <>
            <div className={`sim-status-pill ${pillClass}`}>
                <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{label}</span>
            </div>

            {status === "revert" && simulation.revertReason && (
                <div className="revert-box">
                    <div className="revert-label">Revert Reason</div>
                    <p className="text-secondary">{simulation.revertReason}</p>
                </div>
            )}

            {status === "unavailable" && simulation.error && (
                <div className="revert-box is-warn">
                    <div className="revert-label">{simulation.error.code}</div>
                    <p className="text-secondary">{simulation.error.message}</p>
                </div>
            )}

            <div className="section-label">Simulation Coverage</div>
            <CapabilityChips capabilities={simulation.capabilities} />

            {status !== "unavailable" && (
                <>
                    <div className="section-label">Gas Usage</div>
                    <GasBar used={simulation.gasUsed} limit={simulation.gasLimit} status={status} />
                </>
            )}
        </>
    );
}
