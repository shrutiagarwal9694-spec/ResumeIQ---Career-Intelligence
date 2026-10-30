# ResumeIQ

ResumeIQ is a full-stack resume analysis application built for ATS-focused job application improvement. It helps users compare resume evidence against a target job description, identify required and preferred skill gaps, inspect job responsibility alignment, and review estimated resume parsing readability.

This project is designed as a capstone-ready application with a polished frontend, a working authentication flow, resume analysis engine, analysis history, and a career assistant experience.

## Project overview

ResumeIQ combines:
- a responsive React frontend for landing, auth, dashboard, analysis, and history screens
- a Node.js + Express API for authentication, analysis, chat, and data access
- SQLite persistence for users and saved resume analyses
- a deterministic, evidence-based resume analysis engine with weighted job matching and independent ATS readability scoring
- optional external AI support for career-assistant chat; resume analysis does not send documents to an external model

## Core features

- User registration and login
- JWT-based authentication
- Editable, user-scoped profile and ATS optimizer preferences
- User-owned default resume storage (PDF, DOCX, TXT; maximum 4 MB) and resume export
- JSON profile/history export and CSV analysis-history export
- User-scoped in-app job-match alerts, weekly ATS tips, and fact-preserving bullet evidence suggestions
- Paginated notifications page with unread/category filters and persistent read/delete actions
- Resume upload support for PDF, DOCX, and TXT files
- Resume text extraction from uploaded documents
- Job description input for targeted analysis
- Job Match Score calculated from required/preferred skills, responsibility evidence, projects, explicit qualifications, demonstrated impact, and ATS readability
- Independent estimated ATS readability score based on extracted text and recognized resume sections
- Required and preferred skill comparisons with contextual resume evidence
- Explicit resume-only readability mode when no job description is provided
- Resume section completeness checks
- Text-extraction and resume-readability warnings
- Actionable recommendations for improvement
- Saved analysis history per authenticated user
- History view and deletion support
- Downloadable JSON analysis output
- Downloadable multi-page PDF reports for saved analyses
- Career assistant chat with resume-aware fallback guidance
- Modern responsive UI for desktop, tablet, and mobile

## Tech stack

### Frontend
- React
- Vite
- React Router
- jsPDF and jsPDF-AutoTable for paginated saved-analysis PDF reports
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
- Deterministic rule-based score arithmetic and keyword normalization
- Practical skill evidence checks, required/preferred requirement handling, and source-text evidence
- Score weights: skills 30%, experience/responsibilities 25%, projects 15%, education/certifications 10%, achievements 10%, and ATS readability 10%
- Unavailable score dimensions are excluded and the remaining weights are proportionally renormalized
- Resume text is extracted in the browser; OCR and external semantic resume analysis are not configured. Scanned documents may need text extraction before analysis.

Run the analyzer tests with `npm --prefix server test`.

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
- PUT `/api/profile/resume` (authenticated, raw `application/octet-stream` body; `X-Resume-File-Name` contains the URL-encoded filename)
- GET `/api/profile/resume` (authenticated current user's stored resume)
- GET `/api/profile/export?format=json|csv`
- GET `/api/notifications?page=1&limit=20&category=job_match&read=false`
- GET `/api/notifications/unread-count`
- PATCH `/api/notifications/:id/read`
- PATCH `/api/notifications/:id/unread`
- PATCH `/api/notifications/read-all`
- DELETE `/api/notifications/:id`
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
Stored resumes are kept in SQLite and scoped to the authenticated user. Replacing a stored resume does not delete prior analyses. The analysis workflow may load the saved resume, and self-reported profile skills are marked as unverified when absent from resume text rather than counted as resume evidence. Profile alert preferences control in-app notification generation. Bullet suggestions preserve existing resume text and are optional; the application does not modify resumes automatically.
The notification scheduler runs inside the persistent API process, checks every 15 minutes, and creates the current week's tips on Monday at 09:00 or performs a catch-up after a restart later in that week. Set `APP_TIMEZONE` to an IANA timezone (for example `America/New_York`) to control Monday scheduling; the server host must keep the API process running. Weekly notifications are deduplicated per user and Monday period. Notifications are in-app only; email and browser push are not configured.

### Administrator provisioning

The initial administrator is `shrutiagarwal9694@gmail.com`. Set `ADMIN_INITIAL_PASSWORD` only in `server/.env` to a password of at least 8 characters. This address already exists in the current database as a regular user, so explicitly set `ADMIN_PROMOTE_EXISTING=true` to replace its password hash and promote it during startup. Without that opt-in, an existing user is never promoted based on email alone. After successful one-time provisioning, remove both bootstrap variables from the runtime environment and restart the server. Local `.env` files are ignored by Git. Admin routes and APIs verify the role stored in SQLite on each request; role selection at login does not grant privileges.

### Password recovery

Password recovery is available to ordinary users only. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `FRONTEND_URL` in `server/.env` to enable delivery. Without a working SMTP configuration, recovery requests return HTTP 503 and no reset link is created or claimed to have been sent. Reset tokens are random, stored only as keyed hashes, expire after 30 minutes, are single-use, and are invalidated after a successful reset. Requests and verification attempts are rate-limited; successful resets increment the account auth version and revoke its existing sessions.

## Optional AI integration

The chat assistant supports an optional external AI provider via environment variables if the project is configured to use one. Only the chat message is sent to that provider; resume-analysis results, extracted resume text, and job descriptions are not. If no provider is configured, the app uses a built-in fallback career guidance response to keep the assistant functional without requiring paid API keys.

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
6. Run a job-match analysis, or leave the job description blank for resume-only readability.
7. Review the Job Match Score, separate ATS readability estimate, skill evidence, responsibility comparisons, and recommendations.
8. Save and revisit previous analyses from the History page.

## Database

The project uses SQLite and creates the database automatically at:

```text
server/data/resumeiq.sqlite
```

The database stores:
- users
- analyses associated with the authenticated user, including separate job-match/readability scores and the saved structured report

## Resume analysis logic

The analysis engine uses deterministic requirement extraction and score arithmetic. Required and preferred technical skills are counted once, and a skills-list mention is not treated as practical experience. Responsibility matching uses token overlap against extracted resume statements; education/certification checks only explicit job-description terms. The Job Match Score uses configurable weights and redistributes unavailable dimensions across the dimensions that can be assessed. The independent readability estimate is based on recognized sections, contact-detail detection, and extracted-text length.

The report stores the exact job-description snapshot and a SHA-256 fingerprint of the extracted resume text with its analysis result; it does not persist the full resume text. Analysis history and deletion remain scoped to the authenticated user. Previously saved reports are identified as legacy scores because their former blended score cannot be reliably separated into job-match and ATS-readability components.

No OCR or external semantic analysis is configured for resumes. The current skill vocabulary and responsibility matching are deterministic and can miss uncommon terminology or paraphrases. The scores are estimates, not predictions of a specific ATS decision or hiring outcome.

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
