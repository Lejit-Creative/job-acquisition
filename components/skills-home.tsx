"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addBulletAction,
  addPortfolioAction,
  addSkillAction,
  deleteBulletAction,
  deletePortfolioAction,
  deleteSkillAction,
  updateBulletAction,
  updatePortfolioAction,
  updateSkillAction,
} from "@/app/actions";
import { wordCount } from "@/lib/text";
import type { Bullet, PortfolioPiece, Skill } from "@/lib/types";
import { Dialog, Notice, StatRow } from "./ui";

export function SkillsHome({
  skills,
  bullets,
  portfolio,
  used,
}: {
  skills: Skill[];
  bullets: Bullet[];
  portfolio: PortfolioPiece[];
  used: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"skill" | "bullet" | "piece" | null>(null);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [bullet, setBullet] = useState<Bullet | null>(null);
  const [piece, setPiece] = useState<PortfolioPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState(0);
  const names = useMemo(() => new Map(skills.map((item) => [item.id, item.name])), [skills]);

  function go(task: () => Promise<{ ok: boolean; error?: string }>, close = false) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        if (close) {
          setDialog(null);
          setSkill(null);
          setBullet(null);
          setPiece(null);
        }
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="btn" data-testid="add-skill" onClick={() => setDialog("skill")}>
          Add skill
        </button>
        <button type="button" className="btn-ghost" data-testid="add-bullet" onClick={() => setDialog("bullet")}>
          Add bullet
        </button>
        <button type="button" className="btn-ghost" data-testid="add-piece" onClick={() => setDialog("piece")}>
          Add portfolio
        </button>
      </div>
      <Notice error={error} />
      <StatRow
        items={[
          { label: "Skills", value: skills.length, meta: "Editable", tone: "pink" },
          { label: "Bullets", value: bullets.length, meta: "Under 20 words print", tone: "blue" },
          { label: "Portfolio", value: portfolio.length, meta: "Links you supplied", tone: "coral" },
          { label: "On resumes", value: used, meta: "Used in applications", tone: "yellow" },
        ]}
      />
      <div className={skill || bullet || piece ? "columns with-panel" : "columns"}>
        <div className="stack">
          <section className="list-card cream">
            <div className="list-head">
              <h2>Skills</h2>
            </div>
            {skills.length === 0 ? <p className="empty">Add the skills you actually use.</p> : null}
            {skills.map((item) => (
              <button key={item.id} type="button" className="row" onClick={() => { setSkill(item); setBullet(null); setPiece(null); }}>
                <span>
                  <strong>{item.name}</strong>
                  <span className="row-meta">{item.category || "Uncategorized"}</span>
                </span>
              </button>
            ))}
          </section>
          <section className="list-card blush">
            <div className="list-head">
              <h2>Bullets</h2>
            </div>
            {bullets.length === 0 ? <p className="empty">A bullet is one fact: what you did, how, and the result.</p> : null}
            {bullets.map((item) => (
              <button key={item.id} type="button" className="row" onClick={() => { setBullet(item); setSkill(null); setPiece(null); }}>
                <span>
                  <strong>{item.body}</strong>
                  <span className="row-meta">
                    {item.context || "No context"} · {wordCount(item.body)} words
                    {wordCount(item.body) > 20 ? " · stays off the PDF" : ""}
                  </span>
                </span>
              </button>
            ))}
          </section>
          <section className="list-card mint">
            <div className="list-head">
              <h2>Portfolio</h2>
            </div>
            {portfolio.length === 0 ? <p className="empty">Add a piece when you want it attached.</p> : null}
            {portfolio.map((item) => (
              <button key={item.id} type="button" className="row" onClick={() => { setPiece(item); setSkill(null); setBullet(null); }}>
                <span>
                  <strong>{item.title}</strong>
                  <span className="row-meta">{item.url || item.summary}</span>
                </span>
              </button>
            ))}
          </section>
        </div>
        {skill ? (
          <aside className="panel">
            <div className="panel-head">
              <h2>Skill</h2>
              <button type="button" className="icon-btn" onClick={() => setSkill(null)} aria-label="Close panel">×</button>
            </div>
            <form className="form" action={(formData) => go(() => updateSkillAction(formData))}>
              <input type="hidden" name="id" value={skill.id} />
              <label>Name<input name="name" defaultValue={skill.name} /></label>
              <label>Category<input name="category" defaultValue={skill.category} /></label>
              <label>Notes<textarea name="notes" defaultValue={skill.notes} /></label>
              <div className="actions">
                <button className="btn" type="submit" disabled={pending}>Save</button>
                <button type="button" className="btn-ghost" onClick={() => go(() => deleteSkillAction(skill.id), true)}>Delete</button>
              </div>
            </form>
          </aside>
        ) : null}
        {bullet ? (
          <aside className="panel">
            <div className="panel-head">
              <h2>Bullet</h2>
              <button type="button" className="icon-btn" onClick={() => setBullet(null)} aria-label="Close panel">×</button>
            </div>
            <form className="form" action={(formData) => go(() => updateBulletAction(formData))}>
              <input type="hidden" name="id" value={bullet.id} />
              <label>
                Text
                <textarea
                  name="body"
                  defaultValue={bullet.body}
                  onChange={(event) => setWords(wordCount(event.target.value))}
                />
              </label>
              <p className={words > 20 ? "warn" : "meta"}>{words || wordCount(bullet.body)} words</p>
              <label>Context<input name="context" defaultValue={bullet.context} placeholder="Where this happened" /></label>
              {skills.map((item) => (
                <label key={item.id} className="check">
                  <input type="checkbox" name="skill" value={item.id} defaultChecked={bullet.skillIds.includes(item.id)} />
                  {item.name}
                </label>
              ))}
              <div className="actions">
                <button className="btn" type="submit">Save</button>
                <button type="button" className="btn-ghost" onClick={() => go(() => deleteBulletAction(bullet.id), true)}>Delete</button>
              </div>
            </form>
          </aside>
        ) : null}
        {piece ? (
          <aside className="panel">
            <div className="panel-head">
              <h2>Portfolio</h2>
              <button type="button" className="icon-btn" onClick={() => setPiece(null)} aria-label="Close panel">×</button>
            </div>
            <form className="form" action={(formData) => go(() => updatePortfolioAction(formData))}>
              <input type="hidden" name="id" value={piece.id} />
              <label>Title<input name="title" defaultValue={piece.title} /></label>
              <label>URL<input name="url" defaultValue={piece.url} /></label>
              <label>What it shows<textarea name="summary" defaultValue={piece.summary} /></label>
              <div className="actions">
                <button className="btn" type="submit">Save</button>
                <button type="button" className="btn-ghost" onClick={() => go(() => deletePortfolioAction(piece.id), true)}>Delete</button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
      <Dialog open={dialog === "skill"} title="Add a skill" onClose={() => setDialog(null)}>
        <form className="form" data-testid="skill-form" action={(formData) => go(() => addSkillAction(formData), true)}>
          <label>Name<input name="name" required data-testid="skill-name" /></label>
          <label>Category<input name="category" placeholder="UX, finance, brand" /></label>
          <label>Notes<textarea name="notes" /></label>
          <button className="btn" type="submit">Add</button>
        </form>
      </Dialog>
      <Dialog open={dialog === "bullet"} title="Add a bullet" onClose={() => setDialog(null)}>
        <form className="form" data-testid="bullet-form" action={(formData) => go(() => addBulletAction(formData), true)}>
          <label>
            What happened
            <textarea name="body" required data-testid="bullet-body" onChange={(event) => setWords(wordCount(event.target.value))} />
          </label>
          <p className={words > 20 ? "warn" : "meta"}>{words} words. Over 20 stay in the library and off the PDF.</p>
          <label>Context<input name="context" /></label>
          {skills.map((item) => (
            <label key={item.id} className="check">
              <input type="checkbox" name="skill" value={item.id} /> {names.get(item.id)}
            </label>
          ))}
          <button className="btn" type="submit">Add</button>
        </form>
      </Dialog>
      <Dialog open={dialog === "piece"} title="Add a portfolio piece" onClose={() => setDialog(null)}>
        <form className="form" action={(formData) => go(() => addPortfolioAction(formData), true)}>
          <label>Title<input name="title" required /></label>
          <label>URL<input name="url" /></label>
          <label>Summary<textarea name="summary" /></label>
          <button className="btn" type="submit">Add</button>
        </form>
      </Dialog>
    </div>
  );
}
