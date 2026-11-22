const STEPS = [
    { id: "fetch", label: "Fetch" },
    { id: "decode", label: "Decode" },
    { id: "simulate", label: "Simulate" },
    { id: "score", label: "Score" },
];

export function LoadingState({ step }: { step: number }) {
    const active = Math.max(0, Math.min(3, step));

    return (
        <div className="loading-card">
            <div className="steps" role="group" aria-label="Analysis progress">
                {STEPS.map((s, i) => {
                    const state = i < active ? "done" : i === active ? "active" : "";
                    return (
                        <div key={s.id} className={`step ${state}`}>
                            <span className="step-dot" aria-hidden="true" />
                            <span>{s.label}</span>
                        </div>
                    );
                })}
            </div>
            <div className="skeleton-panels" aria-hidden="true">
                <div className="skeleton skeleton-w80" />
                <div className="skeleton skeleton-w60" />
                <div className="skeleton skeleton-w40" />
                <div className="skeleton skeleton-w80" />
                <div className="skeleton skeleton-w60" />
                <div className="skeleton skeleton-w40" />
            </div>
        </div>
    );
}
