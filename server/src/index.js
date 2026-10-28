import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";
import db from "./db.js";
import { signToken, requireAuth, requireAdmin, hashForStorage } from "./auth.js";
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

const MONTHLY_SCAN_LIMIT = 500;
const EXPERIENCE_LEVELS = ["Student / Fresher (0 years)", "0-1 years", "1-3 years", "3-5 years", "5+ years"];
const ATS_STANDARDS = ["US / Global ATS Standard", "Indian ATS Standard", "UK ATS Standard", "Other"];
const TARGET_INDUSTRIES = [
  "Software & SaaS",
  "Artificial Intelligence / Machine Learning",
  "IT Services",
  "Finance & Banking",
  "Healthcare",
  "Education",
  "E-commerce",
  "Other",
];
const JOB_SEEKING_STATUSES = ["Active", "Open to Opportunities", "Not Looking"];

function parseStringList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function profileForUser(userId) {
  const user = db.prepare(`
    SELECT id,name,email,phone,location,experience_level,target_job_titles_json,
      ats_standard,target_industry,technical_skills_json,job_seeking_status,created_at
    FROM users WHERE id=?
  `).get(userId);
  if (!user) return null;

  const usage = db.prepare(`
    SELECT COUNT(*) AS used FROM analyses
    WHERE user_id=? AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')
  `).get(userId);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    location: user.location,
    experienceLevel: user.experience_level,
    targetJobTitles: parseStringList(user.target_job_titles_json),
    atsStandard: user.ats_standard,
    targetIndustry: user.target_industry,
    technicalSkills: parseStringList(user.technical_skills_json),
    jobSeekingStatus: user.job_seeking_status,
    createdAt: user.created_at,
    monthlyScans: { used: usage.used, limit: MONTHLY_SCAN_LIMIT },
  };
}

const ADMIN_EMAIL = "shrutiagarwal9694@gmail.com";
const RESET_RESPONSE = "If an eligible account exists for this email, you will receive instructions to reset your password.";
const RESET_UNAVAILABLE = "Password recovery email is not configured. Please contact support.";
const RESET_WINDOW_MINUTES = 15;

function resetIpHash(req) {
  return hashForStorage(req.ip || req.socket.remoteAddress || "unknown");
}

function countRecentResetEvents(eventType, column, value) {
  const allowedColumns = new Set(["identifier_hash", "ip_hash"]);
  if (!allowedColumns.has(column)) throw new Error("Invalid rate-limit identifier.");
  return db.prepare(`
    SELECT COUNT(*) AS count FROM password_reset_events
    WHERE event_type=? AND ${column}=? AND created_at>=datetime('now',?)
  `).get(eventType, value, `-${RESET_WINDOW_MINUTES} minutes`).count;
}

function recordResetEvent(eventType, identifierHash, ipHash) {
  db.prepare(`
    INSERT INTO password_reset_events (event_type,identifier_hash,ip_hash) VALUES (?,?,?)
  `).run(eventType, identifierHash, ipHash);
  db.prepare("DELETE FROM password_reset_events WHERE created_at<datetime('now','-1 day')").run();
}

function createResetMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN;
  if (!host || !Number.isInteger(port) || !user || !password || !from || !frontendUrl) return null;
  if (process.env.NODE_ENV === "production" && !frontendUrl.startsWith("https://")) return null;

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass: password },
    }),
    frontendUrl,
    from,
  };
}

