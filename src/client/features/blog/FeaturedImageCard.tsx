import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import {
  createBlogImage,
  removeBlogImage,
  setBlogReferenceImage,
} from "@/serverFunctions/blog";
import { MAX_REFERENCE_IMAGE_BYTES } from "@/shared/blog-images";

type ImageView = { id: string; url: string; alt: string };

export const IMAGE_ERRORS = {
  UPSTREAM_UNAVAILABLE:
    "Couldn't create the picture right now. Please try again in a minute.",
  NOT_FOUND: "This article no longer exists.",
} as const;

const REFERENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ReferenceType = (typeof REFERENCE_TYPES)[number];
const isReferenceType = (type: string): type is ReferenceType =>
  (REFERENCE_TYPES as readonly string[]).includes(type);

async function readBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * The post's header picture, made by AI from the title or a description, and
 * an optional style example that every picture of the article follows.
 */
export function FeaturedImageCard({
  projectId,
  articleId,
  featuredImage,
  referenceImage,
  busy,
  onChanged,
}: {
  projectId: string;
  articleId: string;
  featuredImage: ImageView | null;
  referenceImage: ImageView | null;
  busy: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [description, setDescription] = useState("");
  const generate = useMutation({
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
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!isReferenceType(file.type))
        throw new Error("Use a JPEG, PNG or WebP picture.");
      if (file.size > MAX_REFERENCE_IMAGE_BYTES)
        throw new Error("Use a picture under 4 MB.");
      return setBlogReferenceImage({
        data: {
          projectId,
          articleId,
          mediaType: file.type,
          base64: await readBase64(file),
        },
      });
    },
    onSuccess: onChanged,
    onError: (error) =>
      error instanceof Error && error.message.startsWith("Use ")
        ? toast.error(error.message)
        : toastBlogError(error, IMAGE_ERRORS),
  });
  const working =
    busy || generate.isPending || remove.isPending || upload.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Featured image</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {featuredImage ? (
          <div className="space-y-2">
            <img
              src={featuredImage.url}
              alt={featuredImage.alt}
              className="aspect-video w-full rounded-md border object-cover"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={working}
              onClick={() => remove.mutate(featuredImage.id)}
            >
              <Trash2 />
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">
            The picture at the top of the post and in link previews. Sent to
            WordPress as the post&apos;s featured image.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="featured-description">Describe it (optional)</Label>
          <Textarea
            id="featured-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            disabled={working}
            placeholder="Leave empty to create one from the title."
            className="min-h-16 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Style example (optional)</Label>
          {referenceImage ? (
            <div className="flex items-center gap-2">
              <img
                src={referenceImage.url}
                alt="Style example"
                className="h-14 w-20 rounded border object-cover"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={working}
                onClick={() => remove.mutate(referenceImage.id)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-muted-foreground hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-50">
              <Upload className="size-4" />
              {upload.isPending ? "Uploading..." : "Upload a picture to match"}
              <input
                type="file"
                accept={REFERENCE_TYPES.join(",")}
                className="sr-only"
                disabled={working}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) upload.mutate(file);
                }}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Every picture of this article follows its colours and mood.
          </p>
        </div>
        <Button
          className="w-full"
          variant="outline"
          pending={generate.isPending}
          disabled={working}
          onClick={() => generate.mutate()}
        >
          <ImagePlus />
          {generate.isPending
            ? "Creating, about 15 seconds"
            : featuredImage
              ? "Create a new featured image"
              : "Create featured image"}
        </Button>
        <p className="text-xs text-muted-foreground">
          About $0.04 of credits per picture.
        </p>
      </CardContent>
    </Card>
  );
}
