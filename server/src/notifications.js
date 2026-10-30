const MAX_NOTIFICATION_TITLE = 140;
const MAX_NOTIFICATION_MESSAGE = 500;
const VALID_CATEGORIES = new Set(["job_match", "weekly_ats_tips", "bullet_point_suggestions"]);

function safeText(value, maximum = MAX_NOTIFICATION_MESSAGE) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function createNotification(db, {
  userId,
  category,
  title,
  message,
  analysisId = null,
  dedupeKey,
  actionData = null,
  createdAt,
}) {
  if (!VALID_CATEGORIES.has(category)) throw new Error("Unsupported notification category.");
  if (userId === null || userId === undefined || !Number.isInteger(Number(userId)) || !dedupeKey) {
    throw new Error("Notification ownership and deduplication key are required.");
  }
  const cleanTitle = safeText(title, MAX_NOTIFICATION_TITLE);
  const cleanMessage = safeText(message);
  if (!cleanTitle || !cleanMessage) throw new Error("Notification title and message are required.");

  const result = db.prepare(`
    INSERT OR IGNORE INTO notifications
      (user_id,category,title,message,analysis_id,dedupe_key,action_data_json,created_at)
    VALUES (?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))
  `).run(
    Number(userId),
    category,
    cleanTitle,
    cleanMessage,
    analysisId,
    safeText(dedupeKey, 180),
    actionData === null ? null : JSON.stringify(actionData),
    createdAt || null,
  );
  return result.changes === 1;
}

function tailoredEvidence(result, analysisId, jobTitle) {
  const items = [];
  const relevantSkills = [
    ...list(result.matchedSkills).map((item) => item?.skill),
    ...list(result.partiallyMatchedSkills).map((item) => item?.skill),
    ...list(result.jobRequirements?.skills)
      .filter((item) => item && ["matched", "partially matched"].includes(item.status))
      .map((item) => item.skill),
  ].filter((skill, index, skills) => typeof skill === "string" && skills.indexOf(skill) === index);
  const relevantSkillIn = (text) => relevantSkills.find((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "i").test(text);
  });
  const addSuggestion = ({ text, source, requirement }) => {
    const original = safeText(text, 320);
    if (!original || items.some((item) => item.original.toLowerCase() === original.toLowerCase())) return;
    items.push({
      analysisId,
      jobTitle: safeText(jobTitle, 160),
      source: safeText(source, 100),
      original,
      suggested: original,
      why: `This existing ${source.toLowerCase()} evidence is relevant to ${safeText(requirement, 200)}. The suggested wording preserves the original factual content; consider emphasizing or repositioning it for this role.`,
    });
  };
  for (const responsibility of list(result.experienceAnalysis?.responsibilities)) {
    for (const evidence of list(responsibility.evidence)) {
      const requirement = safeText(responsibility.requirement, 200);
      if (!requirement) continue;
      addSuggestion({ text: evidence.text, source: "Experience", requirement: `the job-description responsibility “${requirement}”` });
      if (items.length >= 3) return items;
    }
  }
  for (const project of list(result.projectAnalysis?.projects)) {
    const technology = relevantSkillIn(list(project.technologies).join(" "));
    const demonstrated = list(project.demonstratedSkills).find((skill) => relevantSkills.includes(skill));
    const skill = demonstrated || technology;
    if (!skill) continue;
    addSuggestion({
      text: project.description,
      source: `Project ${safeText(project.name, 80)}`,
      requirement: `the matched job skill ${skill}`,
    });
    if (items.length >= 3) return items;
  }
  for (const achievement of list(result.achievementAnalysis?.statements)) {
    const skill = relevantSkillIn(achievement.original || "");
    if (!skill) continue;
    addSuggestion({
      text: achievement.original,
      source: "Achievement",
      requirement: `the matched job skill ${skill}`,
    });
    if (items.length >= 3) return items;
  }
  return items;
}

export function createAnalysisNotifications(db, { user, analysisId, jobTitle, result }) {
  if (!user || !result || typeof result !== "object") return [];
  const created = [];

  if (user.ai_job_match_alerts && result.analysisMode === "job-match") {
    const missingRequired = list(result.missingRequiredSkills)
      .filter((item) => item && typeof item.skill === "string")
      .map((item) => safeText(item.skill, 80))
      .filter(Boolean);
    const criticalGaps = list(result.criticalGaps).map((gap) => safeText(gap, 180)).filter(Boolean);
    const score = result.overallJobMatchScore;
    const hasSignificantGap = missingRequired.length > 0
      || criticalGaps.length > 0
      || (typeof score === "number" && score < 55);

    if (hasSignificantGap) {
      const title = missingRequired.length
        ? `${safeText(jobTitle, 90)} analysis found required skill gaps`
        : `${safeText(jobTitle, 90)} analysis found improvement opportunities`;
      const details = [];
      if (missingRequired.length) details.push(`Missing required skills: ${missingRequired.slice(0, 4).join(", ")}${missingRequired.length > 4 ? ` and ${missingRequired.length - 4} more` : ""}.`);
      else if (typeof score === "number") details.push(`Job match score: ${score}%.`);
      if (criticalGaps.length && !missingRequired.length) details.push(criticalGaps[0]);
      const message = details.join(" ");
      if (createNotification(db, {
        userId: user.id,
        category: "job_match",
        title,
        message,
        analysisId,
        dedupeKey: `analysis:${analysisId}:job_match`,
        actionData: { analysisId, jobTitle: safeText(jobTitle, 160) },
      })) created.push("job_match");
    }
  }

  if (user.auto_tailor_bullets && result.analysisMode === "job-match") {
    const suggestions = tailoredEvidence(result, analysisId, jobTitle);
    if (suggestions.length && createNotification(db, {
      userId: user.id,
      category: "bullet_point_suggestions",
      title: `Evidence suggestions for ${safeText(jobTitle, 90)}`,
      message: `${suggestions.length} evidence-based suggestion${suggestions.length === 1 ? "" : "s"} are available. Each uses an existing resume statement and preserves its factual content.`,
      analysisId,
      dedupeKey: `analysis:${analysisId}:bullet_points`,
      actionData: { analysisId, jobTitle: safeText(jobTitle, 160), suggestions },
    })) created.push("bullet_point_suggestions");
  }

  return created;
}

