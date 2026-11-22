import type { ReactNode } from "react";

export function Panel({
    num,
    title,
    id,
    right,
    children,
    className = "",
}: {
    num: string;
    title: string;
    id?: string;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            id={id}
            className={`panel ${className}`.trim()}
            aria-labelledby={id ? `${id}-title` : undefined}
        >
            <div className="panel-head">
                <span className="panel-num">{num}</span>
                <span className="panel-title" id={id ? `${id}-title` : undefined}>{title}</span>
                {right && <div className="panel-right">{right}</div>}
            </div>
            <div className="panel-body">{children}</div>
        </section>
    );
}
