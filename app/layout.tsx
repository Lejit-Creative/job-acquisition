import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";
import { connection } from "next/server";
import { Shell } from "@/components/shell";
import { getProfile } from "@/lib/db";
import { gmailConfigured } from "@/lib/gmail";
import { llmEnabled } from "@/lib/llm";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: "Job search",
  description: "Local search for remote design, UX, business, and finance roles.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const profile = getProfile();
  return (
    <html lang="en" className={`${outfit.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("ja-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
        <Shell profile={profile} llm={llmEnabled()} gmail={gmailConfigured()}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
