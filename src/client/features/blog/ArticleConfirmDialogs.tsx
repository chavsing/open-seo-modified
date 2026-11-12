import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { BRAND_NAME } from "@/shared/brand";

/** The article editor's "are you sure" steps: publish, rewrite and delete. */
export function ArticleConfirmDialogs({
  confirm,
  isLive,
  pending,
  onPublish,
  onWrite,
  onDelete,
  onClose,
}: {
  confirm: "publish" | "delete" | "write" | null;
  isLive: boolean;
  pending: { send: boolean; write: boolean; remove: boolean };
  onPublish: () => void;
  onWrite: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (confirm === "publish")
    return (
      <ConfirmDialog
        title={isLive ? "Update the live post?" : "Publish this article?"}
        confirmLabel={isLive ? "Update live post" : "Publish now"}
        pending={pending.send}
        onConfirm={onPublish}
        onClose={onClose}
      >
        {isLive
          ? "The post on your WordPress site will be replaced with this version."
          : "It goes live on your WordPress site straight away, where visitors and Google can see it."}
      </ConfirmDialog>
    );
  if (confirm === "write")
    return (
      <ConfirmDialog
        title="Replace this article?"
        confirmLabel="Rewrite with AI"
        pending={pending.write}
        onConfirm={onWrite}
        onClose={onClose}
      >
        AI writes a new version from the research brief and replaces the title,
        meta description and text in the editor, including unsaved changes and
        the pictures in the text. The featured image stays. It uses your usage
        credits.
      </ConfirmDialog>
    );
  if (confirm === "delete")
    return (
      <ConfirmDialog
        title="Delete this article?"
        confirmLabel="Delete"
        destructive
        pending={pending.remove}
        onConfirm={onDelete}
        onClose={onClose}
      >
        It is removed from {BRAND_NAME}. Anything already sent to WordPress
        stays there. Its topic goes back to your topic ideas.
      </ConfirmDialog>
    );
  return null;
}
