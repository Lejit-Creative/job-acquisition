"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addJobAction,
  addSavedSearchAction,
  addSourceAction,
  deleteJobAction,
  deleteSavedSearchAction,
  deleteSourceAction,
  dismissJobAction,
  pasteUrlAction,
  runSearchAction,
  saveApplicationAction,
  saveCriteriaAction,
  scoreFitAction,
  toggleSourceAction,
} from "@/app/actions";
import { skillHits, skillMatchScore, synopsis } from "@/lib/fit";
import { formatPay } from "@/lib/pay";
import type { Criteria, JobView, SavedSearch, Skill, SourceRow } from "@/lib/types";
import { Dialog, Notice, sourceLabel, StatRow } from "./ui";

export function JobsHome({
  jobs,
  counts,
  criteria,
  sources,
  searches,
  outside,
  showOutside,
  llm,
  query,
  lastNote,
  skills,
}: {
  jobs: JobView[];
  counts: { fresh: number; ready: number; applied: number; interviews: number };
  criteria: Criteria;
  sources: SourceRow[];
  searches: SavedSearch[];
  outside: number;
  showOutside: boolean;
  llm: boolean;
  query: string;
  lastNote: string | null;
  skills: Skill[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"add" | "paste" | "criteria" | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"fit" | "posting">("fit");
  const [listMode, setListMode] = useState<"new" | "ready" | "moving" | "outside">(showOutside ? "outside" : "new");
  const [note, setNote] = useState<string | null>(lastNote);
  const [error, setError] = useState<string | null>(null);
  const job = jobs.find((item) => item.id === selected) ?? null;

  const fresh = jobs.filter((item) => !item.applicationId && item.listStatus === "new" && item.matchesCriteria);
  const ready = jobs.filter((item) => item.stage === "saved");
  const moving = jobs.filter((item) => item.stage && item.stage !== "saved");
  const outsideJobs = jobs.filter((item) => !item.matchesCriteria);

  function openJob(id: number) {
    setSelected(id);
    setTab("fit");
  }

  function go(task: () => Promise<{ ok: boolean; error?: string; message?: string }>, close = false) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        setNote(result.message ?? null);
        if (close) setDialog(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="btn" data-testid="run-search" disabled={pending} onClick={() => go(() => runSearchAction())}>
          {pending ? "Searching…" : "Run search"}
        </button>
        <button type="button" className="btn-ghost" data-testid="add-job" onClick={() => setDialog("add")}>
          Add job
        </button>
        <button type="button" className="btn-ghost" data-testid="paste-url" onClick={() => setDialog("paste")}>
          Paste a URL
        </button>
        <button type="button" className="btn-ghost" data-testid="criteria" onClick={() => setDialog("criteria")}>
          Criteria
        </button>
        <a className={`btn-ghost ${showOutside ? "active" : ""}`} href={showOutside ? "/" : "/?outside=1"}>
          Outside filters ({outside})
        </a>
      </div>
      <Notice message={note} error={error} />
      <StatRow
        items={[
          { label: "New matches", value: counts.fresh, meta: "Passed your filters", tone: "pink", href: "#new" },
          { label: "Ready to apply", value: counts.ready, meta: "Saved, not sent", tone: "blue", href: "#ready" },
          { label: "Applied", value: counts.applied, meta: "Applied and in review", tone: "coral", href: "#moving" },
          { label: "Interviews", value: counts.interviews, meta: llm ? "Fit scores can run" : "Fit score off", tone: "yellow", href: "#moving" },
        ]}
      />
      <div className="list-switch">
        <button type="button" className={listMode === "new" ? "tab on" : "tab"} onClick={() => setListMode("new")}>New matches</button>
        <button type="button" className={listMode === "ready" ? "tab on" : "tab"} onClick={() => setListMode("ready")}>Ready to apply</button>
        <button type="button" className={listMode === "moving" ? "tab on" : "tab"} onClick={() => setListMode("moving")}>Applied and interviews</button>
        {showOutside ? (
          <button type="button" className={listMode === "outside" ? "tab on" : "tab"} onClick={() => setListMode("outside")}>Outside filters</button>
        ) : null}
      </div>
      <div className={job ? "columns with-panel" : "columns"}>
        <div className="stack">
          {query ? (
            <List id="search" title={`Search · ${query}`} tone="cream" jobs={jobs} selected={selected} onOpen={openJob} empty="Nothing matches that search." />
          ) : (
            <List
              id={listMode}
              title={listTitle(listMode)}
              tone={listMode === "ready" ? "blush" : listMode === "moving" ? "mint" : listMode === "outside" ? "card" : "cream"}
              jobs={listMode === "ready" ? ready : listMode === "moving" ? moving : listMode === "outside" ? outsideJobs : fresh}
              selected={selected}
              onOpen={openJob}
              empty={listEmpty(listMode)}
            />
          )}
        </div>
        {job ? <JobDetail job={job} skills={skills} tab={tab} setTab={setTab} llm={llm} pending={pending} onClose={() => setSelected(null)} go={go} /> : null}
      </div>

      <Dialog open={dialog === "add"} kicker="Manual" title="Add a role" onClose={() => setDialog(null)}>
        <form className="form" data-testid="add-job-form" action={(formData) => go(() => addJobAction(formData), true)}>
          <label>
            Title
            <input name="title" required data-testid="job-title" />
          </label>
          <label>
            Company
            <input name="company" required data-testid="job-company" />
          </label>
          <label>
            Location
            <input name="location" defaultValue="Remote" />
          </label>
          <label className="check">
            <input name="remote" type="checkbox" defaultChecked /> Remote
          </label>
          <label>
            Field
            <select name="field" defaultValue="ux">
              {criteria.fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pay minimum
            <input name="payMin" type="number" placeholder="Leave blank if unknown" />
          </label>
          <label>
            Pay maximum
            <input name="payMax" type="number" />
          </label>
          <label>
            URL
            <input name="url" type="url" />
          </label>
          <label>
            Description
            <textarea name="description" data-testid="job-description" />
          </label>
          <button className="btn" type="submit" disabled={pending}>
            Add
          </button>
        </form>
      </Dialog>

      <Dialog open={dialog === "paste"} kicker="Public posting" title="Paste a URL" onClose={() => setDialog(null)}>
        <form className="form" data-testid="paste-form" action={(formData) => go(() => pasteUrlAction(formData), true)}>
          <p className="meta">Greenhouse, Lever, Ashby, or a page that publishes a JobPosting record. LinkedIn and Indeed are refused.</p>
          <label>
            URL
            <input name="url" type="url" required placeholder="https://" data-testid="paste-input" />
          </label>
          <button className="btn" type="submit" disabled={pending}>
            Fetch
          </button>
        </form>
      </Dialog>

      <Dialog open={dialog === "criteria"} kicker="Filters" title="What stays on the list" onClose={() => setDialog(null)}>
        <form className="form" action={(formData) => go(() => saveCriteriaAction(formData), true)}>
          <label className="check">
            <input name="remoteOnly" type="checkbox" defaultChecked={criteria.remoteOnly} /> Remote only
          </label>
          <label>
            Minimum pay when a number is listed
            <input name="minPay" type="number" defaultValue={criteria.minPay} />
          </label>
          <label>
            Also keep titles that include these words
            <input name="extraKeywords" defaultValue={criteria.extraKeywords} placeholder="brand, fp&a" />
          </label>
          <label>
            Rerun search every (hours)
            <input name="intervalHours" type="number" min={1} defaultValue={criteria.intervalHours} />
          </label>
          {criteria.fields.map((field) => (
            <div key={field.id} className="field-block">
              <label className="check">
                <input name={`enabled-${field.id}`} type="checkbox" defaultChecked={field.enabled} /> {field.label}
              </label>
              <label>
                Keywords
                <textarea name={`keywords-${field.id}`} defaultValue={field.keywords.join(", ")} />
              </label>
              {["graphic-design", "ux", "business", "finance"].includes(field.id) ? null : (
                <label className="check">
                  <input type="checkbox" name="removeField" value={field.id} /> Remove this field
                </label>
              )}
            </div>
          ))}
          <label>
            Add a field
            <input name="customLabel" placeholder="Label" />
          </label>
          <label>
            Its keywords
            <input name="customKeywords" placeholder="comma separated" />
          </label>
          <button className="btn" type="submit">
            Save criteria
          </button>
        </form>
        <div className="field-block">
          <h3>Boards</h3>
          <form className="form" action={(formData) => go(() => addSourceAction(formData))}>
            <label>
              Kind
              <select name="kind" defaultValue="greenhouse">
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
              </select>
            </label>
            <label>
              Board token
              <input name="token" placeholder="figma" required />
            </label>
            <label>
              Label
              <input name="label" placeholder="Figma" />
            </label>
            <button className="btn-ghost" type="submit">
              Add board
            </button>
          </form>
          <div className="scroll">
            {sources.map((source) => (
              <div key={source.id} className="source-row">
                <span>
                  {source.label} · {source.kind}
                </span>
                <span className="actions">
                  <button type="button" className="btn-ghost" onClick={() => go(() => toggleSourceAction(source.id, !source.enabled))}>
                    {source.enabled ? "On" : "Off"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => go(() => deleteSourceAction(source.id))}>
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="field-block">
          <h3>Saved searches</h3>
          <form className="form" action={(formData) => go(() => addSavedSearchAction(formData))}>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Extra keywords for this search
              <input name="keywords" />
            </label>
            <button className="btn-ghost" type="submit">
              Save search
            </button>
          </form>
          {searches.map((search) => (
            <div key={search.id} className="source-row">
              <span>
                {search.name}
                {search.keywords ? ` · ${search.keywords}` : ""}
              </span>
              <span className="actions">
                <button type="button" className="btn-ghost" onClick={() => go(() => runSearchAction(search.keywords, search.id))}>
                  Rerun
                </button>
                <button type="button" className="btn-ghost" onClick={() => go(() => deleteSavedSearchAction(search.id))}>
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function listTitle(mode: "new" | "ready" | "moving" | "outside") {
  if (mode === "ready") return "Ready to apply";
  if (mode === "moving") return "Applied and interviews";
  if (mode === "outside") return "Outside filters";
  return "New matches";
}

function listEmpty(mode: "new" | "ready" | "moving" | "outside") {
  if (mode === "ready") return "Save a role when you want it on the tracker.";
  if (mode === "moving") return "Nothing has been sent yet.";
  if (mode === "outside") return "Nothing is sitting outside the filters.";
  return "Run a search or add a role.";
}

function List({
  id,
  title,
  tone,
  jobs,
  selected,
  onOpen,
  empty,
}: {
  id: string;
  title: string;
  tone: string;
  jobs: JobView[];
  selected: number | null;
  onOpen: (id: number) => void;
  empty: string;
}) {
  return (
    <section id={id} className={`list-card ${tone}`}>
      <div className="list-head">
        <h2>{title}</h2>
        <span className="meta">{jobs.length}</span>
      </div>
      {jobs.length === 0 ? <p className="empty">{empty}</p> : null}
      {jobs.map((job) => (
        <button key={job.id} type="button" className={job.id === selected ? "row on" : "row"} data-testid="job-row" onClick={() => onOpen(job.id)}>
          <Logo job={job} />
          <span className="row-main">
            <strong>{job.title}</strong>
            <span className="row-meta">
              {job.company}
              {job.location ? ` · ${job.location}` : ""} · {sourceLabel(job.source)}
            </span>
          </span>
          <span className="row-side">
            {job.payUnknown ? <em className="tag">Pay unknown</em> : <span>{formatPay(job.payMin, job.payMax, job.currency, false)}</span>}
            {job.fitScore != null ? <span className="fit">{job.fitScore}</span> : null}
          </span>
        </button>
      ))}
    </section>
  );
}

function Logo({ job }: { job: JobView }) {
  const [hidden, setHidden] = useState(false);
  if (!job.logoUrl || hidden) return <span className="logo-gap" aria-hidden="true" />;
  return (
    <img
      className="logo"
      data-testid="company-logo"
      alt=""
      src={job.logoUrl}
      referrerPolicy="no-referrer"
      onError={() => setHidden(true)}
    />
  );
}

function JobDetail({
  job,
  skills,
  tab,
  setTab,
  llm,
  pending,
  onClose,
  go,
}: {
  job: JobView;
  skills: Skill[];
  tab: "fit" | "posting";
  setTab: (tab: "fit" | "posting") => void;
  llm: boolean;
  pending: boolean;
  onClose: () => void;
  go: (task: () => Promise<{ ok: boolean; error?: string; message?: string }>, close?: boolean) => void;
}) {
  const hits = skillHits(job.description, skills);
  const match = skillMatchScore(job.description, skills);
  return (
    <aside className="panel" data-testid="job-panel">
      <div className="panel-head">
        <div className="title-line">
          <Logo job={job} />
          <h2>{job.title}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      <p className="meta">
        {job.company}
        {job.location ? ` · ${job.location}` : ""}
        {job.remote && !/remote/i.test(job.location) ? " · Remote" : ""} · {sourceLabel(job.source)}
      </p>
      <div className="tabs" data-testid="job-tabs">
        <button type="button" className={tab === "fit" ? "tab on" : "tab"} data-testid="fit-tab" onClick={() => setTab("fit")}>
          Fit for me
        </button>
        <button type="button" className={tab === "posting" ? "tab on" : "tab"} data-testid="description-tab" onClick={() => setTab("posting")}>
          Job description
        </button>
      </div>
      {tab === "fit" ? (
        <div className="panel-body" data-testid="fit-for-me">
          <p>{synopsis(job)}</p>
          <p className="score-line">
            <b>{match.score == null ? "—" : match.score}</b>
            <span>{match.total === 0 ? "Add skills to score this role" : `${match.matched} of ${match.total} skills show up in the posting`}</span>
          </p>
          <p className="meta">
            {job.fitScore == null
              ? "The model fit score stays off until an API key is set."
              : `Model fit ${job.fitScore}. ${job.fitReason ?? ""}`}
          </p>
          {hits.length === 0 ? (
            <p className="empty">{skills.length === 0 ? "Add skills and the lines they match will show here." : "None of your skills appear in this posting."}</p>
          ) : (
            <ul className="hits">
              {hits.map((hit) => (
                <li key={hit.skill}>
                  <strong>{hit.skill}</strong>
                  <span>{hit.line}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn" data-testid="save-application" onClick={() => go(async () => saveApplicationAction(job.id))}>
              {job.applicationId ? "Saved" : "Save"}
            </button>
            <a className="btn-ghost" href={`/tailor/${job.id}`}>
              Prepare application
            </a>
            {job.applicationId ? (
              <a className="btn-ghost" href={`/applications/${job.applicationId}`}>
                Application
              </a>
            ) : null}
            <button type="button" className="btn-ghost" disabled={!llm || pending} onClick={() => go(() => scoreFitAction(job.id))}>
              Score fit
            </button>
            <button type="button" className="btn-ghost" onClick={() => go(() => dismissJobAction(job.id))}>
              Hide
            </button>
            <button type="button" className="btn-ghost" onClick={() => go(() => deleteJobAction(job.id))}>
              Delete
            </button>
          </div>
          {job.url ? (
            <a href={job.url} target="_blank" rel="noreferrer">
              Open posting
            </a>
          ) : null}
          {job.payUnknown ? <span className="tag">Pay unknown</span> : <span className="meta">{formatPay(job.payMin, job.payMax, job.currency, false)}</span>}
          {!job.matchesCriteria ? <span className="tag">Outside filters</span> : null}
        </div>
      ) : (
        <div className="panel-body" data-testid="job-description">
          <p className="prose">{job.description || "No description yet."}</p>
        </div>
      )}
    </aside>
  );
}
