import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { PicturePlaceholder } from "@/client/features/blog/articleEditorImages";

/**
 * The featured image where most WordPress themes show it: above the article
 * text. It isn't part of the text; WordPress gets it as the featured image.
 */
export function FeaturedImageBlock({
  image,
  generating,
  disabled,
  onGenerate,
  onRemove,
}: {
  image: { id: string; url: string; alt: string } | null;
  generating: boolean;
  disabled: boolean;
  onGenerate: () => void;
  onRemove: (imageId: string) => void;
}) {
  return (
    <div className="border-b px-4 py-3">
      {generating ? (
        <PicturePlaceholder label="Creating the featured image, about 15 seconds" />
      ) : image ? (
        <div className="group relative">
          <img
            src={image.url}
            alt={image.alt}
            className="aspect-video w-full rounded-md object-cover"
          />
          <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-xs font-medium">
            Featured image
          </span>
          <div className="absolute top-2 right-2 flex gap-1 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={onGenerate}
            >
              <RefreshCw />
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onRemove(image.id)}
            >
              <Trash2 />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onGenerate}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          Add a featured image, about $0.04 of credits
        </button>
      )}
    </div>
  );
}
