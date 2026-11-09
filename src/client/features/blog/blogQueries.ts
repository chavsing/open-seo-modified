export const blogKeys = {
  settings: (projectId: string) => ["blog", projectId, "settings"] as const,
  topics: (projectId: string) => ["blog", projectId, "topics"] as const,
  articles: (projectId: string) => ["blog", projectId, "articles"] as const,
  article: (projectId: string, articleId: string) =>
    ["blog", projectId, "article", articleId] as const,
};
