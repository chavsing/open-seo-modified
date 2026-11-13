import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import {
  listBlogCategories,
  saveBlogArticleFiling,
} from "@/serverFunctions/blog";

const NONE = "none";
const MAX_TAGS = 10;

type Category = { id: number; name: string };

/**
 * The WordPress category and tags the post goes in. AI writing makes a first
 * choice; each change here is saved straight away.
 */
export function ArticleFilingCard({
  projectId,
  articleId,
  category,
  tags,
  wordpressConnected,
  disabled,
  onSaved,
}: {
  projectId: string;
  articleId: string;
  category: Category | null;
  tags: string[];
  wordpressConnected: boolean;
  disabled: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [draftTag, setDraftTag] = useState("");
  const categories = useQuery({
    queryKey: ["blog", projectId, "wordpress-categories"],
    queryFn: () => listBlogCategories({ data: { projectId } }),
    enabled: wordpressConnected,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (next: { category: Category | null; tags: string[] }) =>
      saveBlogArticleFiling({ data: { projectId, articleId, ...next } }),
    onSuccess: onSaved,
    onError: (error) => toastBlogError(error),
  });
  const working = disabled || save.isPending;

  // The saved category stays listed even if WordPress no longer has it.
  const options = [
    ...(category && !categories.data?.some((item) => item.id === category.id)
      ? [category]
      : []),
    ...(categories.data ?? []),
  ];
  const items = [
    { value: NONE, label: "No category" },
    ...options.map((item) => ({ value: String(item.id), label: item.name })),
  ];
  const addTag = () => {
    const name = draftTag.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    setDraftTag("");
    if (!name || tags.some((tag) => tag.toLowerCase() === name.toLowerCase()))
      return;
    save.mutate({ category, tags: [...tags, name].slice(0, MAX_TAGS) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category and tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <Label>Category</Label>
          {wordpressConnected ? (
            <Select
              items={items}
              value={category ? String(category.id) : NONE}
              disabled={working || categories.isPending}
              onValueChange={(value) => {
                const next =
                  options.find((item) => String(item.id) === value) ?? null;
                save.mutate({ category: next, tags });
              }}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground">
              Connect WordPress to choose from your site&apos;s categories.
            </p>
          )}
          {categories.isError ? (
            <p className="text-xs text-destructive">
              Couldn&apos;t load your WordPress categories.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="article-tag">Tags</Label>
          {tags.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    disabled={working}
                    className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
                    onClick={() =>
                      save.mutate({
                        category,
                        tags: tags.filter((item) => item !== tag),
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Input
            id="article-tag"
            value={draftTag}
            disabled={working || tags.length >= MAX_TAGS}
            maxLength={60}
            placeholder="Add a tag and press Enter"
            onChange={(event) => setDraftTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              }
            }}
            onBlur={() => {
              if (draftTag.trim()) addTag();
            }}
          />
          <p className="text-xs text-muted-foreground">
            New tags are created on your site when the post is sent.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
