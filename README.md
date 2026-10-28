# ResumeIQ

ResumeIQ is a full-stack resume analysis application built for ATS-focused job application improvement. It helps users upload a resume, compare it against a target job description, identify keyword gaps, check missing resume sections, score ATS readiness, and receive practical recommendations to improve job-fit before applying.

This project is designed as a capstone-ready application with a polished frontend, a working authentication flow, resume analysis engine, analysis history, and a career assistant experience.

## Project overview

ResumeIQ combines:
- a responsive React frontend for landing, auth, dashboard, analysis, and history screens
- a Node.js + Express API for authentication, analysis, chat, and data access
- SQLite persistence for users and saved resume analyses
- a deterministic resume analysis engine for ATS scoring and keyword matching
- optional AI enhancement support through an external provider if configured

## Core features

- User registration and login
- JWT-based authentication
- Resume upload support for PDF, DOCX, and TXT files
- Resume text extraction from uploaded documents
- Job description input for targeted analysis
- ATS score calculation from 0 to 100
- Keyword match and missing keyword detection
- Skills match analysis against target job requirements
- Resume section completeness checks
- Formatting and weak-signal detection
- Actionable recommendations for improvement
- Saved analysis history per authenticated user
- History view and deletion support
- Downloadable JSON analysis output
- Career assistant chat with resume-aware fallback guidance
- Modern responsive UI for desktop, tablet, and mobile

## Tech stack

### Frontend
- React
- Vite
- React Router
- Recharts
- Lucide React
- Custom CSS styling system

### Backend
- Node.js
- Express
- JWT for auth
- bcryptjs for password hashing
- SQLite via better-sqlite3
- CORS and dotenv support

### Resume analysis
- Browser-side extraction for PDF, DOCX, and TXT
- Rule-based ATS scoring engine
- Keyword normalization and matching logic

## Project structure

```text
ResumeIQ_Capstone_Project/
├── README.md
├── package.json
├── client/
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── styles.css
├── server/
│   ├── package.json
│   ├── data/
│   │   └── resumeiq.sqlite
│   └── src/
│       ├── analyzer.js
│       ├── auth.js
│       ├── db.js
│       └── index.js
└── .gitignore
```

## Authentication and API behavior

The backend exposes the following main endpoints:

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/profile`
- PATCH `/api/profile`
- GET `/api/auth/me`
- POST `/api/auth/password-reset/request`
- POST `/api/auth/password-reset/complete`
- GET `/api/admin/overview` (admin)
- GET `/api/admin/users` (admin)
- GET `/api/admin/users/:id` (admin)
- GET `/api/admin/analyses` (admin)
- POST `/api/analyze`
- GET `/api/analyses`
- GET `/api/analyses/:id`
- DELETE `/api/analyses/:id`
- POST `/api/chat`
- GET `/api/health`

Authentication is required for analysis and history access. The frontend stores the JWT in localStorage and reuses it for protected fetches.
Profile and analysis endpoints derive ownership from the verified JWT; a client-supplied user ID is never used as proof of access. Set `JWT_SECRET` to a long random value in deployments. Local development creates a persistent random signing secret in the ignored `server/data/.jwt-secret` file when the variable is not set.

### Administrator provisioning

The initial administrator is `shrutiagarwal9694@gmail.com`. Set `ADMIN_INITIAL_PASSWORD` only in `server/.env` to a password of at least 8 characters. This address already exists in the current database as a regular user, so explicitly set `ADMIN_PROMOTE_EXISTING=true` to replace its password hash and promote it during startup. Without that opt-in, an existing user is never promoted based on email alone. After successful one-time provisioning, remove both bootstrap variables from the runtime environment and restart the server. Local `.env` files are ignored by Git. Admin routes and APIs verify the role stored in SQLite on each request; role selection at login does not grant privileges.

### Password recovery

Password recovery is available to ordinary users only. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `FRONTEND_URL` in `server/.env` to enable delivery. Without a working SMTP configuration, recovery requests return HTTP 503 and no reset link is created or claimed to have been sent. Reset tokens are random, stored only as keyed hashes, expire after 30 minutes, are single-use, and are invalidated after a successful reset. Requests and verification attempts are rate-limited; successful resets increment the account auth version and revoke its existing sessions.

## Optional AI integration

The chat assistant supports an optional external AI provider via environment variables if the project is configured to use one. If no provider is configured, the app uses a built-in fallback career guidance response to keep the assistant functional without requiring paid API keys.

Common optional variables include:
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_MODEL`
- `CLIENT_ORIGIN`
- `PORT`

## Prerequisites

- Node.js 18+
- npm 9+
- A modern browser

## Installation

From the project root:

```bash
npm install
npm run install-all
```

This installs the root tooling plus the frontend and backend dependencies.

## Run the project

From the project root:

```bash
npm run dev
```

This starts both services concurrently:
- Frontend: Vite dev server
- Backend: Express server on port 5000

### Typical local URLs
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

> If port 5173 is already in use, Vite may automatically pick another local port such as 5174 or 5175.

## Application flow

1. Open the landing page.
2. Sign up or log in.
3. Navigate to the Analyze Resume page.
4. Upload a PDF, DOCX, or TXT resume.
5. Paste a target job description.
6. Run the ATS analysis.
7. Review score, keyword gaps, skills, section presence, formatting risks, and recommendations.
8. Save and revisit previous analyses from the History page.

## Database

The project uses SQLite and creates the database automatically at:

```text
server/data/resumeiq.sqlite
```

The database stores:
- users
- analyses

## Resume analysis logic

The analysis engine performs rule-based ATS scoring based on:
- keyword coverage against the job description
- missing keywords
- skills present in the resume vs. role requirements
- section presence and completeness
- formatting and weak-signal warnings
- recommendation generation based on gaps

This makes the tool work without requiring a paid AI service and keeps the project fully functional in a local environment.

## Notes for capstone/demo use

This project is ready for a functional demo and presentation:
- professional landing page
- working authentication flow
- analysis workflow
- dashboard and history
- targeted ATS scoring logic
- career assistant fallback support

It is suitable for showcasing a practical full-stack resume optimization system for student or portfolio presentation.

## Future improvements

Possible upgrades for a production version include:
- cloud resume storage
- OCR support for scanned PDFs
- richer AI-powered semantic matching
- PDF/DOCX report export generation
- improved analytics and dashboard filters
- user profile management
- role-based access and admin tooling
- larger dataset and benchmark evaluation

## License

This project is intended for academic and portfolio use unless otherwise stated by the repository owner.
