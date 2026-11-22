"use client";

import { useEffect, useState } from "react";
import type { InputMode } from "../lib/types";
import { truncateMiddle } from "../lib/format";

export function TopBar({
    mode,
    input,
    chainName,
    version,
}: {
    mode: InputMode;
    input: string;
    chainName: string;
    version?: string;
}) {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | undefined;
        const start = setTimeout(() => {
            setNow(new Date());
            timer = setInterval(() => setNow(new Date()), 1000);
        }, 0);
        return () => {
            clearTimeout(start);
            if (timer) clearInterval(timer);
        };
    }, []);

    const utc = now ? `${now.toISOString().slice(11, 19)} UTC` : "--:--:-- UTC";
    const shown = input ? truncateMiddle(input, 10, 8) : "—";

    return (
        <header className="topbar">
            <div className="brand">EVMTX SAFETY</div>
            <div className="cmdline" aria-label="Current analysis context">
                <span className="cmd-prefix" aria-hidden="true">CMD&gt;</span>
                <span className="cmd-text">
                    MODE={mode.toUpperCase()} · TX={shown} · NET={chainName}
                </span>
            </div>
            <div className="topbar-meta">
                <span className="utc">{utc}</span>
                <span className="rpc-dot" aria-hidden="true" />
                <span>RPC</span>
                {version && <span>v{version}</span>}
            </div>
        </header>
    );
}
