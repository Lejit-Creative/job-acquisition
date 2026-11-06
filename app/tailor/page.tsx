import { connection } from "next/server";
import { listJobs } from "@/lib/db";
import { llmEnabled } from "@/lib/llm";
import { StatRow } from "@/components/ui";

export default async function TailorIndex() {
  await connection();
  const jobs = listJobs("", true).slice(0, 40);
  const llm = llmEnabled();
  return (
    <div>
      <StatRow
        items={[
          { label: "Roles", value: jobs.length, meta: "Open one to prepare an application", tone: "pink" },
          { label: "Extract", value: "Local", meta: "No key required", tone: "blue" },
          { label: "Rewrite", value: llm ? "On" : "Off", meta: llm ? "Key is set" : "Off until a key is set", tone: "coral" },
          { label: "PDF", value: "4 themes", meta: "Words swap per role", tone: "yellow" },
        ]}
      />
      <section className="list-card cream" style={{ marginTop: 14 }}>
        <div className="list-head">
          <h2>Prepare application</h2>
        </div>
        {jobs.length === 0 ? <p className="empty">Add or find a role before preparing an application.</p> : null}
        {jobs.map((job) => (
          <a key={job.id} className="row" href={`/tailor/${job.id}`}>
            <span>
              <strong>{job.title}</strong>
              <span className="row-meta">{job.company}</span>
            </span>
          </a>
        ))}
      </section>
    </div>
  );
}
