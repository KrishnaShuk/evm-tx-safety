"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

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
        <button
            type="button"
            className={`copy-btn ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title="Copy to clipboard"
            aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
        >
            {copied ? (
                <><Check size={16} strokeWidth={1.5} aria-hidden="true" /> Copied</>
            ) : (
                <><Copy size={16} strokeWidth={1.5} aria-hidden="true" /> Copy</>
            )}
        </button>
    );
}
