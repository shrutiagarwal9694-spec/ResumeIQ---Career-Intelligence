import test from "node:test";
import assert from "node:assert/strict";
import { analyzeResume } from "../src/analyzer.js";

const frontendResume = `Jordan Lee
jordan@example.com
Professional Summary
Frontend developer with experience building accessible web applications.
Skills
React, JavaScript, TypeScript, Git
Experience
Developed a React and JavaScript dashboard and improved accessibility across customer workflows.
Collaborated with designers to implement responsive interfaces using TypeScript.
Education
Bachelor of Science in Computer Science
Projects
Built a React application with reusable components and REST APIs.`;

const frontendJd = `Frontend Developer
Required skills: React, JavaScript, TypeScript
Preferred skills: GraphQL
Responsibilities
Develop responsive interfaces using React and TypeScript for customer-facing applications.
Collaborate with designers to build accessible experiences.
Bachelor's degree preferred.`;

test("scores job-specific skills once and returns a weighted report", () => {
  const result = analyzeResume({ resumeText: frontendResume, jobDescription: frontendJd, jobTitle: "Frontend Developer" });
  assert.equal(result.analysisMode, "job-match");
  assert.ok(result.overallJobMatchScore >= 0 && result.overallJobMatchScore <= 100, JSON.stringify({ score: result.overallJobMatchScore, skills: result.jobRequirements.skills, breakdown: result.scoreBreakdown }));
  assert.equal(result.skillScore, 80, JSON.stringify({ score: result.skillScore, skills: result.jobRequirements.skills }));
  assert.deepEqual(result.matchedSkills.map((item) => item.skill).sort(), ["JavaScript", "React", "TypeScript"]);
  assert.deepEqual(result.missingPreferredSkills.map((item) => item.skill), ["GraphQL"]);
  assert.equal(Math.round(result.scoreBreakdown.reduce((sum, item) => sum + (item.weightedContribution || 0), 0)), result.overallJobMatchScore);
});

test("does not treat a skill-list mention as demonstrated practical experience", () => {
  const result = analyzeResume({
    resumeText: `Jordan Lee\njordan@example.com\nSkills\nReact, TypeScript\nEducation\nBachelor of Science in computer science with software development coursework.`,
    jobDescription: "Required skills: React and TypeScript",
  });
  assert.equal(result.skillScore, 25);
  assert.ok(result.matchedSkills.length === 0);
  assert.deepEqual(result.keywordAnalysis.insufficientEvidenceKeywords.sort(), ["React", "TypeScript"]);
});

test("uses profile skills as context without treating them as resume evidence", () => {
  const result = analyzeResume({
    resumeText: "Jordan Lee\njordan@example.com\nProfessional Summary\nEarly-career developer.\nEducation\nBachelor of Science in computer science.",
    jobDescription: "Required skill: Python.",
    profilePreferences: {
      technicalSkills: ["Python"],
      experienceLevel: "Student / Fresher (0 years)",
      targetJobTitles: ["Backend Developer"],
      atsStandard: "US / Global ATS Standard",
      targetIndustry: "Software & SaaS",
    },
  });
  assert.equal(result.jobRequirements.skills[0].status, "insufficient evidence");
  assert.equal(result.jobRequirements.skills[0].profileClaimed, true);
  assert.deepEqual(result.missingRequiredSkills, []);
  assert.deepEqual(result.keywordAnalysis.insufficientEvidenceKeywords, ["Python"]);
  assert.equal(result.analysisMetadata.profilePreferences.targetJobTitles[0], "Backend Developer");
});

test("normalizes JS as JavaScript without confusing Java and JavaScript", () => {
  const result = analyzeResume({
    resumeText: `Skills\nJS\nExperience\nBuilt interfaces with JS for a production application and supported responsive layouts.`,
    jobDescription: "Required: JavaScript and Java",
  });
  assert.equal(result.matchedSkills.some((item) => item.skill === "JavaScript"), true);
  assert.equal(result.missingRequiredSkills.some((item) => item.skill === "Java"), true);
});

test("keeps required and preferred requirements distinct and ignores duplicate mentions", () => {
  const result = analyzeResume({
    resumeText: `Skills\nPython, Python, SQL\nProjects\nDeveloped a data pipeline in Python and used SQL to analyze the results.`,
    jobDescription: "Required skills: Python. Nice to have: SQL.",
  });
  assert.equal(result.jobRequirements.skills.length, 2);
  assert.equal(result.jobRequirements.skills.find((item) => item.skill === "Python")?.requirementType, "required", JSON.stringify(result.jobRequirements.skills));
  assert.equal(result.jobRequirements.skills.find((item) => item.skill === "SQL")?.requirementType, "preferred", JSON.stringify(result.jobRequirements.skills));
  assert.deepEqual(result.matchedKeywords, ["Python", "SQL"]);
});

