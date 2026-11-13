import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { setUpProjectFromWebsite } from "@/serverFunctions/projectContext";

/**
 * One click from a new project to a working Blog Generator: the Context page
 * drafted from the website, competitors found, and topic ideas researched.
 */
export function WebsiteSetupCard({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const setup = useMutation({
    mutationFn: () => setUpProjectFromWebsite({ data: { projectId } }),
    onSuccess: async (result) => {
      await Promise.all([
        onDone(),
        queryClient.invalidateQueries({ queryKey: ["blog", projectId] }),
      ]);
      const parts = [
        result.sectionsFilled
          ? `filled ${result.sectionsFilled} ${result.sectionsFilled === 1 ? "section" : "sections"}`
          : null,
        result.keyPages
          ? `added ${result.keyPages} key ${result.keyPages === 1 ? "page" : "pages"}`
          : null,
        result.competitors.length
          ? `found ${result.competitors.length} competitors (${result.competitors.join(", ")})`
          : null,
        result.topicIdeas
          ? `found ${result.topicIdeas} blog topic ideas`
          : null,
      ].filter(Boolean);
      toast.success(
        parts.length
          ? `Set up from your website: ${parts.join(", ")}. Check it reads right.`
          : "Everything was already filled in, so nothing changed.",
      );
    },
    onError: (error) =>
      toastBlogError(error, {
        VALIDATION_ERROR:
          "Couldn't read your website. Check the project's website address and that the site is online.",
        UPSTREAM_UNAVAILABLE:
          "The AI or search data isn't available right now. Please try again later.",
      }),
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Set up from your website</p>
        <p className="text-muted-foreground">
          Reads your site, fills in the empty sections and key pages, finds the
          businesses competing for your searches and researches blog topic
          ideas. Sections you wrote are left alone. Uses about $0.15 of credits and takes up to a minute.
        </p>
      </div>
      <Button
        variant="outline"
        pending={setup.isPending}
        onClick={() => setup.mutate()}
      >
        <Wand2 />
        {setup.isPending ? "Setting up..." : "Set up from my website"}
      </Button>
    </div>
  );
}
