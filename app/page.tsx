import { connection } from "next/server";
import { JobsHome } from "@/components/jobs-home";
import { getCriteria, homeCounts, lastSearch, listJobs, listSavedSearches, listSkills, listSources, outsideCount } from "@/lib/db";
import { llmEnabled } from "@/lib/llm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; outside?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const query = params.q ?? "";
  const showOutside = params.outside === "1";
  const last = lastSearch();
  return (
    <JobsHome
      jobs={listJobs(query, showOutside || Boolean(query))}
      counts={homeCounts()}
      criteria={getCriteria()}
      sources={listSources()}
      searches={listSavedSearches()}
      outside={outsideCount()}
      showOutside={showOutside}
      llm={llmEnabled()}
      query={query}
      lastNote={last ? `Last search added ${last.added}. ${last.notes.split("\n")[0] ?? ""}` : null}
      skills={listSkills()}
    />
  );
}
