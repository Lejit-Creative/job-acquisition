import { gmailRefreshToken, listApplications, markGmailSynced, saveGmail, upsertMail } from "./db";
import { suggestStage } from "./stages";

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gmailAuthUrl(origin: string): string {
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

async function accessToken(): Promise<string> {
  const refresh = gmailRefreshToken();
  if (!refresh) throw new Error("Gmail is not connected.");
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Gmail token refresh failed (${response.status}).`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail did not return an access token.");
  return data.access_token;
}

export async function exchangeCode(code: string, origin: string) {
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Google sign-in failed (${response.status}).`);
  const data = (await response.json()) as { refresh_token?: string; access_token?: string };
  if (!data.refresh_token) throw new Error("Google did not return a refresh token. Try connecting again.");
  let email = "";
  if (data.access_token) {
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${data.access_token}` },
    });
    if (profile.ok) {
      const info = (await profile.json()) as { email?: string };
      email = info.email ?? "";
    }
  }
  saveGmail(data.refresh_token, email);
}

type GmailList = { messages?: { id: string; threadId: string }[] };
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function syncGmail(): Promise<{ matched: number }> {
  if (!gmailConfigured()) throw new Error("Gmail stays off until Google OAuth credentials are set.");
  const token = await accessToken();
  const applications = listApplications();
  let matched = 0;
  for (const application of applications) {
    if (application.company.trim().length < 2) continue;
    const query = `"${application.company.replace(/"/g, "")}" newer_than:120d`;
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", query);
    listUrl.searchParams.set("maxResults", "8");
    const listed = await fetch(listUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!listed.ok) throw new Error(`Gmail search failed (${listed.status}).`);
    const data = (await listed.json()) as GmailList;
    for (const item of data.messages ?? []) {
      const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}`);
      messageUrl.searchParams.set("format", "metadata");
      messageUrl.searchParams.append("metadataHeaders", "Subject");
      messageUrl.searchParams.append("metadataHeaders", "From");
      messageUrl.searchParams.append("metadataHeaders", "Date");
      const response = await fetch(messageUrl, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) continue;
      const message = (await response.json()) as GmailMessage;
      const subject = header(message, "Subject");
      const blob = `${subject}\n${message.snippet ?? ""}`;
      if (!blob.toLowerCase().includes(application.company.toLowerCase())) continue;
      const suggestion = suggestStage(blob);
      upsertMail({
        applicationId: application.id,
        gmailId: message.id,
        threadId: message.threadId,
        subject,
        snippet: message.snippet ?? "",
        fromAddr: header(message, "From"),
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
        suggestsStage: suggestion?.stage ?? null,
        suggestionReason: suggestion?.reason ?? "",
      });
      matched += 1;
    }
  }
  markGmailSynced();
  return { matched };
}
