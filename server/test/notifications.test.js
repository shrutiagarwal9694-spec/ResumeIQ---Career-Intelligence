import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  createAnalysisNotifications,
  createWeeklyTipsForUser,
  currentMondayKey,
  runWeeklyTipsForPeriod,
  weeklyTipsAreDue,
} from "../src/notifications.js";

function createDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      ai_job_match_alerts INTEGER NOT NULL DEFAULT 0,
      weekly_ats_tips INTEGER NOT NULL DEFAULT 0,
      auto_tailor_bullets INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE analyses (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      job_title TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('job_match','weekly_ats_tips','bullet_point_suggestions')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      analysis_id INTEGER,
      dedupe_key TEXT NOT NULL,
      action_data_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(analysis_id) REFERENCES analyses(id) ON DELETE SET NULL,
      UNIQUE(user_id,dedupe_key)
    );
  `);
  return db;
}

function getNotifications(db, userId) {
  return db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id").all(userId);
}

test("job match alerts are preference-gated, evidence-based, and idempotent", () => {
  const db = createDb();
  db.prepare("INSERT INTO users (id,ai_job_match_alerts) VALUES (1,1)").run();
  const user = db.prepare("SELECT * FROM users WHERE id=1").get();
  const result = {
    analysisMode: "job-match",
    overallJobMatchScore: 48,
    missingRequiredSkills: [{ skill: "Python" }, { skill: "SQL" }],
    criticalGaps: ["Missing required skills: Python, SQL."],
  };
  db.prepare("INSERT INTO analyses (id,user_id,job_title,result_json) VALUES (42,1,'Data Analyst',?)").run(JSON.stringify(result));

  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 42, jobTitle: "Data Analyst", result }), ["job_match"]);
  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 42, jobTitle: "Data Analyst", result }), []);
  const [notification] = getNotifications(db, 1);
  assert.match(notification.message, /Python, SQL/);
  assert.equal(notification.analysis_id, 42);
  assert.equal(getNotifications(db, 2).length, 0);
  db.close();
});

test("disabled job match alerts create no notification and resume-only analysis is ignored", () => {
  const db = createDb();
  db.prepare("INSERT INTO users (id,ai_job_match_alerts) VALUES (1,0)").run();
  const user = db.prepare("SELECT * FROM users WHERE id=1").get();
  const result = { analysisMode: "job-match", overallJobMatchScore: 20, missingRequiredSkills: [{ skill: "SQL" }] };

  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 7, jobTitle: "Analyst", result }), []);
  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 8, jobTitle: "Analyst", result: { ...result, analysisMode: "resume-only" } }), []);
  assert.equal(getNotifications(db, 1).length, 0);
  db.close();
});

test("bullet suggestions reuse only actual resume evidence and preserve original wording", () => {
  const db = createDb();
  db.prepare("INSERT INTO users (id,auto_tailor_bullets) VALUES (1,1)").run();
  const user = db.prepare("SELECT * FROM users WHERE id=1").get();
  const result = {
    analysisMode: "job-match",
    experienceAnalysis: {
      responsibilities: [{
        requirement: "Analyze customer trends",
        evidence: [{ text: "Analyzed weekly customer trends using SQL." }],
      }],
    },
  };
  db.prepare("INSERT INTO analyses (id,user_id,job_title,result_json) VALUES (12,1,'Data Analyst',?)").run(JSON.stringify(result));

  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 12, jobTitle: "Data Analyst", result }), ["bullet_point_suggestions"]);
  const [notification] = getNotifications(db, 1);
  const actionData = JSON.parse(notification.action_data_json);
  assert.equal(actionData.suggestions[0].original, "Analyzed weekly customer trends using SQL.");
  assert.equal(actionData.suggestions[0].suggested, actionData.suggestions[0].original);
  assert.match(actionData.suggestions[0].why, /job-description responsibility/);

  const withoutEvidence = { analysisMode: "job-match", experienceAnalysis: { responsibilities: [{ requirement: "Make insights", evidence: [] }] } };
  db.prepare("INSERT INTO analyses (id,user_id,job_title,result_json) VALUES (13,1,'Analyst',?)").run(JSON.stringify(withoutEvidence));
  assert.deepEqual(createAnalysisNotifications(db, { user, analysisId: 13, jobTitle: "Analyst", result: withoutEvidence }), []);
  db.close();
});

test("weekly ATS tips use stored analysis evidence and deduplicate each user and week", () => {
  const db = createDb();
  db.prepare("INSERT INTO users (id,weekly_ats_tips) VALUES (1,1),(2,0)").run();
  const user = db.prepare("SELECT * FROM users WHERE id=1").get();
  const result = {
    missingRequiredSkills: [{ skill: "SQL" }],
    formattingRisks: ["No recognizable email address was found."],
    jobRequirements: { skills: [{ skill: "Python", status: "insufficient evidence" }] },
    achievementAnalysis: { statements: [{ original: "Built reporting charts.", suggestion: "Clarify the supported result." }] },
  };
  db.prepare("INSERT INTO analyses (id,user_id,job_title,result_json) VALUES (1,1,'Data Analyst',?)").run(JSON.stringify(result));

  assert.equal(createWeeklyTipsForUser(db, { user, weekKey: "2026-10-26" }), true);
  assert.equal(createWeeklyTipsForUser(db, { user, weekKey: "2026-10-26" }), false);
  const [notification] = getNotifications(db, 1);
  assert.match(notification.message, /SQL/);
  assert.match(notification.message, /formatting/i);
  assert.match(notification.message, /Python/);
  assert.equal(notification.analysis_id, 1);
  assert.equal(runWeeklyTipsForPeriod(db, "2026-10-26"), 0);
  assert.equal(getNotifications(db, 2).length, 0);
  db.close();
});

test("weekly scheduler period uses configured timezone and Monday schedule with restart catch-up", () => {
  assert.equal(currentMondayKey(new Date("2026-10-29T16:30:00Z"), "America/New_York"), "2026-10-26");
  assert.equal(currentMondayKey(new Date("2026-11-02T15:00:00Z"), "America/New_York"), "2026-11-02");
  assert.equal(weeklyTipsAreDue(new Date("2026-11-02T13:59:00Z"), "America/New_York"), false);
  assert.equal(weeklyTipsAreDue(new Date("2026-11-02T14:00:00Z"), "America/New_York"), true);
  assert.equal(weeklyTipsAreDue(new Date("2026-11-04T14:00:00Z"), "America/New_York"), true);
});
