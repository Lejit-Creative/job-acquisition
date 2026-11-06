"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectGmailAction, syncGmailAction } from "@/app/actions";
import { formatDuration } from "@/lib/stages";
import { stageLabel } from "@/lib/stages";
import { Notice, StatRow } from "./ui";
import { useState } from "react";

export function ApplicationsHome({
  rows,
  counts,
  gmailConfigured,
  gmailConnected,
  gmailEmail,
}: {
  rows: {
    id: number;
    stage: string;
    title: string;
    company: string;
    field: string;
    unread: number;
    stageEntered: string | null;
  }[];
  counts: { saved: number; applied: number; inReview: number; interviews: number };
  gmailConfigured: boolean;
  gmailConnected: boolean;
  gmailEmail: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="toolbar">
        {gmailConfigured && !gmailConnected ? (
          <a className="btn" href="/api/gmail/start">Connect Gmail</a>
        ) : null}
        {gmailConnected ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const result = await syncGmailAction();
                if (!result.ok) setError(result.error);
                else setNote(result.message ?? "Mail checked.");
                router.refresh();
              });
            }}
          >
            Check mail
          </button>
        ) : null}
        {gmailConnected ? (
          <button type="button" className="btn-ghost" onClick={() => start(async () => { await disconnectGmailAction(); router.refresh(); })}>
            Disconnect {gmailEmail}
          </button>
        ) : null}
      </div>
      <Notice message={note} error={error} />
      {!gmailConfigured ? (
        <p className="banner">Gmail is off until Google OAuth credentials are set. Move stages by hand.</p>
      ) : null}
      <StatRow
        items={[
          { label: "Saved", value: counts.saved, meta: "Not sent", tone: "pink", href: "#list" },
          { label: "Applied", value: counts.applied, meta: "Sent", tone: "blue", href: "#list" },
          { label: "In review", value: counts.inReview, meta: "Waiting", tone: "coral", href: "#list" },
          { label: "Interviews", value: counts.interviews, meta: "In conversation", tone: "yellow", href: "#list" },
        ]}
      />
      <section id="list" className="list-card cream" style={{ marginTop: 14 }}>
        <div className="list-head">
          <h2>Applications</h2>
          <span className="meta">{rows.length}</span>
        </div>
        {rows.length === 0 ? <p className="empty">Save a role from Jobs to start a tracker.</p> : null}
        {rows.map((row) => {
          const elapsed = row.stageEntered ? formatDuration(Date.now() - Date.parse(row.stageEntered)) : "—";
          return (
            <a key={row.id} className="row" href={`/applications/${row.id}`} data-testid="application-row">
              <span>
                <strong>{row.title}</strong>
                <span className="row-meta">{row.company} · {stageLabel(row.stage)} · {elapsed} in this stage</span>
              </span>
              {row.unread ? <em className="tag">{row.unread} new</em> : null}
            </a>
          );
        })}
      </section>
    </div>
  );
}
