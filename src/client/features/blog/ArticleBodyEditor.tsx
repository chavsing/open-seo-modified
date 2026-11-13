import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import {
  addPicturePlaceholder,
  ArticleImage,
  fillPicturePlaceholder,
  ImageActionsContext,
  type ImageActions,
} from "@/client/features/blog/articleEditorImages";

// The article body as a visual editor. The article is still stored as
// Markdown, which the quality checks, the AI and WordPress all work from: the
// editor reads and writes Markdown at its edges.

export type ArticleEditorApi = {
  /** The editor's own Markdown formatting of `markdown`. */
  normalize: (markdown: string) => string;
  /** A placeholder under the section's heading, until its picture is ready. */
  addPlaceholder: (sectionIndex: number) => string | null;
  fillPlaceholder: (
    id: string,
    image: { url: string; alt: string } | null,
  ) => void;
};

function ToolbarButton({
  label,
  active = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function setLink(editor: Editor) {
  const href: unknown = editor.getAttributes("link").href;
  const current = typeof href === "string" ? href : undefined;
  const next = window.prompt("Link address (leave empty to remove)", current);
  if (next === null) return;
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!next.trim()) chain.unsetLink().run();
  else chain.setLink({ href: next.trim() }).run();
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = (command: (chain: ReturnType<Editor["chain"]>) => void) => () =>
    command(editor.chain().focus());
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      <ToolbarButton
        label="Paragraph"
        active={state.paragraph}
        disabled={disabled}
        onClick={run((c) => c.setParagraph().run())}
      >
        <Pilcrow />
      </ToolbarButton>
      <ToolbarButton
        label="Section heading"
        active={state.h2}
        disabled={disabled}
        onClick={run((c) => c.toggleHeading({ level: 2 }).run())}
      >
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton
        label="Sub-heading"
        active={state.h3}
        disabled={disabled}
        onClick={run((c) => c.toggleHeading({ level: 3 }).run())}
      >
        <Heading3 />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bold"
        active={state.bold}
        disabled={disabled}
        onClick={run((c) => c.toggleBold().run())}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.italic}
        disabled={disabled}
        onClick={run((c) => c.toggleItalic().run())}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={state.strike}
        disabled={disabled}
        onClick={run((c) => c.toggleStrike().run())}
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        active={state.link}
        disabled={disabled}
        onClick={() => setLink(editor)}
      >
        <Link2 />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bulleted list"
        active={state.bullet}
        disabled={disabled}
        onClick={run((c) => c.toggleBulletList().run())}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.ordered}
        disabled={disabled}
        onClick={run((c) => c.toggleOrderedList().run())}
      >
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={state.quote}
        disabled={disabled}
        onClick={run((c) => c.toggleBlockquote().run())}
      >
        <Quote />
      </ToolbarButton>
      <ToolbarButton
        label="Clear formatting"
        disabled={disabled}
        onClick={run((c) => c.unsetAllMarks().clearNodes().run())}
      >
        <RemoveFormatting />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Undo"
        disabled={disabled || !state.canUndo}
        onClick={run((c) => c.undo().run())}
      >
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={disabled || !state.canRedo}
        onClick={run((c) => c.redo().run())}
      >
        <Redo2 />
      </ToolbarButton>
    </div>
  );
}

/**
 * `value` is Markdown. Typing reports the editor's Markdown through
 * `onChange`; a new `value` from outside (AI writing) replaces the text.
 * `onReady` hands over the editor's own Markdown formatting, so the page can
 * tell a real change from a formatting difference, and its picture
 * placeholders. `header` shows above the text, as the post's featured image.
 */
export function ArticleBodyEditor({
  value,
  onChange,
  disabled,
  onReady,
  header,
  imageActions,
}: {
  value: string;
  onChange: (markdown: string) => void;
  disabled: boolean;
  onReady: (api: ArticleEditorApi) => void;
  header?: ReactNode;
  imageActions: ImageActions;
}) {
  const lastValue = useRef(value);
  const editor = useEditor({
    // Rendered in the browser only; the server has no document to edit.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        underline: false,
        link: { openOnClick: false, autolink: true },
      }),
      ArticleImage,
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": "Article text",
        class: "tiptap px-4 py-3 text-sm",
      },
    },
    onCreate: ({ editor: created }) => {
      const manager = created.markdown;
      if (manager)
        onReady({
          normalize: (markdown) => manager.serialize(manager.parse(markdown)),
          addPlaceholder: (index) => addPicturePlaceholder(created, index),
          fillPlaceholder: (id, image) =>
            fillPicturePlaceholder(created, id, image),
        });
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = updated.getMarkdown();
      lastValue.current = markdown;
      onChange(markdown);
    },
  });

  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    // After this render: the pictures' React views can't render inside it.
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
    });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className="article-editor rounded-md border bg-background">
      {editor ? <Toolbar editor={editor} disabled={disabled} /> : null}
      {header}
      <ImageActionsContext.Provider value={imageActions}>
        <EditorContent editor={editor} />
      </ImageActionsContext.Provider>
    </div>
  );
}
