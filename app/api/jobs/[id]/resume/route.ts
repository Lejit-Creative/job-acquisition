import { materialsForJob } from "@/lib/materials";
import { renderPdf } from "@/lib/pdf";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const theme = new URL(request.url).searchParams.get("theme") ?? undefined;
  const packed = materialsForJob(Number(id), theme);
  if (!packed) return new Response("Not found", { status: 404 });
  const pdf = await renderPdf(packed.profile, packed.content, false);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="resume.pdf"',
    },
  });
}
