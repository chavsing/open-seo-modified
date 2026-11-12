import { Button } from "@/client/components/ui/button";
import { SendHint } from "@/client/features/blog/SendHint";

/** Under the editor: save, send as a draft, publish, and why any is off. */
export function ArticleSendBar({
  projectId,
  dirty,
  canSave,
  saving,
  isLive,
  sending,
  canSend,
  canPublish,
  showConnect,
  showLocked,
  onSave,
  onDraft,
  onPublish,
}: {
  projectId: string;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  isLive: boolean;
  sending: "draft" | "publish" | null;
  canSend: boolean;
  canPublish: boolean;
  showConnect: boolean;
  showLocked: boolean;
  onSave: () => void;
  onDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          pending={saving}
          disabled={!canSave}
          onClick={onSave}
        >
          {dirty ? "Save changes" : "Saved"}
        </Button>
        {isLive ? (
          <Button
            pending={sending !== null}
            disabled={!canPublish}
            onClick={onPublish}
          >
            Update live post
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              pending={sending === "draft"}
              disabled={!canSend}
              onClick={onDraft}
            >
              Send to WordPress as draft
            </Button>
            <Button
              pending={sending === "publish"}
              disabled={!canPublish}
              onClick={onPublish}
            >
              Publish
            </Button>
          </>
        )}
      </div>
      <SendHint
        projectId={projectId}
        showConnect={showConnect}
        showLocked={showLocked}
      />
    </>
  );
}
