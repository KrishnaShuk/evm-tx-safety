import type { AnalysisResult } from "@evm-safety/core";
import { shortAddr } from "../lib/format";

export function ActivityPanel({ simulation }: { simulation: AnalysisResult["simulation"] }) {
    const { balanceChanges, approvals, stateChanges, events } = simulation;

    return (
        <>
            {balanceChanges.length > 0 && (
                <div>
                    <div className="section-label">Balance Changes</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead>
                                <tr><th>Account</th><th className="num">Change</th></tr>
                            </thead>
                            <tbody>
                                {balanceChanges.map((bc, i) => (
                                    <tr key={i}>
                                        <td title={bc.address}>{shortAddr(bc.address)}</td>
                                        <td className={`num ${bc.direction === "in" ? "text-pos" : "text-neg"}`}>
                                            <span aria-hidden="true">{bc.direction === "in" ? "↑" : "↓"}</span>{" "}
                                            {bc.delta} {bc.token}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {approvals.length > 0 && (
                <div>
                    <div className="section-label">Approvals</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead>
                                <tr><th>Owner</th><th>Spender</th><th>Kind</th><th className="num">Amount</th></tr>
                            </thead>
                            <tbody>
                                {approvals.map((approval, i) => (
                                    <tr key={i}>
                                        <td title={approval.owner}>{shortAddr(approval.owner)}</td>
                                        <td title={approval.spender}>{shortAddr(approval.spender)}</td>
                                        <td>{approval.kind}</td>
                                        <td className="num text-warn">
                                            {approval.kind === "all"
                                                ? (approval.approved ? "ALL NFTs" : "REVOKED")
                                                : `${approval.amount ?? "?"} ${approval.token}`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {stateChanges.length > 0 && (
                <div>
                    <div className="section-label">State Changes ({stateChanges.length})</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead>
                                <tr><th>Address</th><th>Kind</th><th>Key</th><th>Before</th><th>After</th></tr>
                            </thead>
                            <tbody>
                                {stateChanges.slice(0, 20).map((change, i) => (
                                    <tr key={i}>
                                        <td title={change.address}>{shortAddr(change.address)}</td>
                                        <td>{change.kind}</td>
                                        <td>{change.key ? shortAddr(change.key) : "—"}</td>
                                        <td>{change.before ? shortAddr(change.before) : "—"}</td>
                                        <td>{shortAddr(change.after ?? "")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {stateChanges.length > 20 && (
                        <p className="field-hint">
                            Showing 20 of {stateChanges.length}. Use the API or CLI --json for all.
                        </p>
                    )}
                </div>
            )}

            {events.length > 0 && (
                <div>
                    <div className="section-label">Emitted Events</div>
                    <div className="events-list">
                        {events.slice(0, 30).map((ev, i) => (
                            <div key={i} className="event-item">
                                <div className="event-name">
                                    {ev.name} <span className="text-muted">· {shortAddr(ev.address)}</span>
                                </div>
                                {Object.entries(ev.params).map(([k, v]) => (
                                    <div key={k} className="event-param">
                                        {k}: <span>{v}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    {events.length > 30 && (
                        <p className="field-hint">
                            Showing 30 of {events.length}. Use the API or CLI --json for all.
                        </p>
                    )}
                </div>
            )}
        </>
    );
}
