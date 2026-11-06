"use client";

import type { ReactNode } from "react";

export function Dialog({
  open,
  title,
  kicker,
  blue,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  blue?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`dialog-head ${blue ? "blue" : ""}`}>
          <div>
            {kicker ? <p className="kicker">{kicker}</p> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function StatRow({
  items,
}: {
  items: { label: string; value: string | number; meta: string; tone: string; href?: string }[];
}) {
  return (
    <section className="stat-row">
      {items.map((item) => (
        <a key={item.label} className={`stat stat-${item.tone}`} href={item.href ?? "#top"}>
          <div className="stat-label">{item.label}</div>
          <div className="stat-num">{item.value}</div>
          <p>{item.meta}</p>
        </a>
      ))}
    </section>
  );
}

export function Notice({ message, error }: { message?: string | null; error?: string | null }) {
  if (!message && !error) return null;
  return <p className={error ? "banner warn" : "banner"}>{error || message}</p>;
}

export function sourceLabel(source: string): string {
  const names: Record<string, string> = {
    greenhouse: "Greenhouse",
    lever: "Lever",
    ashby: "Ashby",
    remoteok: "Remote OK",
    adzuna: "Adzuna",
    usajobs: "USAJobs",
    url: "Pasted link",
    manual: "Added by hand",
  };
  return names[source] ?? source;
}
