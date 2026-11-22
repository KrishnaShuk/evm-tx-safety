import type { Chain } from "../lib/chains";

export function NetworkStrip({
    chains,
    chainId,
    onSelect,
}: {
    chains: Chain[];
    chainId: number;
    onSelect: (id: number) => void;
}) {
    return (
        <nav className="netstrip" aria-label="Network">
            {chains.map((chain) => {
                const selected = chain.id === chainId;
                return (
                    <button
                        key={chain.id}
                        type="button"
                        className="net-cell"
                        aria-pressed={selected}
                        onClick={() => onSelect(chain.id)}
                    >
                        <span className="net-name">
                            <span className={`chain-dot chain-dot-${chain.id}`} aria-hidden="true" />
                            {chain.name}
                        </span>
                        <span className="net-state">{selected ? "● ONLINE" : "○ IDLE"}</span>
                    </button>
                );
            })}
        </nav>
    );
}
