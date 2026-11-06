import { NextResponse } from "next/server";
import { gmailAuthUrl, gmailConfigured } from "@/lib/gmail";

export async function GET(request: Request) {
  if (!gmailConfigured()) {
    return NextResponse.redirect(new URL("/applications?gmail=off", request.url));
  }
  return NextResponse.redirect(gmailAuthUrl(new URL(request.url).origin));
}
