import { createHash } from "node:crypto";

export const SCORE_WEIGHTS = Object.freeze({
  skills: 30,
  experience: 25,
  projects: 15,
  education: 10,
  achievements: 10,
  atsReadability: 10,
});

const SKILLS = [
  ["JavaScript", ["javascript", "js"]],
  ["TypeScript", ["typescript", "ts"]],
  ["Java", ["java"]],
  ["Python", ["python"]],
  ["C++", ["c++", "cpp"]],
  ["C#", ["c#", "c sharp"]],
  ["React", ["react", "react.js", "reactjs"]],
  ["Next.js", ["next.js", "nextjs"]],
  ["Angular", ["angular"]],
  ["Vue.js", ["vue", "vue.js", "vuejs"]],
  ["Node.js", ["node.js", "nodejs"]],
  ["Express", ["express", "express.js"]],
  ["HTML", ["html", "html5"]],
  ["CSS", ["css", "css3"]],
  ["Tailwind CSS", ["tailwind", "tailwind css"]],
  ["Bootstrap", ["bootstrap"]],
  ["Redux", ["redux"]],
  ["REST APIs", ["rest api", "rest apis", "restful api", "restful apis"]],
  ["GraphQL", ["graphql"]],
  ["MongoDB", ["mongodb", "mongo db"]],
  ["MySQL", ["mysql"]],
  ["PostgreSQL", ["postgresql", "postgres"]],
  ["SQLite", ["sqlite"]],
  ["Firebase", ["firebase"]],
  ["Redis", ["redis"]],
  ["SQL", ["sql"]],
  ["Git", ["git"]],
  ["GitHub", ["github"]],
  ["Docker", ["docker"]],
  ["Kubernetes", ["kubernetes", "k8s"]],
  ["AWS", ["aws", "amazon web services"]],
  ["Azure", ["azure", "microsoft azure"]],
  ["Google Cloud", ["google cloud", "gcp"]],
  ["Linux", ["linux"]],
  ["Jest", ["jest"]],
  ["Cypress", ["cypress"]],
  ["Playwright", ["playwright"]],
  ["Figma", ["figma"]],
  ["Machine Learning", ["machine learning", "ml"]],
  ["Artificial Intelligence", ["artificial intelligence", "ai"]],
  ["Data Analysis", ["data analysis", "data analytics"]],
  ["Pandas", ["pandas"]],
  ["NumPy", ["numpy"]],
  ["TensorFlow", ["tensorflow"]],
  ["PyTorch", ["pytorch"]],
  ["Agile", ["agile"]],
  ["Scrum", ["scrum"]],
  ["CI/CD", ["ci/cd", "continuous integration", "continuous delivery"]],
  ["Spring", ["spring", "spring boot"]],
  [".NET", [".net", "dotnet"]],
  ["PHP", ["php"]],
  ["Ruby", ["ruby"]],
  ["Go", ["golang", "go"]],
  ["Swift", ["swift"]],
  ["Kotlin", ["kotlin"]],
];

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our",
  "are", "will", "have", "has", "into", "their", "they", "job", "role", "work",
  "using", "about", "years", "year", "team", "skills", "skill", "experience",
  "required", "preferred", "looking", "candidate", "responsibilities",
  "requirements", "ability", "strong", "good", "excellent", "must", "should",
  "can", "who", "all", "any", "not", "but", "per", "via", "new", "more",
  "youll", "youll", "will", "within", "across", "including", "such", "other",
  "well", "etc", "ensure", "build", "develop", "work", "working", "responsible",
]);

const HEADING_PATTERNS = [
  ["Contact Information", /\b(?:contact|email|phone|linkedin|github)\b/i],
  ["Professional Summary", /\b(?:professional\s+)?(?:summary|profile|objective|about\s+me)\b/i],
  ["Skills", /\b(?:technical\s+)?skills\b|\btechnologies\b|\btech\s+stack\b/i],
  ["Experience", /\b(?:work\s+)?experience\b|\bemployment\b|\bprofessional\s+history\b|\binternships?\b/i],
  ["Education", /\beducation\b|\bacademic\s+background\b|\bqualifications?\b/i],
  ["Projects", /\bprojects?\b|\bproject\s+experience\b/i],
  ["Certifications", /\bcertifications?\b|\blicenses?\b/i],
];

