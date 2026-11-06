"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { polishPositioningAction } from "@/app/actions";
import type { FieldRule } from "@/lib/types";
import { Notice, StatRow } from "./ui";

const TONES = ["pink", "blue", "coral", "yellow"];

export function PositioningHome({
  items,
  llm,
}: {
  items: { field: FieldRule; draft: string; polished: string }[];
  llm: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(items[0]?.field.id ?? "");
  const selected = items.find((item) => item.field.id === open) ?? items[0];

  return (
    <div>
      <p className="banner">Built from your skills and the bullets already used on applications. Nothing here is invented.</p>
      <Notice error={error} />
      <StatRow
        items={items.slice(0, 4).map((item, index) => ({
          label: item.field.label,
          value: item.draft ? "Ready" : "Thin",
          meta: item.polished ? "Sharpened" : "Your words",
          tone: TONES[index] ?? "yellow",
          href: `#field-${item.field.id}`,
        }))}
      />
      <div className="columns with-panel" style={{ marginTop: 14 }}>
        <div className="stack">
          {items.map((item) => (
            <section key={item.field.id} id={`field-${item.field.id}`} className="list-card cream">
              <div className="list-head">
                <h2>{item.field.label}</h2>
                <button type="button" className="btn-ghost" onClick={() => setOpen(item.field.id)}>
                  Open
                </button>
              </div>
              <p className="prose">{item.draft || `Add skills or bullets that match ${item.field.label.toLowerCase()}.`}</p>
              {item.polished ? (
                <>
                  <p className="kicker" style={{ marginTop: 12 }}>Sharpened</p>
                  <p className="prose">{item.polished}</p>
                </>
              ) : null}
            </section>
          ))}
        </div>
        {selected ? (
          <aside className="panel">
            <div className="panel-head"><h2>{selected.field.label}</h2></div>
            <div className="panel-body">
              <p className="meta">Keywords: {selected.field.keywords.slice(0, 6).join(", ")}</p>
              <button
                type="button"
                className="btn"
                disabled={!llm || pending || !selected.draft}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const result = await polishPositioningAction(selected.field.id);
                    if (!result.ok) setError(result.error);
                    router.refresh();
                  });
                }}
              >
                {llm ? "Sharpen with your facts" : "Sharpen stays off"}
              </button>
              <a className="btn-ghost" href="/skills">Edit the library</a>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
