import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Textarea } from "@/client/components/ui/textarea";
import { META_MAX_CHARS, META_MIN_CHARS } from "@/shared/blog-quality";

/** The summary Google shows under the title; sent as the post excerpt. */
export function MetaDescriptionField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const length = value.trim().length;
  const outOfRange =
    length > 0 && (length < META_MIN_CHARS || length > META_MAX_CHARS);
  return (
    <Field>
      <FieldLabel htmlFor="article-meta">Meta description</FieldLabel>
      <Textarea
        id="article-meta"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={400}
        disabled={disabled}
        placeholder="The summary Google shows under the title in search results."
        className="min-h-20 text-sm"
      />
      <FieldDescription>
        <span className={outOfRange ? "text-destructive" : undefined}>
          {length} characters
        </span>
        , aim for {META_MIN_CHARS} to {META_MAX_CHARS} with the keyword. Sent to
        WordPress as the post excerpt.
      </FieldDescription>
    </Field>
  );
}
