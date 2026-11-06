import fs from "node:fs";
import path from "node:path";
import { getFile } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const file = getFile(Number(id));
  if (!file) return new Response("Not found", { status: 404 });
  const root = path.resolve(process.cwd(), "data", "files");
  const resolved = path.resolve(file.path);
  if (!resolved.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
  const bytes = fs.readFileSync(resolved);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
