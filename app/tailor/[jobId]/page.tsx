import { connection } from "next/server";
import { TailorHome } from "@/components/tailor-home";
import { llmEnabled } from "@/lib/llm";
import { syncTailor } from "@/lib/tailor";

export default async function TailorJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  const { jobId } = await params;
  const view = syncTailor(Number(jobId));
  if (!view) return <p className="banner">That role is not in the library.</p>;
  return (
    <TailorHome
      job={view.job}
      terms={view.terms}
      mapped={view.mapped}
      questions={view.questions}
      rewrite={view.rewrite}
      llm={llmEnabled()}
    />
  );
}
