import test from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createAnalysisReportPdf, getAnalysisPdfFilename } from "../src/analysis-report-pdf.js";

function makeRecord(overrides = {}) {
  return {
    id: 123,
    resume_name: "Resume résumé.pdf",
    job_title: "Data Analyst",
    created_at: "2026-10-29 12:00:00",
    result: {
      analysisMode: "job-match",
      overallJobMatchScore: 74,
      atsReadabilityScore: 82,
      scoreBreakdown: [{
        dimension: "Required and preferred skills",
        weight: 30,
        effectiveWeight: 35.29,
        score: 75,
        weightedContribution: 26.47,
        status: "scored",
        reason: "Matched required skills with contextual evidence.",
      }],
      matchedKeywords: ["React"],
      missingKeywords: ["Kubernetes"],
      matchedSkills: [{ skill: "React", status: "matched" }],
      partiallyMatchedSkills: [],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      jobRequirements: {
        title: "Data Analyst",
        skills: [{
          skill: "React",
          requirementType: "required",
          status: "matched",
          explanation: "The resume contains project evidence.",
          evidence: [{ text: "Built a dashboard using React.", section: "Projects" }],
        }],
      },
      analysisMetadata: {
        jobDescriptionSnapshot: "Required: React. Analyze reporting data and present insights.",
      },
      experienceAnalysis: {
        yearsStatus: "not specified",
        responsibilities: [{
          requirement: "Analyze reporting data.",
          status: "evidence found",
          evidence: [{ text: "Analyzed weekly reporting data." }],
        }],
      },
      projectAnalysis: {
        score: 75,
        explanation: "Evaluated project evidence.",
        projects: [{
          name: "Analytics Dashboard",
          technologies: ["React"],
          description: "Built a dashboard from reporting data.",
          demonstratedSkills: ["React"],
        }],
      },
      educationAnalysis: {
        requirements: [{ requirement: "Bachelor's degree", requirementType: "preferred", status: "met" }],
      },
      achievementAnalysis: {
        score: 80,
        statements: [{ original: "Improved data processing time by 20%.", suggestion: "Clarify the measurement period." }],
      },
      strengths: ["Project work is relevant."],
      criticalGaps: ["Kubernetes was not found in the resume."],
      resumeParsingStatus: "readable",
      atsReadabilityAnalysis: {
        recognizedSections: 4,
        assessedSections: 5,
        extractedTextLength: 900,
        formula: "Section coverage and text sufficiency.",
      },
      formattingRisks: ["Fewer than three common resume section headings were recognized."],
      sections: [{ name: "Projects", present: true }],
      improvementRecommendations: [{
        priority: "High",
        action: "Address the Kubernetes requirement",
        reason: "It is required and not present in the extracted resume.",
        section: "Skills or relevant experience",
        changeType: "Add only if truthful; otherwise build the skill",
      }],
      suggestedResumeImprovements: [],
      limitationsAndUncertainty: ["OCR is not available for scanned documents."],
    },
    ...overrides,
  };
}

async function extractPdfText(doc) {
  const pdf = await getDocument({
    data: new Uint8Array(doc.output("arraybuffer")),
    useSystemFonts: true,
  }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return { pageCount: pdf.numPages, text: pages.join("\n") };
}

test("generates a real multi-page PDF containing the selected saved analysis", async () => {
  const record = makeRecord();
  const doc = createAnalysisReportPdf(record);
  const output = await extractPdfText(doc);

  assert.ok(output.pageCount > 1, "long report content should paginate");
  assert.match(output.text, /Resume Analysis Report/);
  assert.match(output.text, /Resume: Resume résumé\.pdf/);
  assert.match(output.text, /Target job: Data Analyst/);
  assert.match(output.text, /Analysis ID: 123/);
  assert.match(output.text, /74%/);
  assert.match(output.text, /82%/);
  assert.match(output.text, /Score Breakdown/);
  assert.match(output.text, /Skills and Keyword Analysis/);
  assert.match(output.text, /Kubernetes requirement/);
  assert.match(output.text, /Experience and Responsibility Analysis/);
  assert.match(output.text, /Analytics Dashboard/);
  assert.match(output.text, /Education and Certifications/);
  assert.match(output.text, /Achievements and Demonstrated Impact/);
  assert.match(output.text, /ATS Readability and Parsing/);
  assert.match(output.text, /Improvement Recommendations/);
  assert.match(output.text, /Final Action Plan/);
  assert.match(output.text, /Analysis Limitations/);
  assert.match(output.text, /Job Description Snapshot/);
  assert.equal(getAnalysisPdfFilename(record), "ResumeIQ_Analysis_Data_Analyst_2026-10-29.pdf");
});

test("creates separate downloads for different saved analysis records", () => {
  const first = makeRecord();
  const second = makeRecord({
    id: 456,
    resume_name: "Another Resume.pdf",
    job_title: "Frontend Engineer",
    created_at: "2026-10-28 10:00:00",
    result: { analysisMode: "resume-only", atsReadabilityScore: 64, overallScore: 64 },
  });
  const firstPdf = createAnalysisReportPdf(first);
  const secondPdf = createAnalysisReportPdf(second);

  assert.notEqual(getAnalysisPdfFilename(first), getAnalysisPdfFilename(second));
  assert.ok(firstPdf.output("arraybuffer").byteLength > 1000);
  assert.ok(secondPdf.output("arraybuffer").byteLength > 1000);
});

test("omits unavailable optional report sections without failing PDF generation", async () => {
  const record = makeRecord({
    result: {
      analysisMode: "job-match",
      overallJobMatchScore: 52,
      atsReadabilityScore: null,
      scoreBreakdown: [],
    },
  });
  const output = await extractPdfText(createAnalysisReportPdf(record));

  assert.match(output.text, /Limited Match|Needs Improvement/);
  assert.match(output.text, /ATS readability: Unavailable/);
});

test("rejects incomplete saved report data", () => {
  assert.throws(
    () => createAnalysisReportPdf({ id: 10, result: null }),
    /saved analysis report is incomplete/i,
  );
});
