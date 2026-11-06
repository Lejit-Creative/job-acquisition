# Job search

A local Next.js app for remote roles in graphic design, UX, business, and finance. Data stays in SQLite on this machine.

## Run

```bash
cd /Users/joshuathomas/job-acquisition
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
```

## What is on without any keys

- Jobs home, criteria, manual add, and paste-a-URL for public postings
- Greenhouse, Lever, Ashby, and Remote OK search, on a schedule and on demand
- Skills, bullets, and portfolio
- Prepare application: company language, bullet mapping, and clarifying questions
- Themed resume and cover-letter PDFs
- Application tracker with a stage line you move by hand
- Positioning assembled from your own words

## What stays off until you add a key

Copy `.env.example` to `.env.local`. Do not commit that file.

| Need | Variables |
| --- | --- |
| Fit score, resume rewrite, match score, hiring-manager pass, positioning polish | `LLM_API_KEY` or `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| Adzuna | `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` |
| USAJobs | `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT` (your email) |
| Read-only Gmail | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |

Gmail’s redirect URI is `http://localhost:3000/api/gmail/callback`. The scope is `gmail.readonly`. Without it, stages still move by hand. The app never sets Offer or Interview from mail until you confirm.

LinkedIn, Indeed, and similar sites are refused. Paste those roles with Add job.
