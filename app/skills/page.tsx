import { connection } from "next/server";
import { SkillsHome } from "@/components/skills-home";
import { libraryCounts, listBullets, listPortfolio, listSkills } from "@/lib/db";

export default async function SkillsPage() {
  await connection();
  const counts = libraryCounts();
  return (
    <SkillsHome
      skills={listSkills()}
      bullets={listBullets()}
      portfolio={listPortfolio()}
      used={counts.used}
    />
  );
}
