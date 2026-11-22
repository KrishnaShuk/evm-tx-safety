import type { AnalysisResult } from "@evm-safety/core";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { shortAddr } from "../lib/format";

export function CallTree({ calls, depth = 0 }: { calls: AnalysisResult["decoded"]["calls"]; depth?: number }) {
    return (
        <div className={`call-tree ${depth > 0 ? "nested" : ""}`}>
            {calls.map((call, index) => (
                <div key={`${call.target}-${call.selector}-${index}`} className="call-node">
                    <div className="call-head">
                        <span className="call-index">{depth + 1}.{index + 1}</span>
                        <span className="call-fn">{call.command ?? call.functionSignature ?? call.selector ?? "call"}</span>
                        <ConfidenceBadge confidence={call.confidence} />
                        <span className="call-target" title={call.target}>{shortAddr(call.target)}</span>
                    </div>
                    {call.params.length > 0 && (
                        <div className="call-params">
                            {call.params.map((p, i) => (
                                <div key={`${p.name}-${i}`} className="call-param">
                                    <span className="call-param-name">{p.name}</span>
                                    <span className={`call-param-value ${p.value.includes("MAX_UINT256") ? "text-red" : ""}`}>
                                        {p.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {call.children && call.children.length > 0 && (
                        <CallTree calls={call.children} depth={depth + 1} />
                    )}
                </div>
            ))}
        </div>
    );
}
