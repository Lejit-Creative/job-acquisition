"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveProfileAction } from "@/app/actions";
import type { Profile } from "@/lib/types";
import { Dialog, Notice } from "./ui";

const NAV = [
  { href: "/", label: "Jobs" },
  { href: "/skills", label: "Skills" },
  { href: "/tailor", label: "Prepare application" },
  { href: "/applications", label: "Applications" },
  { href: "/positioning", label: "Positioning" },
];

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name}`;
}

function dateLine() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" })
    .format(new Date())
    .toUpperCase();
}

export function Shell({
  profile,
  llm,
  gmail,
  children,
}: {
  profile: Profile;
  llm: boolean;
  gmail: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [profileOpen, setProfileOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("ja-theme");
    if (stored === "dark") setTheme("dark");
    if (!localStorage.getItem("ja-welcomed")) setWelcome(true);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next === "dark" ? "dark" : "";
    if (next === "light") delete document.documentElement.dataset.theme;
    localStorage.setItem("ja-theme", next);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">J</div>
          <div>
            <strong>{profile.displayName}&apos;s search</strong>
            <span>Local</span>
          </div>
        </div>
        <form className="search" action="/" method="get">
          <input name="q" placeholder="Search" aria-label="Search roles" />
          <kbd>⌘K</kbd>
        </form>
        <nav className="nav">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="side-label">Library</p>
        <p className="nav-note meta">Skills, bullets, and portfolio stay on this machine.</p>
        <div className="account">
          <div className="avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>
          <div className="who">
            <strong>{profile.displayName}</strong>
            <button type="button" className="text-btn" onClick={() => setProfileOpen(true)}>
              Edit profile
            </button>
          </div>
          <button type="button" className="btn-ghost" onClick={toggleTheme} data-testid="theme-toggle">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="hello">
          <div>
            <p className="date-line">{dateLine()}</p>
            <h1>{greeting(profile.displayName)}</h1>
          </div>
        </header>
        {children}
      </div>
      <Dialog
        open={welcome}
        blue
        kicker="On this machine"
        title="Your search is ready"
        onClose={() => {
          localStorage.setItem("ja-welcomed", "1");
          setWelcome(false);
        }}
        footer={
          <button
            type="button"
            className="btn"
            onClick={() => {
              localStorage.setItem("ja-welcomed", "1");
              setWelcome(false);
            }}
          >
            Start
          </button>
        }
      >
        <p>
          New roles default to remote, at least $50,000 when pay is listed, and graphic design, UX, business, or
          finance. Pay-unknown roles stay visible.
        </p>
        <p className="meta">
          {llm
            ? "Fit scoring and resume rewrite are on."
            : "Fit scoring and resume rewrite stay off until you set an API key."}{" "}
          {gmail ? "Gmail can be connected as read-only." : "Gmail stays off until Google credentials are added. You can still move stages by hand."}
        </p>
      </Dialog>
      <Dialog open={profileOpen} kicker="Account" title="Facts the resume can use" onClose={() => setProfileOpen(false)}>
        <form
          className="form"
          action={async (formData) => {
            const result = await saveProfileAction(formData);
            setNote(result.ok ? "Profile saved." : result.error);
            if (result.ok) {
              setProfileOpen(false);
              router.refresh();
            }
          }}
        >
          <Notice message={note} />
          <label>
            Name
            <input name="displayName" defaultValue={profile.displayName} />
          </label>
          <label>
            Headline
            <input name="headline" defaultValue={profile.headline} placeholder="Only if you want it on the PDF" />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue={profile.email} />
          </label>
          <label>
            Phone
            <input name="phone" defaultValue={profile.phone} />
          </label>
          <label>
            Location
            <input name="location" defaultValue={profile.location} />
          </label>
          <label>
            Summary
            <textarea name="summary" defaultValue={profile.summary} />
          </label>
          <label>
            Links, one per line
            <textarea name="links" defaultValue={profile.links} />
          </label>
          <button className="btn" type="submit">
            Save
          </button>
        </form>
      </Dialog>
    </div>
  );
}
