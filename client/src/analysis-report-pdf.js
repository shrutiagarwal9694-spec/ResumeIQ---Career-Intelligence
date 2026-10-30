import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE = { top: 24, bottom: 20, left: 16, right: 16 };
const BLUE = [37, 99, 235];
const INK = [15, 23, 42];
const MUTED = [82, 96, 114];
const LIGHT_BLUE = [239, 246, 255];

function textValue(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function displayScore(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "Unavailable";
}

function safeFilePart(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return normalized || "Target_Role";
}

function reportDate(record) {
  const value = record.created_at || record.result?.analysisMetadata?.analyzedAt;
  if (!value) return "Unavailable";
  const date = new Date(value.endsWith?.("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function scoreCategory(result) {
  if (result.analysisMode === "resume-only") return "Resume-only readability analysis";
  if (result.analysisMode !== "job-match") return "Legacy score";
  const score = result.overallJobMatchScore;
  if (typeof score !== "number") return "Unavailable";
  if (score >= 80) return "Strong Match";
  if (score >= 65) return "Competitive";
  if (score >= 50) return "Needs Improvement";
  return "Limited Match";
}

function scoreExplanation(result) {
  if (result.analysisMode === "resume-only") {
    return "This score estimates text parsing and section recognition. It is not a job-match score or a prediction of any ATS vendor decision.";
  }
  if (result.analysisMode !== "job-match") {
    return "This saved report predates separate job-match and ATS readability scoring.";
  }
  return "This evidence-based estimate compares extracted resume evidence with the supplied job description. It does not predict an ATS decision. ATS readability is reported separately.";
}

function formatCreatedAt(value) {
  if (!value) return "Unavailable";
  return reportDate({ created_at: value });
}

export function getAnalysisPdfFilename(record) {
  const dateValue = record.created_at || record.result?.analysisMetadata?.analyzedAt || "";
  const parsedDate = new Date(dateValue.endsWith?.("Z") ? dateValue : `${dateValue}Z`);
  const date = Number.isNaN(parsedDate.getTime()) ? "undated" : parsedDate.toISOString().slice(0, 10);
  const title = record.job_title || record.result?.jobRequirements?.title || "Target Role";
  return `ResumeIQ_Analysis_${safeFilePart(title)}_${date}.pdf`;
}

export function createAnalysisReportPdf(record) {
  if (!record || record.id === undefined || !record.result || typeof record.result !== "object") {
    throw new Error("The saved analysis report is incomplete. Reload the report and try again.");
  }

  const result = record.result;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const contentWidth = width - PAGE.left - PAGE.right;
  const reportTitle = textValue(record.job_title || result.jobRequirements?.title, "Saved analysis");
  let y = PAGE.top;

  doc.setProperties({
    title: `ResumeIQ Analysis Report - ${reportTitle}`,
    subject: "Resume and job description analysis",
    author: "ResumeIQ",
    creator: "ResumeIQ",
  });

  function ensureSpace(height = 12) {
    if (y + height > doc.internal.pageSize.getHeight() - PAGE.bottom) {
      doc.addPage();
      y = PAGE.top;
    }
  }

  function heading(title) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BLUE);
    doc.text(title, PAGE.left, y);
    y += 6;
    doc.setDrawColor(219, 228, 240);
    doc.line(PAGE.left, y, width - PAGE.right, y);
    y += 4;
  }

  function paragraph(value, options = {}) {
    const content = textValue(value);
    if (!content) return;
    const fontSize = options.fontSize || 9;
    const lineHeight = options.lineHeight || 4.4;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...(options.color || INK));
    const lines = doc.splitTextToSize(content, contentWidth - (options.indent || 0));
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, PAGE.left + (options.indent || 0), y);
      y += lineHeight;
    }
    y += options.after ?? 1;
  }

  function bullet(value, options = {}) {
    paragraph(`- ${textValue(value)}`, { ...options, indent: 2 });
  }

  function table(headers, rows, widths, options = {}) {
    if (!rows.length) return;
    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      margin: { left: PAGE.left, right: PAGE.right, top: PAGE.top, bottom: PAGE.bottom },
      tableWidth: contentWidth,
      columnStyles: Object.fromEntries(widths.map((widthValue, index) => [index, { cellWidth: widthValue }])),
      styles: {
        font: "helvetica",
        fontSize: options.fontSize || 7.5,
        cellPadding: 2.2,
        overflow: "linebreak",
        valign: "top",
        textColor: INK,
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: BLUE,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: () => {},
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  function sectionIf(title, hasData, render) {
    if (!hasData) return;
    heading(title);
    render();
  }

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, width, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMEIQ  |  CAREER INTELLIGENCE", PAGE.left, 9.5);
  doc.setTextColor(...INK);
  doc.setFontSize(21);
  doc.text("Resume Analysis Report", PAGE.left, y);
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(doc.splitTextToSize(reportTitle, contentWidth), PAGE.left, y);
  y += doc.splitTextToSize(reportTitle, contentWidth).length * 5 + 2;
  paragraph(`Resume: ${textValue(record.resume_name, "Resume")}`, { bold: true });
  paragraph(`Target job: ${textValue(record.job_title || result.jobRequirements?.title, "Unavailable")}`);
  paragraph(`Analysis date: ${formatCreatedAt(record.created_at || result.analysisMetadata?.analyzedAt)}`);
  paragraph(`Analysis ID: ${textValue(record.id)}`);
  y += 2;

  heading("Overall Job Match");
  const jobMatch = result.analysisMode === "job-match" ? result.overallJobMatchScore : null;
  const mainScore = result.analysisMode === "resume-only"
    ? result.atsReadabilityScore
    : result.analysisMode === "job-match"
      ? result.overallJobMatchScore
      : result.overallJobMatchScore ?? result.atsReadabilityScore ?? result.overallScore;
  doc.setFillColor(...LIGHT_BLUE);
  doc.roundedRect(PAGE.left, y, contentWidth, 23, 2, 2, "F");
  doc.setTextColor(...BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(displayScore(mainScore), PAGE.left + 5, y + 9);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.text(scoreCategory(result), PAGE.left + 31, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    result.analysisMode === "resume-only" ? "ATS readability (not job match)" : result.analysisMode === "job-match" ? "Job match score (ATS readability shown separately)" : "Legacy saved score",
    PAGE.left + 5,
    y + 17,
  );
  y += 27;
  paragraph(scoreExplanation(result));
  if (jobMatch !== null && typeof result.atsReadabilityScore === "number") {
    paragraph(`ATS readability: ${result.atsReadabilityScore}% (separate estimate; not the job-match score).`);
  } else if (result.analysisMode === "job-match") {
    paragraph(`ATS readability: ${displayScore(result.atsReadabilityScore)}.`);
  }

  sectionIf("Score Breakdown", listValue(result.scoreBreakdown).length > 0, () => {
    table(
      ["Scoring dimension", "Weight", "Score", "Weighted contribution", "Explanation"],
      listValue(result.scoreBreakdown).map((item) => [
        textValue(item.dimension, "Scoring dimension"),
        `${textValue(item.weight, "N/A")}%${item.effectiveWeight !== null && item.effectiveWeight !== undefined ? ` (effective ${item.effectiveWeight}%)` : ""}`,
        item.status === "unavailable" ? "N/A" : displayScore(item.score),
        item.weightedContribution === null || item.weightedContribution === undefined ? "N/A" : `${item.weightedContribution} pts`,
        textValue(item.reason, "No explanation available."),
      ]),
      [34, 24, 18, 30, contentWidth - 106],
      { fontSize: 7.2 },
    );
  });

  const requirements = listValue(result.jobRequirements?.skills);
  const skillsWithStatus = requirements.length ? requirements : [
    ...listValue(result.matchedSkills).map((item) => ({ ...item, requirementType: item.requirementType || "job requirement" })),
    ...listValue(result.partiallyMatchedSkills).map((item) => ({ ...item, status: item.status || "partially matched" })),
    ...listValue(result.missingRequiredSkills).map((item) => ({ ...item, status: item.status || "missing", requirementType: "required" })),
    ...listValue(result.missingPreferredSkills).map((item) => ({ ...item, status: item.status || "missing", requirementType: "preferred" })),
  ];
  sectionIf("Skills and Keyword Analysis", skillsWithStatus.length > 0 || listValue(result.matchedKeywords).length > 0 || listValue(result.missingKeywords).length > 0, () => {
    if (skillsWithStatus.length) {
      table(
        ["Skill / keyword", "Requirement", "Analysis status", "Explanation and resume evidence"],
        skillsWithStatus.map((item) => {
          const evidence = listValue(item.evidence)
            .map((entry) => `${textValue(entry.text)}${entry.section ? ` [${entry.section}]` : ""}`)
            .filter(Boolean)
            .join("\n");
          return [
            textValue(item.skill, "Unspecified"),
            textValue(item.requirementType, "Not categorized"),
            textValue(item.status, "Unavailable"),
            [textValue(item.explanation), evidence ? `Evidence: ${evidence}` : ""].filter(Boolean).join("\n"),
          ];
        }),
        [32, 24, 26, contentWidth - 82],
        { fontSize: 7.4 },
      );
    }
    const matched = listValue(result.matchedKeywords);
    const missing = listValue(result.missingKeywords);
    if (matched.length) paragraph(`Matched keywords: ${matched.join(", ")}`);
    if (missing.length) paragraph(`Missing keywords: ${missing.join(", ")}`);
    if (!skillsWithStatus.length) paragraph("Detailed skill evidence is unavailable in this saved analysis.");
  });

  const responsibilities = listValue(result.experienceAnalysis?.responsibilities);
  sectionIf("Experience and Responsibility Analysis", responsibilities.length > 0 || result.experienceAnalysis?.yearsStatus, () => {
    if (result.experienceAnalysis?.yearsStatus) {
      paragraph(`Experience requirement status: ${result.experienceAnalysis.yearsStatus}.`);
      if (result.experienceAnalysis.requiredYears !== null && result.experienceAnalysis.requiredYears !== undefined) {
        paragraph(`Explicit minimum stated in the job description: ${result.experienceAnalysis.requiredYears} years.`);
      }
      if (result.experienceAnalysis.explicitlyStatedResumeYears !== null && result.experienceAnalysis.explicitlyStatedResumeYears !== undefined) {
        paragraph(`Experience duration explicitly stated in the resume: ${result.experienceAnalysis.explicitlyStatedResumeYears} years.`);
      }
    }
    if (responsibilities.length) {
      table(
        ["Job responsibility", "Evidence status", "Resume evidence"],
        responsibilities.map((item) => [
          textValue(item.requirement, "Unavailable"),
          textValue(item.status, "Unavailable"),
          listValue(item.evidence).map((entry) => textValue(entry.text)).filter(Boolean).join("\n") || "No resume evidence identified.",
        ]),
        [contentWidth * 0.4, contentWidth * 0.2, contentWidth * 0.4],
      );
    }
  });

  const projects = listValue(result.projectAnalysis?.projects);
  sectionIf("Project Analysis", projects.length > 0 || result.projectAnalysis?.explanation, () => {
    if (result.projectAnalysis?.score !== null && result.projectAnalysis?.score !== undefined) {
      paragraph(`Project relevance score: ${displayScore(result.projectAnalysis.score)}.`);
    }
    projects.forEach((project) => {
      paragraph(textValue(project.name, "Project"), { bold: true });
      if (listValue(project.technologies).length) paragraph(`Technologies identified: ${project.technologies.join(", ")}.`);
      paragraph(textValue(project.description, "No project description available."));
      if (listValue(project.demonstratedSkills).length) paragraph(`Job skills evidenced by this project: ${project.demonstratedSkills.join(", ")}.`);
    });
    if (!projects.length) paragraph(textValue(result.projectAnalysis?.explanation, "Project details unavailable."));
  });

  const education = listValue(result.educationAnalysis?.requirements);
  sectionIf("Education and Certifications", education.length > 0 || listValue(result.eligibilityWarnings).length > 0, () => {
    if (education.length) {
      table(
        ["Qualification", "Requirement", "Analysis status"],
        education.map((item) => [
          textValue(item.requirement, "Unavailable"),
          textValue(item.requirementType, "Not categorized"),
          textValue(item.status, "Unavailable"),
        ]),
        [contentWidth * 0.48, contentWidth * 0.25, contentWidth * 0.27],
      );
    }
    listValue(result.eligibilityWarnings).forEach((item) => bullet(`${textValue(item.status)}: ${textValue(item.message)}`));
  });

  const achievements = listValue(result.achievementAnalysis?.statements);
  sectionIf("Achievements and Demonstrated Impact", achievements.length > 0, () => {
    if (result.achievementAnalysis?.score !== null && result.achievementAnalysis?.score !== undefined) {
      paragraph(`Achievement evidence score: ${displayScore(result.achievementAnalysis.score)}.`);
    }
    achievements.forEach((item) => {
      bullet(textValue(item.original));
      if (item.suggestion) paragraph(`Recommendation: ${item.suggestion}`, { indent: 4, color: MUTED });
    });
  });

  const atsDetails = result.atsReadabilityAnalysis || {};
  const formattingRisks = listValue(result.formattingRisks).length
    ? listValue(result.formattingRisks)
    : listValue(atsDetails.formattingRisks);
  sectionIf("ATS Readability and Parsing", typeof result.atsReadabilityScore === "number" || result.resumeParsingStatus || formattingRisks.length > 0, () => {
    paragraph(`Estimated ATS readability: ${displayScore(result.atsReadabilityScore)}. This is separate from the job-match score and is not a vendor-specific ATS prediction.`);
    if (result.resumeParsingStatus) paragraph(`Resume parsing status: ${result.resumeParsingStatus}.`);
    if (atsDetails.recognizedSections !== undefined && atsDetails.assessedSections !== undefined) {
      paragraph(`Common sections recognized: ${atsDetails.recognizedSections}/${atsDetails.assessedSections}.`);
    }
    if (atsDetails.extractedTextLength !== undefined) paragraph(`Extracted text length: ${atsDetails.extractedTextLength} characters.`);
    if (formattingRisks.length) formattingRisks.forEach((risk) => bullet(risk));
    else paragraph("No formatting or extraction issues were reported.");
    if (atsDetails.formula) paragraph(`Readability method: ${atsDetails.formula}`, { color: MUTED });
  });

  if (listValue(result.sections).length) {
    sectionIf("Resume Section Recognition", true, () => {
      table(
        ["Resume section", "Recognized"],
        listValue(result.sections).map((item) => [textValue(item.name), item.present ? "Yes" : "No"]),
        [contentWidth * 0.72, contentWidth * 0.28],
      );
    });
  }

  const recommendations = listValue(result.improvementRecommendations);
  const recommendationsAreStructured = recommendations.length && recommendations.some((item) => item && typeof item === "object");
  const normalizedRecommendations = recommendationsAreStructured
    ? recommendations.filter((item) => item && typeof item === "object")
    : listValue(result.recommendations).map((item) => ({ priority: "Unspecified", action: textValue(item), reason: "" }));
  sectionIf("Improvement Recommendations", normalizedRecommendations.length > 0 || listValue(result.suggestedResumeImprovements).length > 0, () => {
    const priorityGroups = ["High", "Medium", "Low", "Unspecified"];
    priorityGroups.forEach((priority) => {
      const group = normalizedRecommendations.filter((item) =>
        priority === "Unspecified" ? !["High", "Medium", "Low"].includes(textValue(item.priority)) : item.priority === priority
      );
      if (!group.length) return;
      paragraph(`${priority}-priority`, { bold: true, color: priority === "High" ? [185, 28, 28] : INK, after: 1 });
      group.forEach((item) => {
        paragraph(textValue(item.action, "Recommendation"), { bold: true, indent: 2, after: 0 });
        if (item.reason) paragraph(`Reason: ${item.reason}`, { indent: 4, after: 0 });
        if (item.section) paragraph(`Relevant section: ${item.section}.`, { indent: 4, after: 0 });
        if (item.changeType) paragraph(`Guidance: ${item.changeType}.`, { indent: 4 });
      });
    });
    listValue(result.suggestedResumeImprovements).forEach((item) => {
      paragraph("Suggested revision (recommendation, not verified fact)", { bold: true });
      if (item.original) paragraph(`Original: ${item.original}`, { indent: 2 });
      if (item.suggestion || item.suggested) paragraph(`Suggested: ${item.suggestion || item.suggested}`, { indent: 2 });
      if (item.reason) paragraph(`Reason: ${item.reason}`, { indent: 2 });
    });
  });

  const strengths = listValue(result.strengths);
  const gaps = listValue(result.criticalGaps);
  sectionIf("Strengths and Critical Gaps", strengths.length > 0 || gaps.length > 0, () => {
    strengths.forEach((item) => bullet(`Strength: ${item}`));
    gaps.forEach((item) => bullet(`Gap: ${item}`));
  });

  const softSkills = listValue(result.softSkillsAnalysis);
  sectionIf("Soft Skills Evidence", softSkills.length > 0, () => {
    softSkills.forEach((item) => {
      paragraph(`${textValue(item.skill)}: ${textValue(item.status, "Unavailable")}`, { bold: true });
      listValue(item.evidence).forEach((evidence) => bullet(textValue(evidence, "Evidence available")));
    });
  });

  const actionItems = [];
  normalizedRecommendations.forEach((item) => {
    const line = [textValue(item.action), textValue(item.reason)].filter(Boolean).join(" - ");
    if (line && !actionItems.includes(line)) actionItems.push(line);
  });
  gaps.forEach((item) => {
    if (item && !actionItems.includes(item)) actionItems.push(item);
  });
  sectionIf("Final Action Plan", actionItems.length > 0, () => {
    actionItems.slice(0, 5).forEach((item) => bullet(`[ ] ${item}`));
  });

  const limitations = listValue(result.limitationsAndUncertainty);
  sectionIf("Analysis Limitations", limitations.length > 0, () => limitations.forEach((item) => bullet(item)));

  const jobDescription = textValue(result.analysisMetadata?.jobDescriptionSnapshot).trim();
  sectionIf("Job Description Snapshot", Boolean(jobDescription), () => paragraph(jobDescription));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(PAGE.left, doc.internal.pageSize.getHeight() - 13, width - PAGE.right, doc.internal.pageSize.getHeight() - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("ResumeIQ Analysis Report", PAGE.left, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Page ${page} of ${pageCount}`, width - PAGE.right, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }

  return doc;
}

export async function downloadAnalysisReport(record) {
  const doc = createAnalysisReportPdf(record);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getAnalysisPdfFilename(record);
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
