import { useState } from "react";
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
 * Picks which sections get a picture. The pictures are then made side by
 * side, each shown as a placeholder under its heading until it is ready.
 */
export function SectionImagesDialog({
  sections,
  onCreate,
  onClose,
}: {
  sections: MarkdownSection[];
  onCreate: (sections: MarkdownSection[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => suggested(sections));

  const toggle = (index: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={selected.size === 0}
            onClick={() => {
              onCreate(sections.filter((s) => selected.has(s.index)));
              onClose();
            }}
          >
            Create {selected.size}{" "}
            {selected.size === 1 ? "picture" : "pictures"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