test("evaluates project-based experience without requiring employment history", () => {
  const result = analyzeResume({
    resumeText: `Education\nBachelor of Science\nProjects\nBuilt a React application with TypeScript and REST APIs for a student portfolio.`,
    jobDescription: "Entry-level frontend developer. Required skills: React, TypeScript.",
  });
  assert.ok(result.projectAnalysis.score > 0);
  assert.equal(result.experienceAnalysis.score, null);
});

test("supports a resume-only report and explicitly withholds job matching", () => {
  const result = analyzeResume({ resumeText: frontendResume, jobDescription: "" });
  assert.equal(result.analysisMode, "resume-only");
  assert.equal(result.overallJobMatchScore, null);
  assert.equal(result.overallScore, result.atsReadabilityScore);
  assert.equal(result.missingRequiredSkills.length, 0);
});

test("rejects insufficient extracted text instead of saving a confident report", () => {
  assert.throws(
    () => analyzeResume({ resumeText: "This is a very short extracted resume text.", jobDescription: "Required: React" }),
    (error) => error.status === 422 && /too short for reliable analysis/.test(error.message),
  );
});

test("rejects empty resume text explicitly", () => {
  assert.throws(
    () => analyzeResume({ resumeText: "   ", jobDescription: "React" }),
    (error) => error.status === 422 && /too short/.test(error.message),
  );
});

test("reports experience requirements that cannot be verified without inventing tenure", () => {
  const result = analyzeResume({
    resumeText: `Skills\nReact\nExperience\nDeveloped React pages for an internal tool and supported accessibility improvements.`,
    jobDescription: "Required: 5 years of experience with React.",
  });
  assert.equal(result.experienceAnalysis.requiredYears, 5);
  assert.equal(result.experienceAnalysis.yearsStatus, "not verifiable from extracted resume text");
  assert.ok(result.eligibilityWarnings.some((item) => item.status === "not verifiable"));
});

test("keeps keyword overlap from concealing missing responsibility evidence", () => {
  const result = analyzeResume({
    resumeText: `Jordan Lee
jordan@example.com
Skills
React, TypeScript, REST APIs
Education
Bachelor of Science in computer science with software development coursework.`,
    jobDescription: `Frontend developer
Required skills: React, TypeScript, REST APIs
Responsibilities
Own a production frontend application, coordinate cross-functional releases, and resolve reliability incidents.`,
  });
  assert.ok(result.jobRequirements.skills.every((item) => item.status === "insufficient evidence"));
  assert.equal(result.experienceAnalysis.score, 0);
  assert.ok(result.overallJobMatchScore < 70);
});

test("keeps unrelated resume evidence from appearing as a skill match", () => {
  const result = analyzeResume({
    resumeText: `Jordan Lee
jordan@example.com
Skills
SQL, Python
Experience
Analyzed inventory reports and prepared weekly forecasting summaries for a retail operations team.`,
    jobDescription: `Frontend Engineer
Required skills: React, TypeScript
Responsibilities
Develop responsive customer-facing interfaces using React and TypeScript.`,
  });
  assert.equal(result.matchedSkills.length, 0);
  assert.ok(result.missingRequiredSkills.length >= 2);
  assert.ok(result.overallJobMatchScore < 50);
});

test("does not calculate tenure from incomplete employment dates", () => {
  const result = analyzeResume({
    resumeText: `Jordan Lee
jordan@example.com
Experience
Frontend Engineer, 2022-present
Developed React interfaces and supported the product engineering team.`,
    jobDescription: "Required: 3 years of experience with React.",
  });
  assert.equal(result.experienceAnalysis.yearsStatus, "not verifiable from extracted resume text");
});

test("returns only supported achievement evidence and deterministic scoring metadata", () => {
  const result = analyzeResume({ resumeText: frontendResume, jobDescription: frontendJd });
  assert.ok(result.achievementAnalysis.statements.every((item) => typeof item.original === "string"));
  assert.ok(result.analysisMetadata.scoreWeights.skills === 30);
  assert.equal(result.analysisMetadata.jobDescriptionSnapshot, frontendJd);
  assert.equal(result.analysisMetadata.resumeTextFingerprint.length, 64);
  assert.ok(result.limitationsAndUncertainty.some((item) => item.includes("deterministic")));
});
