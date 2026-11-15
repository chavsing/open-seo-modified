import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getAuditSchedule, saveAuditSchedule } from "@/serverFunctions/audit";
import {
  DEFAULT_AUDIT_PAGES,
  MIN_AUDIT_PAGES,
  PAID_MAX_AUDIT_PAGES,
} from "@/shared/audit-limits";

type Interval = "weekly" | "monthly" | "off";

const INTERVAL_ITEMS: { value: Interval; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/** A repeating audit for the project; its email says what changed. */
export function AuditScheduleCard({
  projectId,
  initialUrl,
  isFreePlan,
}: {
  projectId: string;
  initialUrl: string;
  isFreePlan: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["audit", projectId, "schedule"];
  const scheduleQuery = useQuery({
    queryKey,
    queryFn: () => getAuditSchedule({ data: { projectId } }),
  });
  const schedule = scheduleQuery.data ?? null;

  // Edits start from the saved schedule, or the audit form's address.
  const [draft, setDraft] = useState<{
    interval?: Interval;
    url?: string;
    pages?: string;
  }>({});
  const interval = draft.interval ?? schedule?.interval ?? "off";
  const url = draft.url ?? schedule?.startUrl ?? initialUrl;
  const pages =
    draft.pages ?? String(schedule?.maxPages ?? DEFAULT_AUDIT_PAGES);
  const pageCount = Math.min(
    PAID_MAX_AUDIT_PAGES,
    Math.max(
      MIN_AUDIT_PAGES,
      Number.parseInt(pages, 10) || DEFAULT_AUDIT_PAGES,
    ),
  );
  const id = useId();

  const save = useMutation({
    mutationFn: () =>
      saveAuditSchedule({
        data: {
          projectId,
          startUrl: url.trim(),
          interval,
          maxPages: pageCount,
        },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setDraft({});
      toast.success(
        saved ? "Audit schedule saved" : "Audit schedule turned off",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const changed =
    interval !== (schedule?.interval ?? "off") ||
    (interval !== "off" &&
      (url.trim() !== (schedule?.startUrl ?? "") ||
        pageCount !== schedule?.maxPages));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repeat this audit</CardTitle>
        <CardDescription>
          {isFreePlan
            ? "Scheduled audits are part of the paid plans. You can still run audits by hand."
            : "Runs the audit on a schedule and emails you what changed since the last one: new issues and fixed ones."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim() || interval === "off") save.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${id}-interval`}>How often</FieldLabel>
            <Select
              items={INTERVAL_ITEMS}
              value={interval}
              disabled={isFreePlan || scheduleQuery.isPending}
              onValueChange={(value) => {
                if (value)
                  setDraft((current) => ({ ...current, interval: value }));
              }}
            >
              <SelectTrigger id={`${id}-interval`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-url`}>Start page</FieldLabel>
            <Input
              id={`${id}-url`}
              value={url}
              placeholder="https://example.com"
              disabled={isFreePlan || interval === "off"}
              onChange={(event) =>
                setDraft((current) => ({ ...current, url: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-pages`}>Pages</FieldLabel>
            <Input
              id={`${id}-pages`}
              inputMode="numeric"
              value={pages}
              disabled={isFreePlan || interval === "off"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  pages: event.target.value,
                }))
              }
            />
          </Field>
          <Button
            type="submit"
            pending={save.isPending}
            disabled={isFreePlan || !changed}
          >
            Save
          </Button>
        </form>
        {schedule ? (
          <FieldDescription className="mt-3">
            Next audit{" "}
            {new Date(schedule.nextRunAt).toLocaleString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            .{schedule.lastError ? ` ${schedule.lastError}` : ""}
          </FieldDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}
