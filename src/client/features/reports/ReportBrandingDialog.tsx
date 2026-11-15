import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDialog } from "@/client/components/FormDialog";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  deleteReportBranding,
  getReportBranding,
  updateReportBranding,
} from "@/serverFunctions/reportBranding";
import { BRAND_NAME } from "@/shared/brand";
import { MAX_LOGO_DATA_URL_CHARS } from "@/types/schemas/report-branding";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The file as a data: URL, the only kind of image a report can show. */
async function readAsDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${file.type};base64,${btoa(binary)}`;
}

/**
 * The account's own name, website and logo on shared and printed reports, in
 * place of the app's (white label).
 */
export function ReportBrandingDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryKey = ["report-branding", projectId];
  const brandingQuery = useQuery({
    queryKey,
    queryFn: () => getReportBranding({ data: { projectId } }),
  });

  return (
    <FormDialog
      title="Your branding on reports"
      onClose={onClose}
      actions={null}
    >
      {brandingQuery.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : brandingQuery.isError ? (
        <p className="text-sm text-destructive">
          {getStandardErrorMessage(brandingQuery.error)}
        </p>
      ) : (
        <BrandingForm
          projectId={projectId}
          queryKey={queryKey}
          settings={brandingQuery.data}
          onClose={onClose}
        />
      )}
    </FormDialog>
  );
}

function BrandingForm({
  projectId,
  queryKey,
  settings,
  onClose,
}: {
  projectId: string;
  queryKey: string[];
  settings: Awaited<ReturnType<typeof getReportBranding>>;
  onClose: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const saved = settings.branding;
  const [companyName, setCompanyName] = useState(saved?.companyName ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(saved?.websiteUrl ?? "");
  const [logo, setLogo] = useState<string | null>(saved?.logoDataUrl ?? null);

  const onSaved = (next: typeof settings, message: string) => {
    queryClient.setQueryData(queryKey, next);
    toast.success(message);
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      updateReportBranding({
        data: {
          projectId,
          companyName: companyName.trim(),
          websiteUrl: websiteUrl.trim(),
          logoDataUrl: logo,
        },
      }),
    onSuccess: (next) => onSaved(next, "Report branding saved"),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => deleteReportBranding({ data: { projectId } }),
    onSuccess: (next) =>
      onSaved(next, `Reports show ${BRAND_NAME} branding again`),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type))
      return void toast.error("Use a PNG, JPEG or WebP logo.");
    const dataUrl = await readAsDataUrl(file);
    if (dataUrl.length > MAX_LOGO_DATA_URL_CHARS)
      return void toast.error("Use a logo under 100 KB.");
    setLogo(dataUrl);
  };

  if (!settings.allowed)
    return (
      <p className="text-sm text-muted-foreground">
        Your own name and logo on shared and printed reports is part of the paid
        plans.
      </p>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (companyName.trim()) save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Shared report links and printed reports show these instead of{" "}
        {BRAND_NAME}.
      </p>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Company name</FieldLabel>
        <Input
          id={`${id}-name`}
          value={companyName}
          maxLength={80}
          onChange={(event) => setCompanyName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-url`}>Website (optional)</FieldLabel>
        <Input
          id={`${id}-url`}
          value={websiteUrl}
          placeholder="https://youragency.com"
          onChange={(event) => setWebsiteUrl(event.target.value)}
        />
        <FieldDescription>
          Shared reports get a button to visit it.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-logo`}>Logo (optional)</FieldLabel>
        {logo ? (
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Your logo"
              className="h-10 max-w-40 rounded border bg-white object-contain p-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLogo(null)}
            >
              Remove logo
            </Button>
          </div>
        ) : (
          <Input
            id={`${id}-logo`}
            type="file"
            accept={LOGO_TYPES.join(",")}
            onChange={(event) => void pickLogo(event.target.files?.[0])}
          />
        )}
        <FieldDescription>PNG, JPEG or WebP, up to 100 KB.</FieldDescription>
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {saved ? (
          <Button
            type="button"
            variant="ghost"
            pending={remove.isPending}
            disabled={save.isPending}
            onClick={() => remove.mutate()}
          >
            Use {BRAND_NAME} branding
          </Button>
        ) : null}
        <Button
          type="submit"
          pending={save.isPending}
          disabled={!companyName.trim() || remove.isPending}
        >
          Save
        </Button>
      </div>
    </form>
  );
}
