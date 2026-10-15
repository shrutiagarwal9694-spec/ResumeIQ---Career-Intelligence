# ResumeIQ — AI-Based Resume Analyzer & ATS Checker

ResumeIQ is a capstone-ready full-stack web application for the Web Developer domain. It analyzes a resume against a target job description and produces an ATS-oriented score, keyword coverage, section checks, actionable recommendations, and a downloadable analysis report.

## Stack
- Frontend: React + Vite
- Styling: CSS
- Resume parsing: browser-side text extraction for PDF/DOCX/TXT
- Backend: Node.js + Express
- Database: SQLite
- Auth: JWT + bcrypt
- Charts: Recharts
- Icons: Lucide React

## Important scope note
This starter is fully runnable and functional, but it does not claim to be a proprietary LLM or enterprise ATS. The analyzer uses a deterministic scoring engine so it works without paid AI API keys. It can later be upgraded with an LLM provider through the server.

## Features
- Register/login
- Resume upload: PDF, DOCX, TXT
- Resume text extraction
- Job description input
- ATS score
- Keyword match / missing keywords
- Section completeness
- Contact/link checks
- Experience/skills/education/project checks
- Formatting-risk heuristics
- Improvement recommendations
- Analysis history stored in SQLite
- Dashboard with previous analyses
- Delete history
- Responsive professional UI
- Download analysis as JSON
- No external AI API key required

## Requirements
- Node.js 18+
- npm 9+
- Windows/macOS/Linux

## Run on Windows
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Open Terminal.
4. Run:
   `npm install`
5. Run:
   `npm run install-all`
6. Run:
   `npm run dev`
7. Open:
   `http://localhost:5173`

Backend:
`http://localhost:5000`

The SQLite database is created automatically at:
`server/data/resumeiq.sqlite`

## Demo flow
1. Register an account.
2. Login.
3. Go to Analyze.
4. Upload a resume.
5. Paste a job description.
6. Click Analyze Resume.
7. Review ATS score, keywords, sections and recommendations.
8. Dashboard keeps the analysis history.

## Future production upgrades
- Cloud object storage for resumes
- PostgreSQL
- Queue/background processing
- LLM-based semantic matching
- OCR for scanned PDFs
- DOCX/PDF report generation
- Stripe subscriptions
- Admin analytics
- Resume versioning
- Job tracker
- Public shareable report
- Privacy/consent controls and automatic file deletion
