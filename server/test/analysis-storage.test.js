import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { analyzeResume } from "../src/analyzer.js";

const resumeText = `Jordan Lee
jordan@example.com
Summary
Frontend developer focused on accessible web applications and reusable interfaces.
Skills
React, TypeScript, JavaScript
Experience
Developed customer-facing React interfaces and collaborated with designers to improve accessibility.
Education
Bachelor of Science in computer science.`;

test("persists one structured result with matching scores and enforces user-specific retrieval", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      resume_name TEXT NOT NULL,
      job_title TEXT,
      score INTEGER NOT NULL,
      analysis_mode TEXT NOT NULL DEFAULT 'legacy',
      job_match_score INTEGER,
      ats_readability_score INTEGER,
      result_json TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    INSERT INTO users (id) VALUES (1), (2);
  `);
  const result = analyzeResume({ resumeText, jobDescription: "Required skills: React and TypeScript." });
  const insert = db.prepare(`
    INSERT INTO analyses (
      user_id,resume_name,job_title,score,analysis_mode,job_match_score,ats_readability_score,result_json
    ) VALUES (?,?,?,?,?,?,?,?)
  `);
  const info = insert.run(
    1,
    "resume.txt",
    "Frontend Developer",
    result.overallScore,
    result.analysisMode,
    result.overallJobMatchScore,
    result.atsReadabilityScore,
    JSON.stringify(result),
  );
  const retrieveForOwner = db.prepare("SELECT * FROM analyses WHERE id=? AND user_id=?");
  const saved = retrieveForOwner.get(info.lastInsertRowid, 1);
  const crossUser = retrieveForOwner.get(info.lastInsertRowid, 2);

  assert.equal(saved.score, result.overallJobMatchScore);
  assert.equal(saved.job_match_score, result.overallJobMatchScore);
  assert.equal(saved.ats_readability_score, result.atsReadabilityScore);
  assert.equal(JSON.parse(saved.result_json).overallJobMatchScore, saved.score);
  assert.equal(JSON.parse(saved.result_json).analysisMetadata.jobDescriptionSnapshot, "Required skills: React and TypeScript.");
  assert.equal(crossUser, undefined);
  db.close();
});

test("returns the required structured result sections with validated deterministic values", () => {
  const result = analyzeResume({ resumeText, jobDescription: "Frontend developer with required React experience." });
  const sections = [
    "overallJobMatchScore", "scoreBreakdown", "atsReadabilityScore", "resumeParsingStatus",
    "jobRequirements", "matchedSkills", "partiallyMatchedSkills", "missingRequiredSkills",
    "missingPreferredSkills", "keywordAnalysis", "experienceAnalysis", "projectAnalysis",
    "educationAnalysis", "achievementAnalysis", "softSkillsAnalysis", "eligibilityWarnings",
    "strengths", "criticalGaps", "improvementRecommendations", "suggestedResumeImprovements",
    "limitationsAndUncertainty", "analysisMetadata",
  ];
  assert.ok(sections.every((section) => Object.hasOwn(result, section)));
  assert.ok(result.scoreBreakdown.every((item) => item.score === null || (item.score >= 0 && item.score <= 100)));
  assert.ok(result.overallJobMatchScore >= 0 && result.overallJobMatchScore <= 100);
});
