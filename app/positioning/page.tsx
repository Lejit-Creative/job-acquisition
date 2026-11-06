import { connection } from "next/server";
import { PositioningHome } from "@/components/positioning-home";
import { getCriteria, getPositioning, getProfile, listBullets, listSkills, winningBullets } from "@/lib/db";
import { llmEnabled } from "@/lib/llm";
import { assemblePositioning } from "@/lib/positioning";

export default async function PositioningPage() {
  await connection();
  const criteria = getCriteria();
  const saved = new Map(getPositioning().map((row) => [row.field_id, row.polished]));
  const profile = getProfile();
  const skills = listSkills();
  const bullets = listBullets();
  const winning = winningBullets();
  const items = criteria.fields
    .filter((field) => field.enabled)
    .map((field) => ({
      field,
      draft: assemblePositioning({ field, profile, skills, bullets, winning }),
      polished: saved.get(field.id) ?? "",
    }));
  return <PositioningHome items={items} llm={llmEnabled()} />;
}
