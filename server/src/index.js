import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { signToken, requireAuth } from "./auth.js";
import { analyzeResume } from "./analyzer.js";

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = new Set([
  process.env.CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "5mb" }));

function looksCareerRelated(message = "") {
  const text = message.toLowerCase();
  return /(resume|ats|job|career|interview|linkedin|portfolio|skill|application|role|salary|cover|profile)/.test(text);
}

function buildFallbackReply(message, analysis = {}) {
  const text = (message || "").toLowerCase();
  if (!looksCareerRelated(text)) {
    return "I specialize in career and resume guidance. Ask me about ATS optimization, resume keywords, interview prep, or job-search strategy.";
  }

  if (/(ats|score)/.test(text)) {
    const overall = Number(analysis.overallScore ?? 82);
    const keyword = Number(analysis.keywordScore ?? 89);
    const skill = Number(analysis.skillScore ?? 84);
    return `Your latest ATS snapshot shows ${overall}% overall, with keyword strength at ${keyword}% and skills at ${skill}%. The strongest improvement lever is usually keyword alignment and measurable impact statements in your bullets.`;
  }

  if (/(keyword|keywords|skills|missing)/.test(text)) {
    const missing = Array.isArray(analysis.missingKeywords) && analysis.missingKeywords.length ? analysis.missingKeywords.slice(0, 5).join(", ") : "role-specific tools, hard skills, and action verbs";
    return `Add the role-specific target keywords naturally across your summary, skills, and experience. A strong list to prioritize includes ${missing}. Keep the wording accurate and tailored to the job description.`;
  }

  if (/(section|resume sections|format)/.test(text)) {
    return "Review your summary, skills, experience, education, and projects for clarity and consistency. Recruiters and ATS systems respond best to clean headings, visible dates, and brief quantified accomplishments.";
  }

  if (/(interview|prepare)/.test(text)) {
    return "Prepare for both the technical and behavioral parts of the interview. Practice a concise introduction, rehearse STAR answers, and be ready to explain how your work connects to the job requirements.";
  }

  if (/(linkedin|profile)/.test(text)) {
    return "Update your headline, summary, and experience bullets to reflect your strongest achievements. Match your profile language to the roles you want and add measurable wins wherever possible.";
  }

  if (/(career|roadmap|growth)/.test(text)) {
    return "A focused career plan usually combines role clarity, targeted skill-building, and a portfolio of proof. Prioritize one role track, learn the top skills for it, and make your resume match that story closely.";
  }

  return "A strong next step is to align your resume to the target role: tighten your summary, add missing keywords, and highlight measurable wins that match the job requirements.";
}

async function callProvider(message, analysis = {}) {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey || !provider) return null;

  try {
    if (provider.includes("openai")) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are ResumeIQ Career Assistant. Provide concise, professional, action-oriented career and resume advice. Never pretend to be a human or expose personal data." },
            { role: "user", content: JSON.stringify({ message, analysis }) },
          ],
          temperature: 0.4,
        }),
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
    }
  } catch {
    return null;
  }

  return null;
}

app.get("/api/health", (_, res) => res.json({ ok: true, service: "ResumeIQ API" }));

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ message: "Name, email and a 6+ character password are required." });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)").run(name.trim(), email.trim().toLowerCase(), hash);
    const user = { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase() };
    res.json({ token: signToken(user), user });
  } catch {
    res.status(409).json({ message: "An account with this email already exists." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || "", user.password_hash)))
    return res.status(401).json({ message: "Invalid email or password." });

  const safeUser = { id: user.id, name: user.name, email: user.email };
  res.json({ token: signToken(safeUser), user: safeUser });
});

app.post("/api/analyze", requireAuth, (req, res) => {
  const { resumeText, resumeName, jobDescription, jobTitle } = req.body;
  if (!resumeText || !jobDescription)
    return res.status(400).json({ message: "Resume text and job description are required." });

  const result = analyzeResume({ resumeText, jobDescription });
  const info = db.prepare(`
    INSERT INTO analyses (user_id,resume_name,job_title,score,result_json)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, resumeName || "Resume", jobTitle || "Target Role", result.overallScore, JSON.stringify(result));

  res.json({ id: info.lastInsertRowid, ...result });
});

app.get("/api/analyses", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id,resume_name,job_title,score,created_at FROM analyses
    WHERE user_id=? ORDER BY id DESC
  `).all(req.user.id);
  res.json(rows);
});

app.get("/api/analyses/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM analyses WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ message: "Analysis not found." });
  res.json({ ...row, result: JSON.parse(row.result_json) });
});

app.delete("/api/analyses/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM analyses WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const context = req.body?.context || {};

  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  const analysis = context.analysis && typeof context.analysis === "object" ? context.analysis : {};

  try {
    const providerReply = await callProvider(message, analysis);
    if (providerReply) {
      return res.json({ reply: providerReply });
    }

    return res.json({ reply: buildFallbackReply(message, analysis) });
  } catch {
    return res.json({ reply: buildFallbackReply(message, analysis) });
  }
});

app.listen(PORT, () => console.log(`ResumeIQ API running at http://localhost:${PORT}`));
