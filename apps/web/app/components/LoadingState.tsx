const LOADING_STEPS = [
    { id: "decode", label: "Decoding transaction…" },
    { id: "simulate", label: "Running simulation…" },
    { id: "safety", label: "Running safety checks…" },
];

export function LoadingState({ step }: { step: number }) {
    return (
        <div className="card">
            <div className="loading-card">
                <div className="loading-orbit">
                    <div className="loading-orbit-ring" />
                    <div className="loading-orbit-ring-2" />
                    <div className="loading-orbit-dot">🔍</div>
                </div>
                <div className="loading-steps">
                    {LOADING_STEPS.map((s, i) => (
                        <div
                            key={s.id}
                            className={`loading-step ${i < step ? "done" : i === step ? "active" : ""}`}
                        >
                            <div className="loading-step-dot" />
                            <span>{i < step ? "✓ " : ""}{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
