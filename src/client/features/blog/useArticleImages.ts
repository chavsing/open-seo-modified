import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ArticleEditorApi } from "@/client/features/blog/ArticleBodyEditor";
import type { ImageActions } from "@/client/features/blog/articleEditorImages";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { createBlogImage, removeBlogImage } from "@/serverFunctions/blog";
import type { MarkdownSection } from "@/shared/blog-images";

export const IMAGE_ERRORS = {
  UPSTREAM_UNAVAILABLE:
    "Couldn't create the picture right now. Please try again in a minute.",
  NOT_FOUND: "This article no longer exists.",
} as const;

/**
 * The article's AI pictures: the featured image, section pictures made side
 * by side with a placeholder each, and a new picture for one already in the
 * text. Pictures in the text are saved with it by autosave.
 */
export function useArticleImages({
  projectId,
  articleId,
  editor,
  disabled,
  onChanged,
}: {
  projectId: string;
  articleId: string;
  editor: ArticleEditorApi | null;
  disabled: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [description, setDescription] = useState("");
  const [sectionsPending, setSectionsPending] = useState(0);
  const [regenerating, setRegenerating] = useState(0);

  const featured = useMutation({
    mutationFn: () =>
      createBlogImage({
        data: {
          projectId,
          articleId,
          kind: "featured",
          customPrompt: description.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Featured image created");
    },
    onError: (error) => toastBlogError(error, IMAGE_ERRORS),
  });
  const remove = useMutation({
    mutationFn: (imageId: string) =>
      removeBlogImage({ data: { projectId, articleId, imageId } }),
    onSuccess: onChanged,
    onError: (error) => toastBlogError(error, IMAGE_ERRORS),
  });

  const createSection = (heading: string, context: string) =>
    createBlogImage({
      data: {
        projectId,
        articleId,
        kind: "section",
        heading: heading.slice(0, 300),
        context: context.slice(0, 2000),
      },
    });

  const addSectionPictures = async (sections: MarkdownSection[]) => {
    if (!editor) return;
    const jobs = sections.flatMap((section) => {
      const id = editor.addPlaceholder(section.index);
      return id ? [{ section, id }] : [];
    });
    setSectionsPending((n) => n + jobs.length);
    const results = await Promise.all(
      jobs.map(async ({ section, id }) => {
        try {
          const image = await createSection(section.heading, section.body);
          editor.fillPlaceholder(id, image);
          return null;
        } catch (error) {
          editor.fillPlaceholder(id, null);
          return error;
        } finally {
          setSectionsPending((n) => n - 1);
        }
      }),
    );
    const failure = results.find((result) => result !== null);
    if (failure) toastBlogError(failure, IMAGE_ERRORS);
    const added = results.filter((result) => result === null).length;
    if (added)
      toast.success(`Added ${added} ${added === 1 ? "picture" : "pictures"}`);
  };

  const imageActions: ImageActions = {
    disabled,
    regenerate: async ({ heading, context }) => {
      setRegenerating((n) => n + 1);
      try {
        return await createSection(heading, context);
      } catch (error) {
        toastBlogError(error, IMAGE_ERRORS);
        return null;
      } finally {
        setRegenerating((n) => n - 1);
      }
    },
  };

  return {
    description,
    setDescription,
    featured,
    remove,
    addSectionPictures,
    sectionsPending,
    imageActions,
    /** A picture is being made; leaving now would lose it. */
    working: featured.isPending || sectionsPending > 0 || regenerating > 0,
  };
}
