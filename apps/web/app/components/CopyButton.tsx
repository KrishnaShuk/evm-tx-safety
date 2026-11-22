"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* noop */ }
    }

    return (
        <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} title="Copy to clipboard">
            {copied ? "✓ Copied" : "⎘ Copy"}
        </button>
    );
}