const ACTION_VERBS = /\b(?:built|created|designed|developed|implemented|improved|increased|reduced|led|launched|delivered|automated|optimized|managed|supported|analyzed|collaborated|coordinated|migrated|tested|deployed|integrated|maintained|engineered|owned|achieved)\b/i;
const METRIC_PATTERN = /(?:\b\d+(?:\.\d+)?\s*%|\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:users|customers|requests|projects|hours|days|weeks|months|years|ms|seconds|people|members|dollars|usd)\b|\$\s?\d)/i;
function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9+#./-]/g, " ").replace(/\s+/g, " ").trim();
}

function skillPattern(alias) {
  const words = normalize(alias).split(" ").filter(Boolean);
  return new RegExp(`(?:^|[^a-z0-9])${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]*")}(?=$|[^a-z0-9])`, "i");
}

function containsSkill(text, skill) {
  const value = String(text || "");
  return skill.aliases.some((alias) => skillPattern(alias).test(value));
}

function getSkills(text) {
  return SKILLS.map(([name, aliases]) => ({ name, aliases }))
    .filter((skill) => containsSkill(text, skill));
}

function getLines(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function sectionContent(text, headingName) {
  const lines = getLines(text);
  const indexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = HEADING_PATTERNS.find(([name, pattern]) => name === headingName && pattern.test(lines[index]));
    if (heading) indexes.push(index);
  }
  if (!indexes.length) return "";
  const start = indexes[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (HEADING_PATTERNS.some(([name, pattern]) => name !== headingName && pattern.test(lines[index]))) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function hasHeading(text, name) {
  const pattern = HEADING_PATTERNS.find(([heading]) => heading === name)?.[1];
  if (!pattern) return false;
  return getLines(text).some((line) => pattern.test(line));
}

function getSkillEvidence(resumeText, skill) {
  const lines = getLines(resumeText);
  const evidenceLines = lines.filter((line) => containsSkill(line, skill));
  const nonSkillsLines = evidenceLines.filter((line) => classifySection(line, resumeText) !== "Skills");
  const evidence = evidenceLines.slice(0, 3).map((line) => ({
    text: line.slice(0, 320),
    section: classifySection(line, resumeText),
  }));
  const practicalEvidence = nonSkillsLines.some((line) =>
    ACTION_VERBS.test(line) || ["Experience", "Projects"].includes(classifySection(line, resumeText))
  );
  return {
    evidence,
    practicalEvidence,
    contextualEvidence: nonSkillsLines.length > 0,
    listedOnly: evidenceLines.length > 0 && !nonSkillsLines.length,
  };
}

function classifySection(line, resumeText) {
  const sections = ["Experience", "Projects", "Education", "Certifications", "Professional Summary", "Skills"];
  const lines = getLines(resumeText);
  const index = lines.indexOf(line);
  if (index >= 0) {
    for (let previous = index; previous >= 0; previous -= 1) {
      const heading = sections.find((name) => {
        const pattern = HEADING_PATTERNS.find(([headingName]) => headingName === name)?.[1];
        return pattern?.test(lines[previous]);
      });
      if (heading) return heading;
    }
  }
  if (/project/i.test(line)) return "Projects";
  if (/intern|experience|worked|employment/i.test(line)) return "Experience";
  return "Resume";
}

function getRequirementTypeAt(text, targetIndex) {
  const cues = [
    ...[...text.matchAll(/\b(?:preferred|preferably|nice to have|nice-to-have|bonus|desired|a plus|plus if|ideally)\b/gi)]
      .map((match) => ({ index: match.index, type: "preferred" })),
    ...[...text.matchAll(/\b(?:required|must have|mandatory|minimum)\b/gi)]
      .map((match) => ({ index: match.index, type: "required" })),
  ];
  const precedingCue = cues.filter((cue) => cue.index <= targetIndex).sort((left, right) => right.index - left.index)[0];
  const followingCue = cues.filter((cue) => cue.index > targetIndex)
    .sort((left, right) => left.index - right.index)[0];
  const cue = precedingCue || (followingCue && followingCue.index - targetIndex <= 40 ? followingCue : null);
  return {
    requirementType: cue?.type || "required",
    requirementTypeSource: cue ? "explicit wording" : "inferred from job description",
  };
}

function extractRequirements(jobDescription) {
  return getSkills(jobDescription).map((skill) => {
    const normalizedJd = String(jobDescription);
    const matchIndex = skill.aliases
      .map((alias) => normalizedJd.toLowerCase().indexOf(alias.toLowerCase()))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0] ?? 0;
    return {
      name: skill.name,
      ...getRequirementTypeAt(normalizedJd, matchIndex),
      aliases: skill.aliases,
    };
  });
}

function getRequirementStatus(requirement, resumeText, profileSkills = []) {
  const skill = SKILLS.map(([name, aliases]) => ({ name, aliases })).find((item) => item.name === requirement.name);
  const { evidence, practicalEvidence, contextualEvidence, listedOnly } = getSkillEvidence(resumeText, skill);
  const profileClaimed = profileSkills.some((profileSkill) =>
    containsSkill(profileSkill, skill)
  );
  let status = "missing";
  if (practicalEvidence) status = "matched";
  else if (contextualEvidence) status = "partially matched";
  else if (listedOnly || profileClaimed) status = "insufficient evidence";
  return {
    skill: requirement.name,
    requirementType: requirement.requirementType,
    requirementTypeSource: requirement.requirementTypeSource,
    status,
    profileClaimed,
    matchType: evidence.length ? "exact or equivalent terminology" : "not found",
    evidence,
    explanation: status === "matched"
      ? "The resume mentions this skill in contextual experience or project evidence."
      : status === "insufficient evidence"
        ? profileClaimed && !listedOnly
          ? "This skill is listed in profile preferences but was not found in the resume; it is not counted as resume evidence."
          : "The skill appears in the resume, but no practical use was identified."
        : status === "partially matched"
          ? "The skill appears outside a dedicated skills list, but the extracted text does not show enough context to count it as practical evidence."
          : "No exact or recognized equivalent mention was found in the extracted resume text.",
  };
}

function extractTokens(text) {
  return new Set(normalize(text).split(/\s+/).filter((token) =>
    token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)
  ));
}