function extractWeeklyTips(rows) {
  const tips = [];
  const latest = rows[0];
  if (!latest) return tips;

  const result = latest.result;
  const requiredSkills = [...new Set(list(result.missingRequiredSkills)
    .map((item) => item && safeText(item.skill, 80))
    .filter(Boolean))].slice(0, 5);
  if (requiredSkills.length) {
    tips.push(`For ${safeText(latest.job_title, 90)}, address these required skills only where you have truthful evidence: ${requiredSkills.join(", ")}.`);
  }

  const formattingRisk = list(result.formattingRisks).map((item) => safeText(item, 200)).find(Boolean);
  if (formattingRisk) tips.push(`Formatting: ${formattingRisk}`);

  const evidenceGaps = list(result.jobRequirements?.skills)
    .filter((item) => item && ["insufficient evidence", "partially matched"].includes(item.status))
    .map((item) => safeText(item.skill, 80))
    .filter(Boolean)
    .slice(0, 4);
  if (evidenceGaps.length) {
    tips.push(`Add a concrete example for these skills already mentioned in your resume: ${evidenceGaps.join(", ")}.`);
  }

  const achievement = list(result.achievementAnalysis?.statements)
    .find((item) => item && typeof item.original === "string" && item.suggestion);
  if (achievement) {
    tips.push(`Achievement wording: ${safeText(achievement.suggestion, 220)} Existing statement reviewed: “${safeText(achievement.original, 120)}”.`);
  }

  return tips.slice(0, 4);
}

export function createWeeklyTipsForUser(db, { user, weekKey }) {
  if (!user?.weekly_ats_tips) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) throw new Error("Weekly notification period must be an ISO date.");

  const analyses = db.prepare(`
    SELECT id,job_title,result_json
    FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 10
  `).all(user.id);
  const rows = [];
  for (const analysis of analyses) {
    try {
      const result = JSON.parse(analysis.result_json);
      if (result && typeof result === "object" && !Array.isArray(result)) rows.push({ ...analysis, result });
    } catch {
      continue;
    }
  }
  if (!rows.length) return false;
  const tips = extractWeeklyTips(rows);
  if (!tips.length) return false;
  const latest = rows[0];
  return createNotification(db, {
    userId: user.id,
    category: "weekly_ats_tips",
    title: "Your weekly ATS improvement tips are ready",
    message: tips.join(" "),
    analysisId: latest.id,
    dedupeKey: `weekly_ats:${weekKey}`,
    actionData: { analysisId: latest.id, weekKey, tips },
  });
}

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function currentMondayKey(date = new Date(), timeZone = "UTC") {
  const { year, month, day } = localDateParts(date, timeZone);
  const localDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const dayOfWeek = localDate.getUTCDay();
  localDate.setUTCDate(localDate.getUTCDate() - ((dayOfWeek + 6) % 7));
  return localDate.toISOString().slice(0, 10);
}

export function weeklyTipsAreDue(date = new Date(), timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  if (values.weekday !== "Mon") return true;
  return Number(values.hour) > 9 || (Number(values.hour) === 9 && Number(values.minute) >= 0);
}

export function runWeeklyTipsForPeriod(db, weekKey) {
  const users = db.prepare(`
    SELECT id,weekly_ats_tips FROM users
    WHERE role='user' AND weekly_ats_tips=1
  `).all();
  let created = 0;
  for (const user of users) {
    if (createWeeklyTipsForUser(db, { user, weekKey })) created += 1;
  }
  return created;
}

async function runWeeklyTipsInBatches(db, weekKey) {
  const eligibleUsers = db.prepare(`
    SELECT id,weekly_ats_tips FROM users
    WHERE role='user' AND weekly_ats_tips=1 AND id>?
    ORDER BY id LIMIT 10
  `);
  let created = 0;
  let lastUserId = 0;
  while (true) {
    const users = eligibleUsers.all(lastUserId);
    if (!users.length) break;
    for (const user of users) {
      if (createWeeklyTipsForUser(db, { user, weekKey })) created += 1;
    }
    lastUserId = users[users.length - 1].id;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return created;
}

export function startWeeklyTipsScheduler(db, {
  timeZone = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  intervalMs = 15 * 60 * 1000,
  onError = (error) => console.error("Weekly ATS tips scheduler failed:", error),
} = {}) {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  let stopped = false;
  let timer;
  const check = async () => {
    if (stopped) return;
    try {
      const now = new Date();
      if (weeklyTipsAreDue(now, timeZone)) {
        const weekKey = currentMondayKey(now, timeZone);
        await runWeeklyTipsInBatches(db, weekKey);
      }
    } catch (error) {
      onError(error);
    } finally {
      if (!stopped) timer = setTimeout(check, intervalMs);
    }
  };
  timer = setTimeout(check, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
