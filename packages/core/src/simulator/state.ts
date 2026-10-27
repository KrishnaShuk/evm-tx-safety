import type { StateChange } from "../types";

const MAX_STATE_CHANGES = 200;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function addChange(changes: StateChange[], change: StateChange): void {
    if (changes.length >= MAX_STATE_CHANGES) return;
    changes.push(change);
}

/** Parse a `prestateTracer` diff-mode result (`{ pre, post }`). */
export function parsePrestateDiff(raw: unknown): StateChange[] {
    const root = asRecord(raw);
    const pre = asRecord(root?.pre);
    const post = asRecord(root?.post);
    if (!pre || !post) return [];

    const changes: StateChange[] = [];
    for (const address of Object.keys(post)) {
        const before = asRecord(pre[address]);
        const after = asRecord(post[address]);
        if (!after) continue;

        for (const field of ["balance", "nonce", "code"] as const) {
            const beforeValue = before?.[field];
            const afterValue = after[field];
            if (afterValue === undefined) continue;
            if (String(beforeValue ?? "") === String(afterValue)) continue;
            addChange(changes, {
                address,
                kind: field === "balance" ? "balance" : field,
                before: beforeValue === undefined ? undefined : String(beforeValue),
                after: String(afterValue),
            });
        }

        const beforeStorage = asRecord(before?.storage) ?? {};
        const afterStorage = asRecord(after.storage) ?? {};
        for (const key of Object.keys(afterStorage)) {
            const oldValue = beforeStorage[key];
            const newValue = afterStorage[key];
            if (String(oldValue ?? "0x0") === String(newValue ?? "0x0")) continue;
            addChange(changes, {
                address,
                kind: "storage",
                key,
                before: oldValue === undefined ? undefined : String(oldValue),
                after: String(newValue),
            });
        }
    }
    return changes;
}

/** Parse Tenderly's `state_diff` / `raw_state_diff` payloads defensively. */
export function parseTenderlyStateDiff(raw: unknown): StateChange[] {
    const changes: StateChange[] = [];
    if (!raw) return changes;

    if (Array.isArray(raw)) {
        for (const item of raw) {
            const record = asRecord(item);
            if (!record) continue;
            const address = String(record.address ?? record.contract_address ?? "");
            if (!address) continue;
            if (record.key !== undefined || record.slot !== undefined) {
                addChange(changes, {
                    address,
                    kind: "storage",
                    key: String(record.key ?? record.slot),
                    before: record.before === undefined ? undefined : String(record.before),
                    after: record.after === undefined ? undefined : String(record.after),
                });
                continue;
            }
            const storage = asRecord(record.storage);
            if (storage) {
                for (const [key, value] of Object.entries(storage)) {
                    addChange(changes, {
                        address,
                        kind: "storage",
                        key,
                        after: String(value),
                    });
                }
            }
            if (record.balance !== undefined) {
                addChange(changes, {
                    address,
                    kind: "balance",
                    after: String(record.balance),
                });
            }
        }
        return changes;
    }

    const root = asRecord(raw);
    if (!root) return changes;
    for (const [address, value] of Object.entries(root)) {
        const record = asRecord(value);
        if (!record) continue;
        const storage = asRecord(record.storage);
        if (storage) {
            for (const [key, slotValue] of Object.entries(storage)) {
                addChange(changes, {
                    address,
                    kind: "storage",
                    key,
                    after: String(slotValue),
                });
            }
        }
        if (record.balance !== undefined) {
            addChange(changes, {
                address,
                kind: "balance",
                after: String(record.balance),
            });
        }
        if (record.nonce !== undefined) {
            addChange(changes, {
                address,
                kind: "nonce",
                after: String(record.nonce),
            });
        }
    }
    return changes;
}