function splitStatements(text) {
  return String(text || "").split(/\n|(?<=[.!?])\s+/)
    .map((part) => part.replace(/^[\s•*\-\u2022]+/, "").trim())
    .filter((part) => part.length >= 35 && part.length <= 700);
}

function responsibilityStatements(jobDescription) {
  const action = /\b(?:develop|build|design|implement|lead|manage|create|deliver|maintain|collaborate|analy[sz]e|optimi[sz]e|support|integrate|test|deploy|coordinate|own|drive|architect|monitor|troubleshoot|communicate)\w*\b/i;
  return splitStatements(jobDescription).filter((statement) =>
    action.test(statement) && !/^(?:requirements?|qualifications?|preferred|must have|nice to have)\b/i.test(statement)
  );
}

function similarity(left, right) {
  const a = extractTokens(left);
  const b = extractTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}

function findYearRequirement(jobDescription) {
  const match = String(jobDescription).match(/(?:at least|minimum of|min\.?|required)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience/i);
  return match ? Number(match[1]) : null;
}

function parseResumeYears(resumeText) {
  const match = String(resumeText).match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience\b/i);
  return match ? Number(match[1]) : null;
}

function findEducationRequirements(jobDescription) {
  const values = [];
  const requirements = [
    ["PhD", /\b(?:ph\.?d|doctorate)\b/i],
    ["Master's degree", /\b(?:master'?s?|m\.?s\.?|m\.?a\.?|m\.?tech|mca)\b/i],
    ["Bachelor's degree", /\b(?:bachelor'?s?|b\.?s\.?|b\.?a\.?|b\.?tech|b\.?e\.?)\b/i],
    ["Associate degree", /\bassociate(?:'s)? degree\b/i],
    ["degree", /\bdegree\b/i],
  ];
  for (const [name, pattern] of requirements) {
    const match = pattern.exec(jobDescription);
    if (match && !values.some((item) => item.name === name)) {
      values.push({ name, ...getRequirementTypeAt(jobDescription, match.index) });
    }
  }
  if (values.length > 1) {
    const specificDegrees = values.filter((item) => item.name !== "degree");
    if (specificDegrees.length) {
      values.splice(0, values.length, ...specificDegrees);
    }
  }
  const certification = String(jobDescription).match(/\b(?:certification|certified|license|licensure)\b/i);
  if (certification) {
    values.push({ name: "Certification or license specified", ...getRequirementTypeAt(jobDescription, certification.index) });
  }
  return values;
}

function matchingBulletScore(requirements, resumeStatements) {
  if (!requirements.length || !resumeStatements.length) return null;
  const scores = requirements.map((requirement) => Math.max(...resumeStatements.map((statement) => similarity(requirement, statement)), 0));
  return Math.round(scores.reduce((sum, score) => sum + Math.min(score / 0.45, 1), 0) / scores.length * 100);
}

function findEvidence(sentence, resumeText) {
  return splitStatements(resumeText)
    .map((text) => ({ text, overlap: similarity(sentence, text) }))
    .filter((item) => item.overlap >= 0.18)
    .sort((left, right) => right.overlap - left.overlap)
    .slice(0, 2)
    .map(({ text, overlap }) => ({ text: text.slice(0, 320), relevance: Math.round(overlap * 100) }));
}

function buildScoreBreakdown(dimensions) {
  const availableWeight = dimensions.reduce((sum, item) => item.score === null ? sum : sum + item.weight, 0);
  const scoreBreakdown = dimensions.map((item) => ({
    dimension: item.dimension,
    score: item.score,
    weight: item.weight,
    effectiveWeight: item.score === null || !availableWeight
      ? null
      : Number((item.weight / availableWeight * 100).toFixed(2)),
    weightedContribution: item.score === null || !availableWeight
      ? null
      : Number((item.score * item.weight / availableWeight).toFixed(2)),
    status: item.score === null ? "unavailable" : "scored",
    reason: item.reason,
  }));
  const overallJobMatchScore = availableWeight
    ? Math.round(scoreBreakdown.reduce((sum, item) => sum + (item.weightedContribution || 0), 0))
    : null;
  return { overallJobMatchScore, scoreBreakdown, availableWeight };
}

function getAtsAssessment(resumeText, sections) {
  const textLength = String(resumeText || "").trim().length;
  const requiredSections = ["Professional Summary", "Skills", "Experience", "Education", "Projects"];
  const sectionCoverage = requiredSections.filter((name) => sections.find((section) => section.name === name)?.present).length;
  const contactDetected = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d\s().-]{6,}\d))/i.test(resumeText);
  const textQuality = textLength >= 500 ? 100 : textLength >= 200 ? 70 : textLength >= 80 ? 40 : 0;
  const atsReadabilityScore = Math.round(sectionCoverage / requiredSections.length * 70 + (contactDetected ? 10 : 0) + textQuality * 0.2);
  const resumeParsingStatus = textLength < 80 ? "unreadable" : textLength < 200 ? "partial" : "readable";
  const formattingRisks = [];
  if (resumeParsingStatus !== "readable") formattingRisks.push("Extracted resume text is too short for reliable parsing; check the file or provide a text-based PDF/DOCX.");
  if (!contactDetected) formattingRisks.push("No recognizable email address or phone number was found in the extracted text.");
  if (sectionCoverage < 3) formattingRisks.push("Fewer than three common resume section headings were recognized in the extracted text.");
  if (textLength >= 80 && !sections.some((section) => section.present)) formattingRisks.push("No standard section headings were recognized; review the extracted text and headings.");
  return {
    atsReadabilityScore,
    resumeParsingStatus,
    formattingRisks,
    contactDetected,
    sectionCoverage,
    requiredSectionCount: requiredSections.length,
    extractedTextLength: textLength,
  };
}

function buildSections(resumeText) {
  return HEADING_PATTERNS.map(([name]) => ({ name, present: hasHeading(resumeText, name) }));
}

function scoreAchievements(resumeText) {
  const statements = splitStatements(resumeText);
  if (!statements.length) return null;
  const achievementStatements = statements.filter((line) => ACTION_VERBS.test(line));
  const measurableStatements = achievementStatements.filter((line) => METRIC_PATTERN.test(line));
  const actionScore = Math.min(achievementStatements.length / 4, 1) * 65;
  const impactScore = Math.min(measurableStatements.length / 2, 1) * 35;
  return Math.round(actionScore + impactScore);
}

function makeStrengths(skillResults, experienceAnalysis, projectAnalysis) {
  const strengths = [];
  const matched = skillResults.filter((item) => item.status === "matched");
  if (matched.length) strengths.push(`Practical resume evidence matches ${matched.slice(0, 5).map((item) => item.skill).join(", ")}.`);
  if (experienceAnalysis.score !== null && experienceAnalysis.score >= 60) strengths.push("Several job responsibilities have relevant evidence in the experience section.");
  if (projectAnalysis.score !== null && projectAnalysis.score >= 60) strengths.push("The project section contains technologies or work related to this job.");
  return strengths;
}

export function analyzeResume({ resumeText, jobDescription = "", jobTitle = "Target Role", profilePreferences = null }) {
  const sourceResume = String(resumeText || "").trim();
  const sourceJd = String(jobDescription || "").trim();
  if (sourceResume.length < 80) {
    const error = new Error("Extracted resume text is too short for reliable analysis. Check the file or provide a text-based PDF/DOCX.");
    error.status = 422;
    throw error;
  }

  const sections = buildSections(sourceResume);
  const experienceSection = sectionContent(sourceResume, "Experience") || sourceResume;
  const projectSection = sectionContent(sourceResume, "Projects");
  const educationSection = sectionContent(sourceResume, "Education");
  const requirements = sourceJd ? extractRequirements(sourceJd) : [];
  const profileSkills = Array.isArray(profilePreferences?.technicalSkills) ? profilePreferences.technicalSkills : [];
  const skillResults = requirements.map((requirement) => getRequirementStatus(requirement, sourceResume, profileSkills));
  const matchedSkills = skillResults.filter((item) => item.status === "matched");
  const partiallyMatchedSkills = skillResults.filter((item) => item.status === "partially matched");
  const missingRequiredSkills = skillResults.filter((item) => item.requirementType === "required" && item.status === "missing");
  const missingPreferredSkills = skillResults.filter((item) => item.requirementType === "preferred" && item.status === "missing");
  const insufficientSkills = skillResults.filter((item) => item.status === "insufficient evidence");
  const requiredResults = skillResults.filter((item) => item.requirementType === "required");
  const preferredResults = skillResults.filter((item) => item.requirementType === "preferred");
  const categoryAverage = (items) => items.length
    ? items.reduce((sum, item) => sum + (item.status === "matched" ? 1 : item.status === "partially matched" ? 0.5 : item.status === "insufficient evidence" ? 0.25 : 0), 0) / items.length
    : null;
  const requiredSkillAverage = categoryAverage(requiredResults);
  const preferredSkillAverage = categoryAverage(preferredResults);
  const skillScore = skillResults.length
    ? Math.round(((requiredSkillAverage === null ? 0 : requiredSkillAverage * (preferredSkillAverage === null ? 1 : 0.8))
      + (preferredSkillAverage === null ? 0 : preferredSkillAverage * (requiredSkillAverage === null ? 1 : 0.2))) * 100)
    : null;

  const jdStatements = sourceJd ? responsibilityStatements(sourceJd) : [];
  const resumeExperienceStatements = splitStatements(experienceSection);
  const experienceScore = sourceJd
    ? matchingBulletScore(jdStatements, resumeExperienceStatements)
    : null;
  const minYears = sourceJd ? findYearRequirement(sourceJd) : null;
  const statedYears = parseResumeYears(sourceResume);
  const experienceAnalysis = {
    score: experienceScore,
    responsibilities: jdStatements.map((statement) => ({
      requirement: statement,
      evidence: findEvidence(statement, experienceSection),
      status: findEvidence(statement, experienceSection).length ? "evidence found" : "no clear evidence",
    })),
    requiredYears: minYears,
    explicitlyStatedResumeYears: statedYears,
    yearsStatus: minYears === null ? "not specified" : statedYears === null ? "not verifiable from extracted resume text" : statedYears >= minYears ? "meets stated minimum" : "below stated minimum",
    limitations: minYears !== null && statedYears === null ? ["Relevant experience duration could not be calculated reliably from the available dates or explicit years statement."] : [],
  };

  let projectScore = null;
  let projectItems = [];
  if (projectSection) {
    const projectStatements = splitStatements(projectSection);
    projectItems = splitStatements(projectSection).map((description) => {
      const projectSkills = getSkills(description).map((skill) => skill.name);
      const matchedRequirements = skillResults
        .filter((item) => item.status === "matched")
        .filter((item) => containsSkill(description, { aliases: SKILLS.find(([name]) => name === item.skill)?.[1] || [item.skill] }))
        .map((item) => item.skill);
      return { name: description.split(/[|–—:]/)[0].slice(0, 100), technologies: projectSkills, description: description.slice(0, 500), demonstratedSkills: matchedRequirements };
    });
    const projectSkills = getSkills(projectSection);
    const matchingCount = projectSkills.filter((skill) => skillResults.some((item) => item.skill === skill.name && item.status === "matched")).length;
    const skillRelevance = skillResults.length ? matchingCount / Math.max(1, skillResults.length) : null;
    const responsibilityRelevance = matchingBulletScore(jdStatements, projectStatements);
    const projectEvidenceScores = sourceJd
      ? [skillRelevance, responsibilityRelevance].filter((score) => score !== null)
      : [];
    projectScore = projectEvidenceScores.length
      ? Math.round(projectEvidenceScores.reduce((sum, score) => sum + (score > 1 ? score / 100 : score), 0) / projectEvidenceScores.length * 100)
      : null;
  }

  const educationRequirements = sourceJd ? findEducationRequirements(sourceJd) : [];
  const educationCriteria = educationRequirements.map((item) => ({
    requirement: item.name,
    requirementType: item.requirementType,
    requirementTypeSource: item.requirementTypeSource,
    status: /\b(?:ph\.?d|doctorate)\b/i.test(item.name)
      ? (/\b(?:ph\.?d|doctorate)\b/i.test(educationSection) ? "met" : "not verified")
      : /\bmaster/i.test(item.name)
        ? (/\b(?:master|m\.?s\.?|m\.?a\.?|m\.?tech|mca)\b/i.test(educationSection) ? "met" : "not verified")
        : /\bbachelor/i.test(item.name)
          ? (/\b(?:bachelor|b\.?s\.?|b\.?a\.?|b\.?tech|b\.?e\.?)\b/i.test(educationSection) ? "met" : "not verified")
          : /\bcertification|certified|license/i.test(item.name)
            ? (/\bcertification|certified|license/i.test(sectionContent(sourceResume, "Certifications")) ? "met" : "not verified")
            : (educationSection ? "evidence present; specific match unclear" : "not verified"),
  }));
  const educationScore = educationCriteria.length
    ? Math.round(educationCriteria.filter((item) => item.status === "met").length / educationCriteria.length * 100)
    : null;

  const achievementScore = scoreAchievements(sourceResume);
  const {
    atsReadabilityScore,
    resumeParsingStatus,
    formattingRisks,
    contactDetected,
    sectionCoverage,
    requiredSectionCount,
    extractedTextLength,
  } = getAtsAssessment(sourceResume, sections);
  const scoreDimensions = [
    { dimension: "Required and preferred skills", score: skillScore, weight: SCORE_WEIGHTS.skills, reason: skillScore === null ? "No recognized skills were extracted from the job description." : "When both types are present, required skills contribute 80% and preferred skills 20% within this dimension. Practical evidence scores above a skills-list mention; repeated mentions count once." },
    { dimension: "Experience and responsibilities", score: experienceScore, weight: SCORE_WEIGHTS.experience, reason: experienceScore === null ? "No sufficiently specific responsibility statements could be compared." : "Compares token overlap between each job responsibility and resume experience statement; it does not estimate total career tenure." },
    { dimension: "Projects and practical experience", score: projectScore, weight: SCORE_WEIGHTS.projects, reason: projectScore === null ? "No job-relevant project evidence could be evaluated." : "Averages available project skill overlap and responsibility overlap; unavailable signals are not treated as zero." },
    { dimension: "Education and certifications", score: educationScore, weight: SCORE_WEIGHTS.education, reason: educationScore === null ? "The job description did not specify an education or certification requirement." : "Checks only explicit job-description qualifications against recognizable resume evidence." },
    { dimension: "Achievements and demonstrated impact", score: achievementScore, weight: SCORE_WEIGHTS.achievements, reason: achievementScore === null ? "No resume statements were long enough to assess." : "Uses action-oriented statements (up to 65 points) and measurable outcome statements (up to 35 points); no results are inferred." },
    { dimension: "ATS readability", score: atsReadabilityScore, weight: SCORE_WEIGHTS.atsReadability, reason: "Estimated from extracted text length, recognizable section headings, and detectable contact details; it is not a vendor-specific ATS prediction." },
  ];
  const { overallJobMatchScore, scoreBreakdown, availableWeight } = sourceJd
    ? buildScoreBreakdown(scoreDimensions)
    : { overallJobMatchScore: null, scoreBreakdown: scoreDimensions.map((item) => ({ dimension: item.dimension, score: item.dimension === "ATS readability" ? item.score : null, weight: item.weight, effectiveWeight: item.dimension === "ATS readability" ? 100 : null, weightedContribution: null, status: item.dimension === "ATS readability" ? "scored" : "unavailable", reason: item.dimension === "ATS readability" ? item.reason : "Job description not provided; job-specific matching was not performed." })), availableWeight: SCORE_WEIGHTS.atsReadability };

  const allResumeSkills = getSkills(sourceResume);
  const matchedKeywords = skillResults.filter((item) => item.status === "matched").map((item) => item.skill);
  const missingKeywords = skillResults.filter((item) => item.status === "missing").map((item) => item.skill);
  const keywordAnalysis = {
    matchedTechnicalKeywords: matchedKeywords,
    missingRequiredKeywords: missingRequiredSkills.map((item) => item.skill),
    missingPreferredKeywords: missingPreferredSkills.map((item) => item.skill),
    insufficientEvidenceKeywords: insufficientSkills.map((item) => item.skill),
    partiallyMatchedKeywords: partiallyMatchedSkills.map((item) => item.skill),
    coverage: skillResults.length ? Math.round(matchedSkills.length / skillResults.length * 100) : null,
    duplicateOccurrencesIgnored: true,
    guidance: [...missingRequiredSkills, ...missingPreferredSkills].map((item) => ({
      keyword: item.skill,
      requirementType: item.requirementType,
      suggestion: item.requirementType === "required"
        ? "If you have this skill, add a truthful example showing where you used it; otherwise consider learning it before claiming it."
        : "Include this only if you have relevant experience; otherwise prioritize more relevant evidence.",
    })),
  };

  const softSkillNames = ["communication", "teamwork", "leadership", "problem-solving", "adaptability", "collaboration", "ownership"];
  const softSkillsAnalysis = softSkillNames
    .filter((name) => sourceJd && normalize(sourceJd).includes(normalize(name)))
    .map((name) => {
      const evidence = getLines(sourceResume).filter((line) => normalize(line).includes(normalize(name))).slice(0, 2);
      return { skill: name, status: evidence.length ? "evidence found" : "not evidenced", evidence };
    });
  const strengths = makeStrengths(skillResults, experienceAnalysis, { score: projectScore });
  const criticalGaps = [
    ...missingRequiredSkills.map((item) => `Required skill not found: ${item.skill}.`),
    ...insufficientSkills.filter((item) => item.requirementType === "required").map((item) => `Practical evidence for required skill is unclear: ${item.skill}.`),
    ...(experienceAnalysis.yearsStatus === "below stated minimum" ? [`The resume explicitly states ${statedYears} years against a stated minimum of ${minYears}.`] : []),
  ];
  const improvementRecommendations = [
    ...missingRequiredSkills.map((item) => ({
      priority: "High",
      action: `Address the ${item.skill} requirement`,
      reason: `The job description treats ${item.skill} as a required skill and it was not found in the extracted resume.`,
      section: "Skills or relevant experience",
      changeType: "Add only if truthful; otherwise build the skill",
    })),
    ...insufficientSkills.map((item) => ({
      priority: item.requirementType === "required" ? "High" : "Medium",
      action: `Add concrete evidence for ${item.skill}`,
      reason: `The skill is listed, but the resume text does not show how it was applied.`,
      section: "Experience or projects",
      changeType: "Describe existing experience only",
    })),
    ...partiallyMatchedSkills.map((item) => ({
      priority: item.requirementType === "required" ? "High" : "Medium",
      action: `Clarify the context for ${item.skill}`,
      reason: `The resume mentions this skill, but its context is not strong enough to count as practical evidence.`,
      section: "Professional summary, experience, or projects",
      changeType: "Clarify existing experience only",
    })),
    ...(formattingRisks.length ? [{
      priority: "Medium",
      action: "Improve text extraction and section clarity",
      reason: formattingRisks[0],
      section: "Resume formatting",
      changeType: "Wording or formatting improvement",
    }] : []),
    ...(achievementScore !== null && achievementScore < 50 ? [{
      priority: "Low",
      action: "Clarify contributions and outcomes",
      reason: "The extracted resume has few action-oriented statements or explicit measurable outcomes.",
      section: "Experience and projects",
      changeType: "Improve wording; add metrics only when verified",
    }] : []),
  ];
  if (!sourceJd) {
    improvementRecommendations.unshift({
      priority: "Medium",
      action: "Add a target job description for job-specific matching",
      reason: "This report assesses resume readability only; no job match or skill gap analysis was performed.",
      section: "Analysis input",
      changeType: "Provide the job description",
    });
  }

  const result = {
    overallJobMatchScore,
    overallScore: overallJobMatchScore ?? atsReadabilityScore,
    analysisMode: sourceJd ? "job-match" : "resume-only",
    scoreBreakdown,
    atsReadabilityScore,
    atsReadabilityAnalysis: {
      score: atsReadabilityScore,
      recognizedSections: sectionCoverage,
      assessedSections: requiredSectionCount,
      contactDetailsDetected: contactDetected,
      extractedTextLength,
      formula: "70% common-section coverage + 10% recognizable email/phone + 20% extracted-text sufficiency. Text sufficiency is tiered at 80, 200, and 500 characters.",
    },
    resumeParsingStatus,
    jobRequirements: {
      title: String(jobTitle || "Target Role").trim() || "Target Role",
      skills: skillResults,
      responsibilities: jdStatements,
      requiredExperienceYears: minYears,
      educationAndCertification: educationCriteria,
    },
    matchedSkills,
    partiallyMatchedSkills,
    missingRequiredSkills,
    missingPreferredSkills,
    keywordAnalysis,
    experienceAnalysis,
    projectAnalysis: {
      status: projectScore === null ? "unavailable" : "evaluated",
      score: projectScore,
      projects: projectItems,
      explanation: projectScore === null
        ? !projectSection ? "No projects section was recognized." : "Project-to-job relevance could not be calculated from the available job requirements."
        : "Project relevance is based on technologies and resume evidence found in the project section.",
    },
    educationAnalysis: {
      status: educationScore === null ? "unavailable" : "evaluated",
      score: educationScore,
      requirements: educationCriteria,
    },
    achievementAnalysis: {
      score: achievementScore,
      statements: splitStatements(sourceResume).filter((line) => ACTION_VERBS.test(line)).slice(0, 8).map((original) => ({
        original,
        hasMeasurableOutcome: METRIC_PATTERN.test(original),
        suggestion: METRIC_PATTERN.test(original) ? null : "Clarify the scope or outcome when you can support it; do not invent metrics.",
      })),
    },
    softSkillsAnalysis,
    eligibilityWarnings: educationCriteria.filter((item) => item.requirementType === "required" && item.status !== "met").map((item) => ({
      requirement: item.requirement,
      requirementType: item.requirementType,
      status: "not verifiable",
      message: `The resume text does not clearly verify the job requirement: ${item.requirement}.`,
    })).concat(minYears !== null && experienceAnalysis.yearsStatus !== "meets stated minimum" ? [{
      requirement: `${minYears} years of experience`,
      status: statedYears === null ? "not verifiable" : "apparently unmet",
      message: statedYears === null
        ? "The resume does not state a verifiable total; dates and relevant experience were not confidently calculated."
        : `The resume explicitly states ${statedYears} years against the stated minimum of ${minYears}.`,
    }] : []),
    strengths,
    criticalGaps,
    improvementRecommendations,
    suggestedResumeImprovements: [],
    limitationsAndUncertainty: [
      "Analysis is deterministic and based only on extracted text; semantic AI assessment is not configured for resume data.",
      "OCR is not available in the current browser-side extraction pipeline. Image-only/scanned resumes may have incomplete text.",
      "This estimated readability score does not predict the decision of a specific ATS or guarantee an interview.",
      ...(resumeParsingStatus === "unreadable" ? ["Extracted text is too short for reliable analysis; do not rely on job-match results until extraction is corrected."] : []),
    ],
    keywordScore: keywordAnalysis.coverage ?? 0,
    skillScore: skillScore ?? 0,
    sectionScore: Math.round(sections.filter((section) => section.present).length / sections.length * 100),
    formattingScore: atsReadabilityScore,
    matchedKeywords,
    missingKeywords,
    detectedSkills: allResumeSkills.map((skill) => skill.name),
    sections,
    formattingRisks,
    recommendations: improvementRecommendations.map((item) => `${item.priority}: ${item.action}. ${item.reason}`),
    analysisMetadata: {
      algorithmVersion: "2.0.0",
      scoreWeights: SCORE_WEIGHTS,
      availableWeight,
      missingDimensionPolicy: "Unavailable dimensions are excluded and the remaining configured weights are proportionally renormalized.",
      analysisMode: sourceJd ? "job-match" : "resume-only",
      profilePreferences: profilePreferences ? {
        experienceLevel: profilePreferences.experienceLevel,
        targetJobTitles: profilePreferences.targetJobTitles,
        atsStandard: profilePreferences.atsStandard,
        targetIndustry: profilePreferences.targetIndustry,
      } : null,
      resumeTextFingerprint: createHash("sha256").update(sourceResume).digest("hex"),
      jobDescriptionSnapshot: sourceJd,
      analyzedAt: new Date().toISOString(),
    },
  };
  return result;
}
