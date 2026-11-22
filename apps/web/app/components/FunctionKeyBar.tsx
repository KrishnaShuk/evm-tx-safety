"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function FunctionKeyBar({
    onFocusInput,
    onVerdict,
    onSafety,
    onRawLog,
}: {
    onFocusInput: () => void;
    onVerdict: () => void;
    onSafety: () => void;
    onRawLog: () => void;
}) {
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            if (isTypingTarget(event.target)) return;

            let handler: (() => void) | null = null;
            if (event.key === "F1") handler = onFocusInput;
            else if (event.key === "F2") handler = onVerdict;
            else if (event.key === "F3") handler = onSafety;
            else if (event.key === "F4") handler = onRawLog;

            if (!handler) return;
            event.preventDefault();
            handler();
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onFocusInput, onVerdict, onSafety, onRawLog]);

    const keys = [
        { key: "F1", label: "INPUT", run: onFocusInput },
        { key: "F2", label: "VERDICT", run: onVerdict },
        { key: "F3", label: "SAFETY", run: onSafety },
        { key: "F4", label: "LOG", run: onRawLog },
    ];

    return (
        <footer className="fkeybar" aria-label="Function keys">
            {keys.map(({ key, label, run }) => (
                <button
                    key={key}
                    type="button"
                    className="fkey"
                    onClick={run}
                    aria-label={`${key} ${label}`}
                >
                    <b>{key}</b> {label}
                </button>
            ))}
        </footer>
    );
}
