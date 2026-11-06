import { getApplication, getJob, getProfile, getTailor, listBullets, listPortfolio, listSkills } from "./db";
import { buildResume, eligibleBullets, themeById } from "./resume";
import type { ResumeContent } from "./types";
import type { RewriteFile } from "./tailor";

function readRewrite(raw: string | undefined): RewriteFile | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RewriteFile;
  } catch {
    return null;
  }
}

export function materialsForJob(jobId: number, themeId?: string): { profile: ReturnType<typeof getProfile>; content: ResumeContent } | null {
  const job = getJob(jobId);
  if (!job) return null;
  const profile = getProfile();
  const skills = listSkills();
  const portfolio = listPortfolio();
  const rewrite = readRewrite(getTailor(jobId)?.rewriteJson);
  const application = job.applicationId ? getApplication(job.applicationId) : null;
  const chosenTheme = themeId || application?.theme_id || "paper";
  if (application?.resume_json) {
    try {
      const stored = JSON.parse(application.resume_json) as ResumeContent;
      if (stored && Array.isArray(stored.bullets)) {
        return {
          profile,
          content: { ...stored, themeId: chosenTheme, targetTitle: job.title, targetCompany: job.company },
        };
      }
    } catch {
      /* rebuild from the library */
    }
  }
  const bullets = eligibleBullets(listBullets());
  const chosen = (rewrite?.bullets?.length ? rewrite.bullets : bullets.slice(0, 6).map((bullet) => ({
    before: bullet.body,
    after: bullet.body,
    context: bullet.context,
  }))).slice(0, 8);
  const content = buildResume({
    themeId: themeById(chosenTheme).id,
    profile,
    title: job.title,
    company: job.company,
    summary: rewrite?.summary || profile.summary,
    bullets: chosen,
    skills,
    portfolio,
    coverLetter: rewrite?.coverLetter || application?.cover_letter,
  });
  return { profile, content };
}
