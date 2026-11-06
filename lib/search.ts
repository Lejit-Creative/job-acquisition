import {
  fetchAdzuna,
  fetchAshby,
  fetchGreenhouse,
  fetchGreenhouseDetail,
  fetchLever,
  fetchRemoteOk,
  fetchUsaJobs,
  applyCriteria,
  type DraftJob,
} from "./connectors";
import { getCriteria, jobKnown, listSources, recordSearch, upsertJob } from "./db";
import { classifyField, isRemote } from "./fields";
import { pool } from "./http";
import type { Criteria, SearchReport } from "./types";

const NEW_DETAIL_CAP = 70;

function notePay(draft: DraftJob, criteria: Criteria): ReturnType<typeof applyCriteria> {
  return applyCriteria(draft, criteria);
}

export async function runSearch(extraKeywords = ""): Promise<SearchReport> {
  const criteria = getCriteria();
  if (extraKeywords.trim()) {
    criteria.extraKeywords = [criteria.extraKeywords, extraKeywords.trim()].filter(Boolean).join(", ");
  }
  const report: SearchReport = { added: 0, updated: 0, filtered: 0, held: 0, notes: [], errors: [] };
  const sources = listSources().filter((source) => source.enabled);

  const remember = (draft: DraftJob) => {
    const judged = notePay(draft, criteria);
    if (judged === "filtered" || judged == null) {
      if (judged === "filtered") report.filtered += 1;
      return;
    }
    const result = upsertJob({
      ...judged,
      payUnknown: judged.payMin == null && judged.payMax == null,
      matchesCriteria: true,
      force: false,
      logoUrl: draft.logoUrl ?? "",
      companyUrl: draft.companyUrl ?? "",
    });
    if (result === "added") report.added += 1;
    else if (result === "updated") report.updated += 1;
    else report.filtered += 1;
  };

  const greenhouse = sources.filter((source) => source.kind === "greenhouse");
  const pending: { token: string; draft: DraftJob }[] = [];
  await pool(greenhouse, 6, async (source) => {
    try {
      const jobs = await fetchGreenhouse(source);
      for (const job of jobs) {
        const field = classifyField(job.title, job.tags, "", criteria.fields, criteria.extraKeywords);
        if (!field) continue;
        const remote = isRemote(job.location, job.workplace);
        if (criteria.remoteOnly && !remote) {
          report.filtered += 1;
          continue;
        }
        if (jobKnown(job.source, job.externalId, job.company, job.title, job.location)) continue;
        pending.push({ token: source.token, draft: job });
      }
    } catch (error) {
      report.errors.push({
        source: `Greenhouse ${source.label}`,
        message: error instanceof Error ? error.message : "failed",
      });
    }
  });

  const detailSlice = pending.slice(0, NEW_DETAIL_CAP);
  report.held += Math.max(0, pending.length - detailSlice.length);
  await pool(detailSlice, 6, async (item) => {
    try {
      const detail = await fetchGreenhouseDetail(item.token, item.draft.externalId);
      remember({ ...item.draft, ...detail, title: item.draft.title, source: "greenhouse" });
    } catch (error) {
      report.errors.push({
        source: `Greenhouse ${item.draft.company}`,
        message: error instanceof Error ? error.message : "failed",
      });
    }
  });

  await pool(
    sources.filter((source) => source.kind === "lever"),
    4,
    async (source) => {
      try {
        for (const job of await fetchLever(source)) remember(job);
      } catch (error) {
        report.errors.push({
          source: `Lever ${source.label}`,
          message: error instanceof Error ? error.message : "failed",
        });
      }
    },
  );

  await pool(
    sources.filter((source) => source.kind === "ashby"),
    4,
    async (source) => {
      try {
        for (const job of await fetchAshby(source)) remember(job);
      } catch (error) {
        report.errors.push({
          source: `Ashby ${source.label}`,
          message: error instanceof Error ? error.message : "failed",
        });
      }
    },
  );

  try {
    for (const job of await fetchRemoteOk()) remember(job);
  } catch (error) {
    report.errors.push({
      source: "Remote OK",
      message: error instanceof Error ? error.message : "failed",
    });
  }

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    report.notes.push("Adzuna is off until ADZUNA_APP_ID and ADZUNA_APP_KEY are set.");
  } else {
    try {
      for (const job of await fetchAdzuna(criteria)) remember(job);
    } catch (error) {
      report.errors.push({
        source: "Adzuna",
        message: error instanceof Error ? error.message : "failed",
      });
    }
  }

  if (!process.env.USAJOBS_API_KEY || !process.env.USAJOBS_USER_AGENT) {
    report.notes.push("USAJobs is off until USAJOBS_API_KEY and USAJOBS_USER_AGENT are set.");
  } else {
    try {
      for (const job of await fetchUsaJobs(criteria)) remember(job);
    } catch (error) {
      report.errors.push({
        source: "USAJobs",
        message: error instanceof Error ? error.message : "failed",
      });
    }
  }

  if (report.held > 0) {
    report.notes.push(`${report.held} more board roles are waiting. Run search again.`);
  }
  recordSearch({
    added: report.added,
    updated: report.updated,
    filtered: report.filtered,
    notes: [...report.notes, ...report.errors.map((item) => `${item.source}: ${item.message}`)].join("\n"),
  });
  return report;
}
