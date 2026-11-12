import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { IMAGE_ERRORS } from "@/client/features/blog/FeaturedImageCard";
import { createBlogImage } from "@/serverFunctions/blog";
import type { MarkdownSection } from "@/shared/blog-images";

// A post reads well with a few pictures, not one per section: the longest
// sections without one start ticked, and short ones read fine without.
const SUGGEST_MIN_WORDS = 40;
const SUGGEST_COUNT = 3;

function suggested(sections: MarkdownSection[]) {
  const candidates = sections.filter(
    (s) => !s.hasImage && s.words >= SUGGEST_MIN_WORDS,
  );
  candidates.sort((a, b) => b.words - a.words);
  return new Set(candidates.slice(0, SUGGEST_COUNT).map((s) => s.index));
}

/**
 * Picks which sections get a picture, then makes them one at a time so the
 * person can stop part way. Each picture lands under its section's heading as
 * soon as it is ready; the article still needs saving afterwards.
 */
export function SectionImagesDialog({
  projectId,
  articleId,
  sections,
  onInsert,
  onClose,
}: {
  projectId: string;
  articleId: string;
  sections: MarkdownSection[];
  onInsert: (sectionIndex: number, image: { alt: string; url: string }) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => suggested(sections));
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  const running = progress !== null;

  const toggle = (index: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });

  const run = async () => {
    const chosen = sections.filter((s) => selected.has(s.index));
    stop.current = false;
    setProgress({ done: 0, total: chosen.length });
    let added = 0;
    for (const [i, section] of chosen.entries()) {
      if (stop.current) break;
      try {
        const image = await createBlogImage({
          data: {
            projectId,
            articleId,
            kind: "section",
            heading: section.heading,
            context: section.body.slice(0, 2000),
          },
        });
        onInsert(section.index, image);
        added += 1;
      } catch (error) {
        toastBlogError(error, IMAGE_ERRORS);
        break;
      }
      setProgress({ done: i + 1, total: chosen.length });
    }
    if (added)
      toast.success(
        `Added ${added} ${added === 1 ? "picture" : "pictures"}. Save the article to keep them.`,
      );
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !running) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add pictures to sections</DialogTitle>
          <DialogDescription>
            Each picture goes under its section&apos;s heading and uses about
            $0.04 of credits. The longest sections without one are ticked.
          </DialogDescription>
        </DialogHeader>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add section headings to the article first.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-auto">
            {sections.map((section) => (
              <li key={section.index}>
                <label className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(section.index)}
                    disabled={running}
                    onCheckedChange={(on) => toggle(section.index, on)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{section.heading}</span>
                    <span className="text-xs text-muted-foreground">
                      {section.words} words
                      {section.hasImage ? ", already has a picture" : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          {running ? (
            <>
              <span className="mr-auto self-center text-sm text-muted-foreground">
                Creating {Math.min(progress.done + 1, progress.total)} of{" "}
                {progress.total}...
              </span>
              <Button
                variant="outline"
                disabled={stopping}
                onClick={() => {
                  stop.current = true;
                  setStopping(true);
                }}
              >
                {stopping ? "Stopping after this one" : "Stop"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={selected.size === 0} onClick={() => void run()}>
                Create {selected.size}{" "}
                {selected.size === 1 ? "picture" : "pictures"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
