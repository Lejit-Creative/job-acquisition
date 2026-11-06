import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/applications?gmail=missing", request.url));
  try {
    await exchangeCode(code, url.origin);
    return NextResponse.redirect(new URL("/applications?gmail=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/applications?gmail=failed", request.url));
  }
}
