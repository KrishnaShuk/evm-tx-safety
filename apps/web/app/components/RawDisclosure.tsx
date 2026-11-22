import type { ReactNode } from "react";

export function RawDisclosure({
    summary,
    raw,
    showRawLabel = "SHOW RAW",
}: {
    summary: ReactNode;
    raw?: string;
    showRawLabel?: string;
}) {
    return (
        <div className="raw-disclosure">
            <div className="raw-summary">{summary}</div>
            {raw && (
                <details className="raw-details">
                    <summary>{showRawLabel}</summary>
                    <pre className="raw-pre">{raw}</pre>
                </details>
            )}
        </div>
    );
}
