// The code half of the blog generator's 10/10 gate: rules every article must
// meet before it can go live, checked deterministically so a model can't talk
// its way past them. Shared so the editor shows the same result the server
// enforces.

const MIN_ARTICLE_WORDS = 800;
const MAX_PARAGRAPH_WORDS = 150;
const TITLE_MIN_CHARS = 30;
const TITLE_MAX_CHARS = 65;

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
  keyword: string;
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
      id: "word_count",
      label: `At least ${MIN_ARTICLE_WORDS} words`,
      passed: bodyWords.length >= MIN_ARTICLE_WORDS,
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
