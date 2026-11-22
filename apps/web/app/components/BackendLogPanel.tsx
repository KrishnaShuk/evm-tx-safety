import type { AnalysisResult } from "@evm-safety/core";
import { RawDisclosure } from "./RawDisclosure";

export function BackendLogPanel({ simulation }: { simulation: AnalysisResult["simulation"] }) {
    const notes = simulation.notes;
    const error = simulation.error;

    const brief = [
        notes.length > 0 ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : "no notes",
        error ? error.code : null,
    ]
        .filter(Boolean)
        .join(" · ");

    const raw = [
        error ? `${error.code}: ${error.message}` : null,
        ...notes,
    ]
        .filter(Boolean)
        .join("\n");

    return (
        <details className="backend-log">
            <summary className="backend-log-summary">
                <span>Backend log</span>
                <span className="text-muted">— {brief}</span>
            </summary>
            <div className="backend-log-body">
                {notes.length > 0 && (
                    <>
                        <div className="section-label">Notes</div>
                        <ul className="backend-notes">
                            {notes.map((note, i) => (
                                <li key={i}>{note}</li>
                            ))}
                        </ul>
                    </>
                )}
                {error && (
                    <div className="kv">
                        <span className="kv-k">Error code</span>
                        <span className="kv-v">{error.code}</span>
                    </div>
                )}
                <RawDisclosure
                    summary={<span className="text-muted">Raw backend messages</span>}
                    raw={raw || undefined}
                />
            </div>
        </details>
    );
}
