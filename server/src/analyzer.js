const STOP = new Set([
  "the","and","for","with","that","this","from","your","you","our","are","will",
  "have","has","into","their","they","job","role","work","using","about","years",
  "year","team","skills","skill","experience","required","preferred","looking",
  "candidate","responsibilities","requirements","ability","strong","good","excellent",
  "must","should","can","who","all","any","not","but","per","via","new","more"
]);

const SKILL_PATTERNS = [
  "javascript","typescript","react","next.js","node.js","express","html","css",
  "tailwind","bootstrap","redux","vite","rest api","graphql","mongodb","mysql",
  "postgresql","sqlite","firebase","git","github","docker","aws","python","java",
  "c++","figma","jest","cypress","playwright","sql","redis","linux"
];

function normalize(s="") {
  return s.toLowerCase().replace(/[^a-z0-9+#.\- ]/g, " ");
}

function tokens(s="") {
  return [...new Set(normalize(s).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)))];
}

function extractKeywords(jd) {
  const words = tokens(jd);
  const phraseHits = SKILL_PATTERNS.filter(s => normalize(jd).includes(normalize(s)));
  return [...new Set([...phraseHits, ...words])]
    .filter(x => x.length > 2)
    .slice(0, 80);
}

function hasAny(text, patterns) {
  const t = normalize(text);
  return patterns.some(p => t.includes(normalize(p)));
}

export function analyzeResume({ resumeText, jobDescription }) {
  const resume = normalize(resumeText);
  const jd = normalize(jobDescription);

  const keywords = extractKeywords(jobDescription);
  const matched = keywords.filter(k => resume.includes(normalize(k)));
  const missing = keywords.filter(k => !resume.includes(normalize(k)));
  const keywordScore = keywords.length ? Math.round(matched.length / keywords.length * 100) : 0;

  const sections = [
    ["Contact Information", hasAny(resume, ["@", "linkedin", "github"])],
    ["Professional Summary", hasAny(resume, ["summary","profile","objective"])],
    ["Skills", hasAny(resume, ["skills","technical skills","technologies"])],
    ["Experience", hasAny(resume, ["experience","work experience","employment"])],
    ["Education", hasAny(resume, ["education","degree","bachelor","master","mca","b.tech","b.e"])],
    ["Projects", hasAny(resume, ["projects","project experience"])],
    ["Certifications", hasAny(resume, ["certification","certifications","certificate"])],
  ];

  const sectionScore = Math.round(sections.filter(x => x[1]).length / sections.length * 100);

  const formattingRisks = [];
  if (resumeText.length < 900) formattingRisks.push("Resume text is very short; add measurable detail where appropriate.");
  if (!hasAny(resume, ["linkedin"])) formattingRisks.push("Add a LinkedIn profile if relevant.");
  if (!hasAny(resume, ["github"])) formattingRisks.push("Add GitHub for a web-development role if you have relevant work.");
  if ((resumeText.match(/%/g) || []).length === 0 && (resumeText.match(/increased|reduced|improved|built|developed|achieved/gi) || []).length < 2) {
    formattingRisks.push("Use measurable outcomes in experience/project bullets.");
  }

  const skillHits = SKILL_PATTERNS.filter(s => resume.includes(normalize(s)));
  const jobSkillHits = SKILL_PATTERNS.filter(s => jd.includes(normalize(s)));
  const matchedJobSkills = jobSkillHits.filter(s => resume.includes(normalize(s)));
  const skillScore = jobSkillHits.length ? Math.round(matchedJobSkills.length / jobSkillHits.length * 100) : 50;

  const overall = Math.round(
    keywordScore * 0.45 +
    sectionScore * 0.25 +
    skillScore * 0.20 +
    Math.max(0, 100 - formattingRisks.length * 10) * 0.10
  );

  const recommendations = [];
  if (keywordScore < 70) recommendations.push(`Add relevant missing keywords naturally: ${missing.slice(0, 8).join(", ")}.`);
  if (sectionScore < 85) recommendations.push("Complete the missing standard resume sections.");
  if (skillScore < 70) recommendations.push("Align your Skills section with technologies explicitly requested by the target job.");
  recommendations.push("Start important bullets with strong action verbs and include outcomes or metrics when truthful.");
  recommendations.push("Keep formatting simple: standard headings, readable fonts, consistent dates, and no critical information inside graphics.");

  return {
    overallScore: Math.min(100, Math.max(0, overall)),
    keywordScore,
    sectionScore,
    skillScore,
    matchedKeywords: matched.slice(0, 40),
    missingKeywords: missing.slice(0, 40),
    detectedSkills: skillHits,
    sections: sections.map(([name, present]) => ({ name, present })),
    formattingRisks,
    recommendations
  };
}
