import { connection } from "next/server";
import { ApplicationsHome } from "@/components/applications-home";
import { gmailStatus, listApplications, stageCounts } from "@/lib/db";
import { gmailConfigured } from "@/lib/gmail";

export default async function ApplicationsPage() {
  await connection();
  const gmail = gmailStatus();
  const counts = stageCounts();
  return (
    <ApplicationsHome
      rows={listApplications()}
      counts={counts}
      gmailConfigured={gmailConfigured()}
      gmailConnected={gmail.connected}
      gmailEmail={gmail.email}
    />
  );
}
