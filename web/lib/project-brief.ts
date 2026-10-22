export interface BriefProject {
  id: string;
  title: string;
  tagline: string | null;
  description: string | null;
}

export interface ProjectBrief {
  summary: string;
  highlights: string[];
}

export interface DescriptionSection {
  title: string | null;
  text: string;
}

const headingNames = new Map([
  ["inspiration", "Inspiration"],
  ["what it does", "What it does"],
  ["how we built it", "How we built it"],
  ["challenges", "Challenges"],
  ["challenges we ran into", "Challenges"],
  ["accomplishments", "Accomplishments"],
  ["accomplishments that we're proud of", "Accomplishments"],
  ["what we learned", "What we learned"],
  ["what is next", "What's next"],
  ["what's next", "What's next"],
  ["what's next for", "What's next"],
]);

function normaliseHeading(value: string) {
  return value.toLowerCase().replace(/[’]/g, "'").replace(/^#+\s*/, "").replace(/[:.]$/, "").trim();
}

function sectionTitle(value: string) {
  const normalised = normaliseHeading(value);
  if (headingNames.has(normalised)) return headingNames.get(normalised) ?? null;
  return /^(what is next|what's next)\s+for\s+.+$/.test(normalised) ? "What's next" : null;
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[-•*]\s*/, "").trim();
}

function wordCount(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function shorten(value: string, maximumWords: number) {
  const text = clean(value);
  if (wordCount(text) <= maximumWords) return text;
  const words = text.split(/\s+/).filter(Boolean);
  let best = "";
  for (let index = 1; index <= maximumWords; index += 1) {
    if (/[,;:—–]$/.test(words[index - 1])) best = words.slice(0, index).join(" ").replace(/[,;:—–]$/, "");
  }
  // Do not turn a partial clause into a declarative claim. Callers skip it.
  return best ? `${best}…` : "";
}

function sentences(value: string) {
  return clean(value).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(clean).filter(Boolean);
}

function candidates(value: string, projectTitle: string) {
  const lines = value.split(/\r?\n/).map(clean).filter(Boolean);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (sectionTitle(line) || /^(it then|features?|how it works)\s*:?$/i.test(line)) continue;
    if (sameText(line, projectTitle)) {
      const next = lines[index + 1];
      if (next && !sectionTitle(next) && /^(is|are|was|were|does|uses|allows|helps|lets|turns|builds|provides|creates|generates|analy[sz]es|offers)\b/i.test(next)) {
        output.push(...sentences(`${line} ${next}`));
        index += 1;
      }
      continue;
    }
    output.push(...sentences(line));
  }
  return output;
}

function sameText(left: string, right: string) {
  return clean(left).toLowerCase().replace(/[^a-z0-9]/g, "") === clean(right).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits common Devpost prose into its authored sections without changing content. */
export function parseProjectDescription(description: string | null): DescriptionSection[] {
  if (!description?.trim()) return [];
  const sections: DescriptionSection[] = [];
  let title: string | null = null;
  let lines: string[] = [];
  const push = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ title, text });
    lines = [];
  };
  for (const line of description.replace(/\r\n/g, "\n").split("\n")) {
    const nextTitle = sectionTitle(line.trim());
    if (nextTitle) {
      push();
      title = nextTitle;
    } else {
      lines.push(line);
    }
  }
  push();
  return sections;
}

export function projectBriefSource(project: BriefProject) {
  return JSON.stringify({ id: project.id, title: project.title || "", tagline: project.tagline || "", description: project.description || "" });
}

/** Source passages eligible to support concise generated copy. */
export function projectBriefPassages(project: BriefProject): string[] {
  const sections = parseProjectDescription(project.description);
  const product = sections.find((section) => section.title === "What it does");
  const source = product ? [product] : sections.filter((section) => !section.title);
  const passages = source.flatMap((section) => section.text.split(/\n\s*\n/).flatMap((paragraph) => [paragraph, ...paragraph.split(/\r?\n/)]))
    .filter((passage) => passage.trim() && wordCount(passage) >= 4)
    .filter((passage) => !sameText(passage, project.title) && !sectionTitle(passage.trim()))
    .filter((passage, index, all) => all.indexOf(passage) === index);
  if (passages.length) return passages;
  return project.tagline && wordCount(project.tagline) >= 4 ? [project.tagline] : [];
}

/** A source-faithful, synchronous fallback for archived descriptions. */
export function createProjectBrief(project: BriefProject): ProjectBrief {
  const sections = parseProjectDescription(project.description);
  const product = sections.find((section) => section.title === "What it does");
  const context = sections.find((section) => !section.title || section.title === "Inspiration");
  const current = product?.text || context?.text || (sections.length ? "" : project.description || "");
  const source = candidates(current, project.title);
  const summaryIndex = source.findIndex((item) => wordCount(item) >= 3);
  const tagline = project.tagline && wordCount(project.tagline) >= 3 ? project.tagline : "";
  const missingDescription = "No public project description was captured.";
  const summarySource = source[summaryIndex] || tagline || missingDescription;
  const summary = shorten(summarySource, 32) || (product ? `${project.title} is a project with public notes in the archive.` : shorten(tagline, 32) || missingDescription);
  const highlights = source
    .filter((_, index) => index !== summaryIndex)
    .filter((item, index, all) => !sameText(item, summary) && all.findIndex((candidate) => sameText(candidate, item)) === index)
    .filter((item) => !/^(backend|frontend|integration|how we built)/i.test(item))
    .map((item) => shorten(item, 18))
    .filter((item) => item && wordCount(item) >= 3)
    .slice(0, 3);
  return { summary, highlights };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validates offline generated copy against the archived text before display. */
export function readGeneratedBrief(candidate: unknown, project: BriefProject): ProjectBrief | null {
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Record<string, unknown>;
  if (typeof value.summary !== "string" || !isStringArray(value.highlights) || !isStringArray(value.evidenceQuotes)) return null;
  const summary = clean(value.summary);
  const highlights = value.highlights.map(clean);
  const quotes = value.evidenceQuotes;
  if (!summary || wordCount(summary) > 32 || highlights.length > 3 || quotes.length !== highlights.length + 1) return null;
  if (highlights.some((item) => !item || wordCount(item) > 18) || [summary, ...highlights].some((item, index, all) => all.findIndex((candidate) => sameText(candidate, item)) !== index)) return null;
  const passages = projectBriefPassages(project);
  if (quotes.some((quote) => wordCount(quote) < 4 || sameText(quote, project.title) || sectionTitle(quote.trim()) || !passages.some((passage) => passage.includes(quote)))) return null;
  return { summary, highlights };
}
