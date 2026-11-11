// The code half of the blog generator's 10/10 gate: rules every article must
// meet before it can go live, checked deterministically so a model can't talk
// its way past them. Shared so the editor shows the same result the server
// enforces.

const MIN_ARTICLE_WORDS = 800;
const MAX_PARAGRAPH_WORDS = 150;
const TITLE_MIN_CHARS = 30;
const TITLE_MAX_CHARS = 65;
export const META_MIN_CHARS = 120;
export const META_MAX_CHARS = 160;
// More than this share of the words being the keyword reads as stuffing.
const MAX_KEYWORD_DENSITY = 0.03;
const MIN_RELATED_SEARCHES = 2;

// Leftover template text or model chatter that must never be published.
const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\[(?:todo|tbd|insert|your|add|placeholder)[^\]]*\]/i,
  /\{\{[^}]*\}\}/,
  /\bTODO\b/,
  /as an ai(?: language model)?/i,
  /i hope this helps/i,
  /i cannot (?:browse|access)/i,
];

// Phrases and marks that make text read as AI-written. Each entry's example
// is what the writer is told to avoid; the pattern is what the check catches.
const AI_TELLS: { example: string; pattern: RegExp }[] = [
  { example: "em dashes (—)", pattern: /—/ },
  { example: "delve", pattern: /\bdelv(?:e|es|ed|ing)\b/i },
  {
    example: "in today's fast-paced world",
    pattern:
      /\bin today['’]s (?:fast-paced|digital|modern|busy|ever-changing) world\b/i,
  },
  {
    example: "it's not just X, it's Y",
    pattern:
      /\b(?:it|this)(?:['’]s| is) not just\b[^.!?]{1,60}\b(?:it|this)(?:['’]s| is)\b/i,
  },
  { example: "in conclusion", pattern: /\bin conclusion\b/i },
  {
    example: "unlock the power/potential",
    pattern:
      /\bunlock(?:s|ing)? (?:the|your) (?:full )?(?:power|potential|secrets?)\b/i,
  },
  {
    example: "harness the power",
    pattern: /\bharness(?:es|ing)? the power\b/i,
  },
  { example: "game-changer", pattern: /\bgame[- ]changers?\b/i },
  { example: "ever-evolving", pattern: /\bever[- ]evolving\b/i },
  {
    example: "navigate the landscape",
    pattern: /\bnavigat(?:e|es|ing) the (?:complex|ever|world|landscape)/i,
  },
  { example: "a testament to", pattern: /\ba testament to\b/i },
  { example: "embark on", pattern: /\bembark(?:s|ing)? on\b/i },
  { example: "tapestry", pattern: /\btapestry\b/i },
  { example: "look no further", pattern: /\blook no further\b/i },
  {
    example: "dive into / let's dive in",
    pattern: /\b(?:dive|diving) (?:deep |deeper )?in(?:to)?\b/i,
  },
  { example: "in the realm of", pattern: /\bin the realm of\b/i },
  {
    example: "it's important to note",
    pattern: /\bit(?:['’]s| is) (?:important|worth) (?:to note|noting)\b/i,
  },
  { example: "seamless", pattern: /\bseamless(?:ly)?\b/i },
  { example: "elevate your", pattern: /\belevat(?:e|es|ing) your\b/i },
  { example: "leverage", pattern: /\bleverag(?:e|es|ed|ing)\b/i },
];

/** What the writer is told never to use, from the same list the check uses. */
export const AI_TELL_EXAMPLES = AI_TELLS.map((tell) => tell.example);

/**
 * Facts the research brief records for the writer: the target length
 * measured from what ranks now, and Google's related searches. The brief is
 * text this app generates, so the lines are read back by their labels.
 */
export function briefFacts(brief: string): {
  targetWords: number | null;
  relatedSearches: string[];
} {
  const target = /\*\*Target length:\*\* about ([\d,]+) words/.exec(brief);
  const section = /(?:^|\n)## Related searches\n([\s\S]*?)(?=\n## |$)/.exec(
    brief,
  );
  const relatedSearches = (section?.[1] ?? "")
    .split("\n")
    .map((line) => /^- (.+)$/.exec(line.trim())?.[1]?.trim())
    .filter((line): line is string => Boolean(line) && line !== "None shown")
    // "near me" and "near [place]" are map searches: forcing them into an
    // article reads as filler, so they don't count.
    .filter((line) => !/\bnear\b/i.test(line));
  return {
    targetWords: target ? Number(target[1].replace(/,/g, "")) : null,
    relatedSearches,
  };
}

/** The word range an article should land in, around what ranks now. */
export function lengthRange(targetWords: number | null) {
  if (!targetWords) return { min: MIN_ARTICLE_WORDS, max: null };
  return {
    min: Math.max(MIN_ARTICLE_WORDS, Math.round(targetWords * 0.8)),
    max: Math.round(targetWords * 1.5),
  };
}

/** How often the exact keyword phrase appears in the text. */
function phraseCount(text: string, phrase: string): number {
  // Hyphens become spaces on both sides, as plainText does to the article.
  const tokens = (value: string) =>
    words(value.toLowerCase().replace(/-/g, " ")).join(" ");
  const haystack = ` ${tokens(text)} `;
  const needle = tokens(normalizeKeyword(phrase));
  if (!needle) return 0;
  return haystack.split(` ${needle} `).length - 1;
}

type ArticleCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

type ArticleQuality = {
  checks: ArticleCheck[];
  passed: number;
  total: number;
  /** Out of 10, one decimal. 10 means every check passed. */
  score: number;
};

export function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

/** Markdown reduced to its readable words: no link targets, images or code. */
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`|~-]/g, " ");
}

/** Every word of the keyword appears, in any order, ignoring case. */
function containsKeyword(text: string, keyword: string): boolean {
  const haystack = new Set(words(text.toLowerCase()));
  const needles = words(normalizeKeyword(keyword));
  return needles.length > 0 && needles.every((word) => haystack.has(word));
}

function linkHosts(markdown: string): string[] {
  const hosts: string[] = [];
  for (const match of markdown.matchAll(/\]\((https?:\/\/[^)\s]+)/g)) {
    try {
      hosts.push(new URL(match[1]).hostname.replace(/^www\./, ""));
    } catch {
      // A malformed link target counts as no link.
    }
  }
  return hosts;
}

export function checkArticle(input: {
  title: string;
  content: string;
  /** The search-result summary sent to WordPress as the post excerpt. */
  metaDescription: string;
  keyword: string;
  /** The research brief, for the target length and related searches. */
  brief: string;
  /** The project's own domain, for the internal link rule. */
  domain: string | null;
  /** Titles of the project's other articles, for the duplicate rule. */
  otherTitles: string[];
}): ArticleQuality {
  const { title, content, keyword } = input;
  const bodyWords = words(plainText(content));
  const headings2 = [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !/^(#|[-*+]\s|\d+\.\s|>|\||```)/.test(block));
  const longestParagraph = Math.max(
    0,
    ...paragraphs.map((block) => words(plainText(block)).length),
  );
  const intro = bodyWords.slice(0, 100).join(" ");
  const domain = input.domain?.replace(/^www\./, "").toLowerCase() ?? null;
  const hosts = linkHosts(content);
  const placeholder = PLACEHOLDER_PATTERNS.map((pattern) =>
    pattern.exec(`${title}\n${content}`),
  ).find(Boolean);
  const normalizedTitle = normalizeKeyword(title);
  const facts = briefFacts(input.brief);
  const range = lengthRange(facts.targetWords);
  const plain = plainText(content);
  const aiTell = AI_TELLS.find((tell) =>
    tell.pattern.test(`${title}
${content}`),
  );
  const keywordWords = words(normalizeKeyword(keyword)).length;
  const density = bodyWords.length
    ? (phraseCount(plain, keyword) * keywordWords) / bodyWords.length
    : 0;
  const relatedUsed = facts.relatedSearches.filter(
    (search) => phraseCount(plain, search) > 0,
  );
  const relatedNeeded = Math.min(
    MIN_RELATED_SEARCHES,
    facts.relatedSearches.length,
  );
  const meta = input.metaDescription.trim();

  const checks: ArticleCheck[] = [
    {
      id: "title_length",
      label: `Title is ${TITLE_MIN_CHARS} to ${TITLE_MAX_CHARS} characters`,
      passed:
        title.trim().length >= TITLE_MIN_CHARS &&
        title.trim().length <= TITLE_MAX_CHARS,
      detail: `${title.trim().length} characters`,
    },
    {
      id: "title_keyword",
      label: "Title contains the keyword",
      passed: containsKeyword(title, keyword),
    },
    {
      id: "meta_description",
      label: `Meta description is ${META_MIN_CHARS} to ${META_MAX_CHARS} characters and contains the keyword`,
      passed:
        meta.length >= META_MIN_CHARS &&
        meta.length <= META_MAX_CHARS &&
        containsKeyword(meta, keyword),
      detail: `${meta.length} characters`,
    },
    {
      id: "word_count",
      label: range.max
        ? `${range.min} to ${range.max} words, in line with what ranks now`
        : `At least ${range.min} words`,
      passed:
        bodyWords.length >= range.min &&
        (range.max === null || bodyWords.length <= range.max),
      detail: `${bodyWords.length} words`,
    },
    {
      id: "intro_keyword",
      label: "Keyword appears in the first 100 words",
      passed: containsKeyword(intro, keyword),
    },
    {
      id: "headings",
      label: "At least 3 section headings (##)",
      passed: headings2.length >= 3,
      detail: `${headings2.length} found`,
    },
    {
      id: "heading_keyword",
      label: "Keyword appears in a section heading",
      passed: headings2.some((heading) => containsKeyword(heading, keyword)),
    },
    {
      id: "no_h1",
      label: "No extra H1 in the body (the title is the H1)",
      passed: !/^#\s/m.test(content),
    },
    {
      id: "internal_link",
      label: "Links to at least one page on your site",
      passed:
        domain !== null &&
        hosts.some((host) => host === domain || host.endsWith(`.${domain}`)),
    },
    {
      id: "paragraph_length",
      label: `No paragraph longer than ${MAX_PARAGRAPH_WORDS} words`,
      passed: longestParagraph <= MAX_PARAGRAPH_WORDS,
      detail: `Longest is ${longestParagraph} words`,
    },
    {
      id: "related_searches",
      label: `Uses at least ${relatedNeeded} of the related searches from the brief`,
      passed: relatedUsed.length >= relatedNeeded,
      detail: facts.relatedSearches.length
        ? `${relatedUsed.length} used`
        : "None in the brief",
    },
    {
      id: "keyword_density",
      label: `Keyword isn't overused (at most ${MAX_KEYWORD_DENSITY * 100}% of the words)`,
      passed: density <= MAX_KEYWORD_DENSITY,
      detail: `${(density * 100).toFixed(1)}%`,
    },
    {
      id: "human_voice",
      label: "Reads like a person wrote it, with no typical AI phrases",
      passed: !aiTell,
      detail: aiTell ? `Found ${aiTell.example}` : undefined,
    },
    {
      id: "no_placeholders",
      label: "No placeholder or AI filler text",
      passed: !placeholder,
      detail: placeholder ? `Found "${placeholder[0]}"` : undefined,
    },
    {
      id: "unique_title",
      label: "Title is not used by another article",
      passed: !input.otherTitles.some(
        (other) => normalizeKeyword(other) === normalizedTitle,
      ),
    },
  ];
  const passed = checks.filter((check) => check.passed).length;
  return {
    checks,
    passed,
    total: checks.length,
    score: Math.round((passed / checks.length) * 100) / 10,
  };
}
