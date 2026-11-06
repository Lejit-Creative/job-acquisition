"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hiringAction, rewriteAction, saveAnswersAction, saveMaterialsAction, scoreTailorAction } from "@/app/actions";
import { THEMES } from "@/lib/resume";
import { wordCount } from "@/lib/text";
import type { ClarifyQuestion, JobView, MappedTerm, Term } from "@/lib/types";
import type { RewriteFile } from "@/lib/tailor";
import { Notice, StatRow } from "./ui";

export function TailorHome({
  job,
  terms,
  mapped,
  questions,
  rewrite,
  llm,
}: {
  job: JobView;
  terms: Term[];
  mapped: MappedTerm[];
  questions: ClarifyQuestion[];
  rewrite: RewriteFile | null;
  llm: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [theme, setTheme] = useState(rewrite ? "paper" : "paper");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MappedTerm | null>(mapped[0] ?? null);
  const gaps = mapped.filter((item) => item.gap).length;

  function go(task: () => Promise<{ ok: boolean; error?: string; message?: string; data?: { id: number } }>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        setNote(result.message ?? null);
        router.refresh();
        if (result.data?.id) router.push(`/applications/${result.data.id}`);
      }
    });
  }

  return (
    <div>
      <h2 style={{ marginTop: 8 }}>Prepare application</h2>
      <p className="meta">
        {job.title} · {job.company}
      </p>
      <StatRow
        items={[
          { label: "Terms", value: terms.length, meta: "Their language", tone: "pink" },
          { label: "Mapped", value: mapped.length - gaps, meta: "Closest bullet", tone: "blue" },
          { label: "Gaps", value: gaps, meta: "Nothing close yet", tone: "coral" },
          { label: "Questions", value: questions.length, meta: "Only what a bullet needs", tone: "yellow" },
        ]}
      />
      <Notice message={note} error={error} />
      <div className="columns with-panel" style={{ marginTop: 14 }}>
        <div className="stack">
          <section className="list-card cream">
            <div className="list-head"><h2>Company language</h2></div>
            {terms.length === 0 ? <p className="empty">This role has no description to prepare from yet.</p> : null}
            {mapped.map((item) => (
              <button key={`${item.kind}-${item.term}`} type="button" className="row" onClick={() => setPicked(item)}>
                <span>
                  <strong>{item.term}</strong>
                  <span className="row-meta">{item.kind} · {item.gap ? "Gap" : "Mapped"}</span>
                </span>
              </button>
            ))}
          </section>
          <section className="list-card blush">
            <div className="list-head"><h2>Questions</h2></div>
            {questions.length === 0 ? <p className="empty">No questions yet. Add bullets if you want a closer map.</p> : null}
            <form className="form" action={(formData) => go(() => saveAnswersAction(job.id, formData))}>
              {questions.map((question) => (
                <label key={question.id}>
                  {question.prompt}
                  <textarea name={`answer-${question.id}`} defaultValue={question.answer} />
                </label>
              ))}
              {questions.length ? <button className="btn" type="submit">Save answers</button> : null}
            </form>
          </section>
          <section className="list-card mint">
            <div className="list-head"><h2>Rewrite</h2></div>
            <p className="meta">Uses their words and only facts you supplied. Bullets over 20 words are held back.</p>
            <div className="actions">
              <button type="button" className="btn" disabled={!llm || pending} onClick={() => go(() => rewriteAction(job.id))}>
                {llm ? "Rewrite" : "Rewrite off"}
              </button>
              <button type="button" className="btn-ghost" disabled={!llm || pending} onClick={() => go(() => scoreTailorAction(job.id))}>
                {llm ? "Score" : "Score off"}
              </button>
              <button type="button" className="btn-ghost" disabled={!llm || pending} onClick={() => go(() => hiringAction(job.id))}>
                {llm ? "Hiring-manager pass" : "Pass off"}
              </button>
            </div>
            {rewrite?.bullets?.length ? (
              <div className="stack" style={{ marginTop: 10 }}>
                {rewrite.bullets.map((bullet) => (
                  <div key={bullet.after} className="before">
                    <div>
                      <span className="kicker">Before</span>
                      <p>{bullet.before || "—"}</p>
                    </div>
                    <div>
                      <span className="kicker">After · {wordCount(bullet.after)} words</span>
                      <p>{bullet.after}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No rewrite yet.</p>
            )}
            {rewrite?.held?.length ? <p className="warn">Held back: {rewrite.held.join(" ")}</p> : null}
            {rewrite?.summary ? <p className="prose">{rewrite.summary}</p> : null}
            {rewrite?.score ? (
              <div>
                <div className="scores">
                  <div className="score"><b>{rewrite.score.keyword}</b>Keywords</div>
                  <div className="score"><b>{rewrite.score.skills}</b>Skills</div>
                  <div className="score"><b>{rewrite.score.outcomes}</b>Outcomes</div>
                  <div className="score"><b>{rewrite.score.roleFit}</b>Role fit</div>
                </div>
                <p style={{ marginTop: 8 }}>Overall {rewrite.score.overall}. {rewrite.score.toReach80}</p>
                {rewrite.score.missing.length ? <p className="meta">Missing: {rewrite.score.missing.join(", ")}</p> : null}
                {rewrite.score.weakBullets.length ? <p className="meta">Weak: {rewrite.score.weakBullets.join(" ")}</p> : null}
              </div>
            ) : (
              <p className="meta">The match score stays off until an API key is set.</p>
            )}
            {rewrite?.hiring ? (
              <p><strong>{rewrite.hiring.interview ? "Interview" : "Not yet"}.</strong> {rewrite.hiring.why}</p>
            ) : (
              <p className="meta">The hiring-manager pass stays off until an API key is set.</p>
            )}
          </section>
          <section className="list-card card">
            <div className="list-head"><h2>Theme</h2></div>
            <p className="meta">A theme sets the type, palette, and mark. The words swap per role.</p>
            <div className="theme-row">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`swatch ${theme === item.id ? "on" : ""}`}
                  style={{ background: item.paper, color: item.ink }}
                  onClick={() => setTheme(item.id)}
                >
                  <strong style={{ color: item.accent }}>{item.name}</strong>
                  <span>{item.for}</span>
                  <span className="meta">{item.font}</span>
                </button>
              ))}
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <a className="btn-ghost" href={`/api/jobs/${job.id}/resume?theme=${theme}`} target="_blank" rel="noreferrer">
                Preview PDF
              </a>
              <button type="button" className="btn" data-testid="save-materials" disabled={pending} onClick={() => go(() => saveMaterialsAction(job.id, theme))}>
                Save to application
              </button>
            </div>
          </section>
        </div>
        <aside className="panel">
          <div className="panel-head"><h2>{picked?.term ?? "Detail"}</h2></div>
          {picked ? (
            <div className="panel-body">
              <p className="kicker">{picked.kind}</p>
              <p>{picked.gap ? "No bullet is close enough." : picked.bullet}</p>
              <a className="btn-ghost" href="/skills">Edit the library</a>
            </div>
          ) : (
            <p className="empty">Pick a term.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