async function provisionInitialAdmin() {
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword) return;
  if (initialPassword.length < 8) throw new Error("ADMIN_INITIAL_PASSWORD must contain at least 8 characters.");

  const existing = db.prepare("SELECT id,role FROM users WHERE email=?").get(ADMIN_EMAIL);
  if (existing?.role === "admin") return;
  if (existing && process.env.ADMIN_PROMOTE_EXISTING !== "true") {
    console.warn("Admin account exists without an admin role; explicit promotion is required.");
    return;
  }

  const passwordHash = await bcrypt.hash(initialPassword, 12);
  if (existing) {
    db.prepare("UPDATE users SET role='admin',password_hash=?,last_active_at=CURRENT_TIMESTAMP WHERE id=?").run(passwordHash, existing.id);
    console.info("Configured administrator account was promoted.");
    return;
  }

  db.prepare(`
    INSERT INTO users (name,email,password_hash,role,last_active_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
  `).run("ResumeIQ Admin", ADMIN_EMAIL, passwordHash, "admin");
  console.info("Initial administrator account was created.");
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ message: "Name, email and a 6+ character password are required." });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name,email,password_hash,last_active_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
    `).run(name.trim(), email.trim().toLowerCase(), hash);
    const user = { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: "user" };
    res.json({ token: signToken(user), user });
  } catch {
    res.status(409).json({ message: "An account with this email already exists." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, requestedRole } = req.body;
  if (requestedRole !== undefined && !["user", "admin"].includes(requestedRole)) {
    return res.status(400).json({ message: "Choose a valid account role." });
  }
  const user = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || "", user.password_hash)))
    return res.status(401).json({ message: "Invalid email or password." });
  if (requestedRole && requestedRole !== user.role) {
    return res.status(403).json({ message: requestedRole === "admin" ? "This account does not have administrator access." : "Use the administrator sign-in option for this account." });
  }

  db.prepare("UPDATE users SET last_active_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ token: signToken({ id: user.id, auth_version: user.auth_version }), user: safeUser });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(401).json({ message: "Invalid or expired session" });
  res.json(user);
});

app.post("/api/auth/password-reset/request", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const mailer = createResetMailer();
  if (!mailer) return res.status(503).json({ message: RESET_UNAVAILABLE });

  const emailHash = hashForStorage(email);
  const ipHash = resetIpHash(req);
  const emailRequestCount = countRecentResetEvents("request", "identifier_hash", emailHash);
  const ipRequestCount = countRecentResetEvents("request", "ip_hash", ipHash);
  if (ipRequestCount >= 25) {
    return res.status(429).json({ message: "Too many reset requests. Please try again later." });
  }
  recordResetEvent("request", emailHash, ipHash);
  if (emailRequestCount >= 3) return res.json({ message: RESET_RESPONSE });
  try {
    await mailer.transporter.verify();
  } catch {
    return res.status(503).json({ message: RESET_UNAVAILABLE });
  }

  const user = db.prepare("SELECT id FROM users WHERE email=? AND role='user'").get(email);
  if (!user) return res.json({ message: RESET_RESPONSE });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashForStorage(token);
  db.prepare("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL").run(user.id);
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id,token_hash,expires_at)
    VALUES (?,?,datetime('now','+30 minutes'))
  `).run(user.id, tokenHash);

  const resetUrl = new URL("/reset-password", mailer.frontendUrl);
  resetUrl.searchParams.set("token", token);
  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: email,
      subject: "Reset your ResumeIQ password",
      text: `Use this link to create a new ResumeIQ password. It expires in 30 minutes and can only be used once.\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link to create a new ResumeIQ password. It expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
    return res.json({ message: RESET_RESPONSE });
  } catch {
    db.prepare("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?").run(tokenHash);
    return res.json({ message: RESET_RESPONSE });
  }
});

app.post("/api/auth/password-reset/complete", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const strongPassword = password.length >= 8 && password.length <= 128
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  const tokenHash = hashForStorage(token);
  const ipHash = resetIpHash(req);
  const tokenAttempts = countRecentResetEvents("complete", "identifier_hash", tokenHash);
  const ipAttempts = countRecentResetEvents("complete", "ip_hash", ipHash);
  if (tokenAttempts >= 5 || ipAttempts >= 20) {
    return res.status(429).json({ message: "Too many reset attempts. Request a new link and try again later." });
  }
  recordResetEvent("complete", tokenHash, ipHash);

  if (token.length !== 43 || !strongPassword) {
    return res.status(400).json({ message: "The reset link is invalid or expired, or the new password does not meet the requirements." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const completeReset = db.transaction(() => {
    const reset = db.prepare(`
      SELECT t.id,t.user_id,t.expires_at,t.used_at,u.role
      FROM password_reset_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=? AND t.expires_at>CURRENT_TIMESTAMP
    `).get(tokenHash);
    if (!reset || reset.used_at || reset.role !== "user") return false;

    const update = db.prepare(`
      UPDATE users SET password_hash=?,auth_version=auth_version+1
      WHERE id=? AND role='user'
    `).run(passwordHash, reset.user_id);
    if (!update.changes) return false;
    db.prepare("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL").run(reset.user_id);
    return true;
  });

  if (!completeReset()) {
    return res.status(400).json({ message: "The reset link is invalid or expired. Request a new one." });
  }
  res.json({ message: "Your password has been reset successfully." });
});

app.get("/api/profile", requireAuth, (req, res) => {
  const user = profileForUser(req.user.id);
  if (!user) return res.status(404).json({ message: "Profile not found." });
  res.json(user);
});

app.patch("/api/profile", requireAuth, (req, res) => {
  const current = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!current) return res.status(404).json({ message: "Profile not found." });

  const name = req.body?.name === undefined ? current.name : typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = req.body?.email === undefined ? current.email : typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = req.body?.phone === undefined ? current.phone : typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  const location = req.body?.location === undefined ? current.location : typeof req.body.location === "string" ? req.body.location.trim() : "";
  const experienceLevel = req.body?.experienceLevel === undefined ? current.experience_level : req.body.experienceLevel;
  const atsStandard = req.body?.atsStandard === undefined ? current.ats_standard : req.body.atsStandard;
  const targetIndustry = req.body?.targetIndustry === undefined ? current.target_industry : req.body.targetIndustry;
  const jobSeekingStatus = req.body?.jobSeekingStatus === undefined ? current.job_seeking_status : req.body.jobSeekingStatus;
  const targetJobTitles = req.body?.targetJobTitles === undefined
    ? parseStringList(current.target_job_titles_json)
    : req.body.targetJobTitles;
  const technicalSkills = req.body?.technicalSkills === undefined
    ? parseStringList(current.technical_skills_json)
    : req.body.technicalSkills;

  if (!name || name.length > 120) return res.status(400).json({ message: "Enter a name of 1 to 120 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  if (phone && (!/^\+?[0-9\s().-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15)) {
    return res.status(400).json({ message: "Enter a valid phone number with 7 to 15 digits." });
  }
  if (location.length > 120) return res.status(400).json({ message: "Location must be 120 characters or fewer." });
  if (!EXPERIENCE_LEVELS.includes(experienceLevel)) return res.status(400).json({ message: "Choose a supported experience level." });
  if (!ATS_STANDARDS.includes(atsStandard)) return res.status(400).json({ message: "Choose a supported ATS standard." });
  if (!TARGET_INDUSTRIES.includes(targetIndustry)) return res.status(400).json({ message: "Choose a supported target industry." });
  if (!JOB_SEEKING_STATUSES.includes(jobSeekingStatus)) return res.status(400).json({ message: "Choose a supported job-seeking status." });

  const normalizeList = (list, label) => {
    if (!Array.isArray(list)) throw new Error(`${label} must be a list.`);
    const normalized = [];
    for (const item of list) {
      if (typeof item !== "string") throw new Error(`${label} entries must be text.`);
      const value = item.trim();
      if (value && !normalized.some((existing) => existing.toLowerCase() === value.toLowerCase())) normalized.push(value);
    }
    return normalized;
  };

  let cleanTitles;
  let cleanSkills;
  try {
    cleanTitles = normalizeList(targetJobTitles, "Target job titles");
    cleanSkills = normalizeList(technicalSkills, "Technical skills");
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (cleanTitles.length > 10 || cleanTitles.some((title) => title.length > 100)) {
    return res.status(400).json({ message: "Add up to 10 target job titles, each no longer than 100 characters." });
  }
  if (cleanSkills.length > 50 || cleanSkills.some((skill) => skill.length > 80)) {
    return res.status(400).json({ message: "Add up to 50 skills, each no longer than 80 characters." });
  }

  try {
    const result = db.prepare(`
      UPDATE users SET name=?,email=?,phone=?,location=?,experience_level=?,target_job_titles_json=?,
        ats_standard=?,target_industry=?,technical_skills_json=?,job_seeking_status=? WHERE id=?
    `).run(
      name,
      email,
      phone,
      location,
      experienceLevel,
      JSON.stringify(cleanTitles),
      atsStandard,
      targetIndustry,
      JSON.stringify(cleanSkills),
      jobSeekingStatus,
      req.user.id
    );
    if (!result.changes) return res.status(404).json({ message: "Profile not found." });
    res.json(profileForUser(req.user.id));
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    throw error;
  }
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
  const result = db.prepare("DELETE FROM analyses WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ message: "Analysis not found." });
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

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(5, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function getAdminOverview() {
  const metrics = {
    totalUsers: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user'").get().count,
    totalAnalyses: db.prepare("SELECT COUNT(*) AS count FROM analyses").get().count,
    totalResumesUploaded: db.prepare("SELECT COUNT(*) AS count FROM analyses WHERE resume_name IS NOT NULL AND TRIM(resume_name)<>''").get().count,
    activeUsers30Days: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user' AND last_active_at>=datetime('now','-30 days')").get().count,
    analysesToday: db.prepare("SELECT COUNT(*) AS count FROM analyses WHERE date(created_at)=date('now')").get().count,
    averageAtsScore: db.prepare("SELECT ROUND(AVG(CASE WHEN score BETWEEN 0 AND 100 THEN score END),1) AS average FROM analyses").get().average,
    newUsersThisMonth: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user' AND created_at>=date('now','start of month')").get().count,
  };
  metrics.averageAtsScore ??= 0;
  metrics.averageAnalysesPerUser = metrics.totalUsers ? Number((metrics.totalAnalyses / metrics.totalUsers).toFixed(2)) : 0;

  const firstMonth = new Date();
  firstMonth.setUTCDate(1);
  firstMonth.setUTCHours(0, 0, 0, 0);
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 11);
  const firstMonthKey = firstMonth.toISOString().slice(0, 7);
  const registrations = db.prepare(`
    SELECT strftime('%Y-%m',created_at) AS month,COUNT(*) AS count FROM users
    WHERE role='user' AND strftime('%Y-%m',created_at)>=? GROUP BY month
  `).all(firstMonthKey);
  const analysesByMonth = db.prepare(`
    SELECT strftime('%Y-%m',created_at) AS month,COUNT(*) AS count FROM analyses
    WHERE strftime('%Y-%m',created_at)>=? GROUP BY month
  `).all(firstMonthKey);
  const registrationMap = new Map(registrations.map((row) => [row.month, row.count]));
  const analysisMap = new Map(analysesByMonth.map((row) => [row.month, row.count]));
  const monthlyTrends = [];
  for (let index = 0; index < 12; index++) {
    const date = new Date(firstMonth);
    date.setUTCMonth(date.getUTCMonth() + index);
    const month = date.toISOString().slice(0, 7);
    monthlyTrends.push({
      month,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      registrations: registrationMap.get(month) || 0,
      analyses: analysisMap.get(month) || 0,
    });
  }

  const scoreDistribution = db.prepare(`
    SELECT CASE
      WHEN score<40 THEN '0-39'
      WHEN score<60 THEN '40-59'
      WHEN score<80 THEN '60-79'
      ELSE '80-100'
    END AS band,COUNT(*) AS count
    FROM analyses WHERE score BETWEEN 0 AND 100 GROUP BY band ORDER BY MIN(score)
  `).all();
  const scoreMap = new Map(scoreDistribution.map((row) => [row.band, row.count]));
  const atsScoreDistribution = ["0-39", "40-59", "60-79", "80-100"].map((band) => ({ band, count: scoreMap.get(band) || 0 }));

  const titleCounts = new Map();
  const users = db.prepare("SELECT target_job_titles_json FROM users WHERE role='user'").all();
  for (const user of users) {
    for (const title of parseStringList(user.target_job_titles_json)) {
      const normalized = title.trim();
      if (normalized) titleCounts.set(normalized, (titleCounts.get(normalized) || 0) + 1);
    }
  }
  const topTargetJobTitles = [...titleCounts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
    .slice(0, 8);

  return { metrics, monthlyTrends, atsScoreDistribution, topTargetJobTitles, timezone: "UTC" };
}

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  res.json(getAdminOverview());
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const conditions = ["u.role='user'"];
  const values = [];
  const search = String(req.query.q || "").trim();
  if (search) {
    conditions.push("(u.name LIKE ? OR u.email LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }
  for (const field of ["from", "to"]) {
    const date = req.query[field];
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: `Invalid ${field} date filter.` });
    }
    if (date) {
      conditions.push(field === "from" ? "date(u.created_at)>=date(?)" : "date(u.created_at)<=date(?)");
      values.push(date);
    }
  }
  const activity = req.query.activity;
  if (activity && !["30d", "90d", "inactive"].includes(activity)) {
    return res.status(400).json({ message: "Choose a supported activity filter." });
  }
  if (activity === "30d" || activity === "90d") {
    conditions.push("u.last_active_at>=datetime('now',?)");
    values.push(`-${activity === "30d" ? 30 : 90} days`);
  } else if (activity === "inactive") {
    conditions.push("(u.last_active_at IS NULL OR u.last_active_at<datetime('now','-90 days'))");
  }

  const where = conditions.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) AS count FROM users u WHERE ${where}`).get(...values).count;
  const rows = db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.created_at,u.last_active_at,
      (SELECT COUNT(*) FROM analyses a WHERE a.user_id=u.id) AS analyses_count
    FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?
  `).all(...values, limit, offset);
  res.json({ users: rows, page, limit, total, pages: Math.ceil(total / limit) });
});

app.get("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.created_at,u.last_active_at,
      (SELECT COUNT(*) FROM analyses a WHERE a.user_id=u.id) AS analyses_count
    FROM users u WHERE u.id=? AND u.role='user'
  `).get(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json(user);
});

app.get("/api/admin/analyses", requireAuth, requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const conditions = [];
  const values = [];
  const search = String(req.query.q || "").trim();
  if (search) {
    conditions.push("(u.name LIKE ? OR u.email LIKE ? OR a.resume_name LIKE ? OR a.job_title LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM analyses a JOIN users u ON u.id=a.user_id ${where}
  `).get(...values).count;
  const rows = db.prepare(`
    SELECT a.id,a.user_id,a.resume_name,a.job_title,a.score,a.created_at,u.name AS user_name,u.email AS user_email
    FROM analyses a JOIN users u ON u.id=a.user_id ${where}
    ORDER BY a.id DESC LIMIT ? OFFSET ?
  `).all(...values, limit, offset);
  res.json({ analyses: rows, page, limit, total, pages: Math.ceil(total / limit) });
});

try {
  await provisionInitialAdmin();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

app.listen(PORT, () => console.log(`ResumeIQ API running at http://localhost:${PORT}`));
