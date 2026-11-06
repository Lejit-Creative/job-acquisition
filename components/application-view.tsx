"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  confirmMailAction,
  dismissMailAction,
  markSeenAction,
  moveStageAction,
  setThemeAction,
  uploadFileAction,
} from "@/app/actions";
import { THEMES } from "@/lib/resume";
import { formatDuration, stageLabel, type StageName } from "@/lib/stages";
import type { AppFile, MailMatch, StageEvent } from "@/lib/types";
import { StageLine } from "./stage-line";
import { Dialog, Notice, StatRow } from "./ui";

export function ApplicationView({
  id,
  title,
  company,
  stage,
  themeId,
  coverLetter,
  events,
  mail,
  files,
  appliedAt,
}: {
  id: number;
  title: string;
  company: string;
  stage: string;
  themeId: string;
  coverLetter: string;
  events: StageEvent[];
  mail: MailMatch[];
  files: AppFile[];
  appliedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<StageName | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const sinceApplied = appliedAt ? formatDuration(Date.now() - Date.parse(appliedAt)) : "Not sent";
  const currentEvent = [...events].reverse().find((event) => event.stage === stage);
  const inStage = currentEvent ? formatDuration(Date.now() - Date.parse(currentEvent.enteredAt)) : "—";
  const suggestion = mail.find((item) => item.suggestsStage && !item.confirmed && !item.dismissed);

  useEffect(() => {
    void markSeenAction(id);
  }, [id]);

  function go(task: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        setNote(result.message ?? null);
        setAsk(null);
        setTick((value) => value + 1);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <p className="meta" style={{ marginTop: 8 }}>{title} · {company}</p>
      <StatRow
        items={[
          { label: "This stage", value: stageLabel(stage), meta: inStage, tone: "pink" },
          { label: "Since applied", value: sinceApplied, meta: appliedAt ? "From the applied stage" : "Still saved", tone: "blue" },
          { label: "New mail", value: mail.filter((item) => !item.seen).length, meta: "Read-only Gmail", tone: "coral" },
          { label: "Files", value: files.length + 2, meta: "Resume, letter, extras", tone: "yellow" },
        ]}
      />
      <Notice message={note} error={error} />
      {suggestion?.suggestsStage ? (
        <div className="banner" data-testid="mail-suggestion">
          <p>New mail suggests {stageLabel(suggestion.suggestsStage)}. {suggestion.suggestionReason} The app will not move the stage until you confirm.</p>
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => go(() => confirmMailAction(suggestion.id, id, suggestion.suggestsStage as StageName))}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => go(() => dismissMailAction(suggestion.id))}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <section className="list-card cream" style={{ marginTop: 14 }}>
        <div className="list-head">
          <h2>Status</h2>
          <span className="meta">Click a stage to move it</span>
        </div>
        <StageLine current={stage} events={events} onPick={setAsk} />
      </section>
      <div className="split" style={{ marginTop: 14 }}>
        <section className="list-card card">
          <div className="list-head">
            <h2>Resume</h2>
            <a href={`/api/applications/${id}/resume?v=${tick}`} target="_blank" rel="noreferrer">Open PDF</a>
          </div>
          <iframe className="preview" title="Resume PDF" src={`/api/applications/${id}/resume?v=${tick}`} />
        </section>
        <div className="stack">
          <section className="letter" style={{ background: theme.paper, color: theme.ink }}>
            <p className="kicker" style={{ color: theme.accent }}>{theme.name}</p>
            <h3>Cover letter</h3>
            <p className="prose">{coverLetter || "Save materials from Prepare application to fill this letter with your facts."}</p>
            <a href={`/api/applications/${id}/cover`} target="_blank" rel="noreferrer">Download letter PDF</a>
          </section>
          <section className="list-card blush">
            <div className="list-head"><h2>Theme</h2></div>
            <div className="theme-row">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`swatch ${themeId === item.id ? "on" : ""}`}
                  style={{ background: item.paper, color: item.ink }}
                  onClick={() => go(() => setThemeAction(id, item.id))}
                >
                  <strong style={{ color: item.accent }}>{item.name}</strong>
                  <span>{item.font}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="list-card mint">
            <div className="list-head"><h2>Other files</h2></div>
            {files.length === 0 ? <p className="empty">No extra files yet.</p> : null}
            {files.map((file) => (
              <a key={file.id} className="row" href={`/api/files/${file.id}`}>
                <span><strong>{file.filename}</strong></span>
              </a>
            ))}
            <form className="form" action={(formData) => go(() => uploadFileAction(id, formData))}>
              <label>
                Attach a file
                <input name="file" type="file" />
              </label>
              <button className="btn-ghost" type="submit" disabled={pending}>Upload</button>
            </form>
          </section>
          <section className="list-card card">
            <div className="list-head"><h2>Mail</h2></div>
            {mail.length === 0 ? <p className="empty">No matched mail. Connect Gmail or check again.</p> : null}
            {mail.map((item) => (
              <div key={item.id} className="row" style={{ cursor: "default" }}>
                <span>
                  <strong>{item.subject || "(no subject)"}</strong>
                  <span className="row-meta">{item.fromAddr}</span>
                  <span className="row-meta">{item.snippet}</span>
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
      <Dialog
        open={ask != null}
        kicker="Move stage"
        title={ask ? `Move to ${stageLabel(ask)}?` : ""}
        onClose={() => setAsk(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setAsk(null)}>Cancel</button>
            <button type="button" className="btn" data-testid="confirm-stage" disabled={!ask || pending} onClick={() => ask && go(() => moveStageAction(id, ask))}>
              Move
            </button>
          </>
        }
      >
        <p>Time in the current stage stops when you confirm. The app does not invent an offer or an interview.</p>
      </Dialog>
    </div>
  );
}
