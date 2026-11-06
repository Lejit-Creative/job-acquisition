import { getApplication } from "@/lib/db";
import { materialsForJob } from "@/lib/materials";
import { renderPdf } from "@/lib/pdf";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const application = getApplication(Number(id));
  if (!application) return new Response("Not found", { status: 404 });
  const packed = materialsForJob(application.job_id, application.theme_id);
  if (!packed) return new Response("Not found", { status: 404 });
  const pdf = await renderPdf(packed.profile, packed.content, true);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="cover-letter.pdf"',
    },
  });
}
