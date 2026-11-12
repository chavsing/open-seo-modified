import { Image } from "@tiptap/extension-image";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { RefreshCw, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/client/components/ui/button";

// Pictures inside the article text: each has its own Regenerate and Remove
// buttons, and a picture being made shows as a placeholder under its
// section's heading until it is ready.

type NewImage = { url: string; alt: string };

export type ImageActions = {
  disabled: boolean;
  /** A new picture for a section, or null when it couldn't be made. */
  regenerate: (section: {
    heading: string;
    context: string;
  }) => Promise<NewImage | null>;
};

export const ImageActionsContext = createContext<ImageActions | null>(null);

const isSectionHeading = (node: ProseMirrorNode) =>
  node.type.name === "heading" && node.attrs.level === 2;

/** The heading and text of the section around `pos`, for its picture. */
function sectionAround(doc: ProseMirrorNode, pos: number) {
  let heading = "";
  let text: string[] = [];
  let ended = false;
  doc.forEach((node, offset) => {
    if (ended) return;
    if (isSectionHeading(node)) {
      if (offset > pos) ended = true;
      else {
        heading = node.textContent;
        text = [];
      }
    } else if (node.textContent) text.push(node.textContent);
  });
  return { heading, context: text.join("\n").slice(0, 2000) };
}

/** A filled skeleton the size of a picture, shown while one is being made. */
export function PicturePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex aspect-video w-full animate-pulse items-center justify-center rounded-md bg-foreground/10 text-xs text-muted-foreground">
      {label}
    </div>
  );
}

function ArticleImageView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const actions = useContext(ImageActionsContext);
  const [working, setWorking] = useState(false);
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";

  const regenerate = async () => {
    const pos = getPos();
    if (!actions || pos === undefined) return;
    const section = sectionAround(editor.state.doc, pos);
    setWorking(true);
    const image = await actions.regenerate({
      heading: section.heading || alt || "Introduction",
      context: section.context,
    });
    setWorking(false);
    // The picture may have been deleted while the new one was made.
    if (image && !editor.isDestroyed && getPos() !== undefined)
      updateAttributes({ src: image.url, alt: image.alt || alt });
  };

  return (
    <NodeViewWrapper className="group relative" data-drag-handle="">
      {working ? (
        <PicturePlaceholder label="Creating a new picture, about 15 seconds" />
      ) : (
        <img
          src={src}
          alt={alt}
          className={selected ? "ProseMirror-selectednode" : undefined}
        />
      )}
      {actions ? (
        <div
          contentEditable={false}
          className="absolute top-2 right-2 flex gap-1 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            pending={working}
            disabled={actions.disabled || working}
            onClick={() => void regenerate()}
          >
            <RefreshCw />
            Regenerate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={actions.disabled || working}
            onClick={deleteNode}
          >
            <Trash2 />
            Remove
          </Button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

const placeholderKey = new PluginKey<DecorationSet>("picturePlaceholders");
type PlaceholderMeta =
  | { add: { id: string; pos: number } }
  | { remove: string };
const isPlaceholderMeta = (value: unknown): value is PlaceholderMeta =>
  typeof value === "object" && value !== null;
const hasId = (id: string) => (spec: { id?: unknown }) => spec.id === id;

function placeholderWidget() {
  const element = document.createElement("div");
  element.className =
    "my-3 flex aspect-video w-full animate-pulse items-center justify-center rounded-md bg-foreground/10 text-xs text-muted-foreground";
  element.contentEditable = "false";
  element.textContent = "Creating picture, about 15 seconds";
  return element;
}

/** Placeholders sit between blocks and move with the text being edited. */
function placeholderPlugin() {
  return new Plugin<DecorationSet>({
    key: placeholderKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        let next = set.map(tr.mapping, tr.doc);
        const value: unknown = tr.getMeta(placeholderKey);
        const meta = isPlaceholderMeta(value) ? value : undefined;
        if (meta && "add" in meta)
          next = next.add(tr.doc, [
            Decoration.widget(meta.add.pos, placeholderWidget, {
              id: meta.add.id,
              key: meta.add.id,
            }),
          ]);
        if (meta && "remove" in meta)
          next = next.remove(
            next.find(undefined, undefined, hasId(meta.remove)),
          );
        return next;
      },
    },
    props: { decorations: (state) => placeholderKey.getState(state) },
  });
}

export const ArticleImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageView);
  },
  addProseMirrorPlugins() {
    return [placeholderPlugin()];
  },
});

/** Shows a placeholder under the section's heading; null if it's gone. */
export function addPicturePlaceholder(editor: Editor, sectionIndex: number) {
  let seen = -1;
  let pos: number | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (pos === null && isSectionHeading(node) && ++seen === sectionIndex)
      pos = offset + node.nodeSize;
  });
  if (pos === null) return null;
  const id = crypto.randomUUID();
  editor.view.dispatch(
    editor.state.tr.setMeta(placeholderKey, { add: { id, pos } }),
  );
  return id;
}

/** Swaps the placeholder for the picture, or just removes it. */
export function fillPicturePlaceholder(
  editor: Editor,
  id: string,
  image: NewImage | null,
) {
  if (editor.isDestroyed) return;
  const found = placeholderKey
    .getState(editor.state)
    ?.find(undefined, undefined, hasId(id))[0];
  if (!found) return;
  const tr = editor.state.tr.setMeta(placeholderKey, { remove: id });
  if (image)
    tr.insert(
      found.from,
      editor.schema.nodes.image.create({ src: image.url, alt: image.alt }),
    );
  editor.view.dispatch(tr);
}
