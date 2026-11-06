import { connection } from "next/server";
import { ApplicationView } from "@/components/application-view";
import { getApplication, listFiles, listMail, listStageEvents } from "@/lib/db";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const application = getApplication(Number(id));
  if (!application) return <p className="banner">That application is gone.</p>;
  const events = listStageEvents(application.id);
  return (
    <ApplicationView
      id={application.id}
      title={application.title}
      company={application.company}
      stage={application.stage}
      themeId={application.theme_id}
      coverLetter={application.cover_letter}
      events={events}
      mail={listMail(application.id)}
      files={listFiles(application.id)}
      appliedAt={events.find((event) => event.stage === "applied")?.enteredAt ?? null}
    />
  );
}
