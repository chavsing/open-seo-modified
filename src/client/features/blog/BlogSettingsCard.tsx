import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
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
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/client/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Skeleton } from "@/client/components/ui/skeleton";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  connectWordpress,
  disconnectWordpress,
  getBlogSettings,
  testWordpress,
  updateBlogSettings,
} from "@/serverFunctions/blog";
import { POSTS_PER_WEEK_OPTIONS } from "@/types/schemas/blog";
import { blogKeys } from "./blogQueries";

const frequencyItems = POSTS_PER_WEEK_OPTIONS.map((value) => ({
  value: String(value),
  label:
    value === 0
      ? "Off (write only when I ask)"
      : value === 7
        ? "Every day"
        : `${value} per week`,
}));

const onError = (error: unknown) => toast.error(getStandardErrorMessage(error));

export function BlogSettingsCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const settingsQuery = useQuery({
    queryKey: blogKeys.settings(projectId),
    queryFn: () => getBlogSettings({ data: { projectId } }),
  });

  const update = useMutation({
    mutationFn: (values: {
      publishMode?: "draft" | "auto";
      postsPerWeek?: number;
    }) => updateBlogSettings({ data: { projectId, ...values } }),
    onSuccess: (settings) => {
      queryClient.setQueryData(blogKeys.settings(projectId), settings);
      toast.success("Blog settings saved");
    },
    onError,
  });

  if (settingsQuery.isPending) return <Skeleton className="h-72 w-full" />;
  if (settingsQuery.isError)
    return (
      <QueryError
        cause={settingsQuery.error}
        fallback="Couldn't load the blog settings. Please try again."
        onRetry={() => void settingsQuery.refetch()}
        isRetrying={settingsQuery.isFetching}
      />
    );
  const settings = settingsQuery.data;
  // Show the value being saved, so the control doesn't jump back mid-request.
  const publishMode = update.isPending
    ? (update.variables.publishMode ?? settings.publishMode)
    : settings.publishMode;
  const postsPerWeek = update.isPending
    ? (update.variables.postsPerWeek ?? settings.postsPerWeek)
    : settings.postsPerWeek;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Publishing</CardTitle>
          <CardDescription>
            What happens when an article is finished and passes the quality
            check.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={publishMode}
            onValueChange={(value) => {
              if (value === "draft") update.mutate({ publishMode: "draft" });
              if (value === "auto") update.mutate({ publishMode: "auto" });
            }}
            disabled={update.isPending}
            className="gap-3"
          >
            <Field orientation="horizontal" className="items-start">
              <RadioGroupItem
                value="draft"
                id={`${id}-draft`}
                className="mt-0.5"
              />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-draft`}>
                  Drafts only (recommended to start)
                </FieldLabel>
                <FieldDescription>
                  Articles go to WordPress as drafts. You read them and click
                  Publish yourself. Nothing goes live without you.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="items-start">
              <RadioGroupItem
                value="auto"
                id={`${id}-auto`}
                className="mt-0.5"
              />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-auto`}>Auto-publish</FieldLabel>
                <FieldDescription>
                  Articles that pass every quality check go live on their own.
                  Any article that fails is kept as a draft for you to review.
                </FieldDescription>
              </FieldContent>
            </Field>
          </RadioGroup>

          <Field className="max-w-xs">
            <FieldLabel htmlFor={`${id}-frequency`}>
              How often to write
            </FieldLabel>
            <Select
              items={frequencyItems}
              value={String(postsPerWeek)}
              onValueChange={(value) => {
                if (value !== null)
                  update.mutate({ postsPerWeek: Number(value) });
              }}
              disabled={update.isPending}
            >
              <SelectTrigger id={`${id}-frequency`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Automatic writing starts once AI writing is switched on for your
              account. Until then you can create briefs and write articles
              yourself.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <WordpressCard projectId={projectId} connection={settings.wordpress} />
    </div>
  );
}

function WordpressCard({
  projectId,
  connection,
}: {
  projectId: string;
  connection: { url: string; username: string } | null;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: blogKeys.settings(projectId) });

  const connect = useMutation({
    mutationFn: () =>
      connectWordpress({ data: { projectId, url, username, password } }),
    onSuccess: async (result) => {
      // WordPress refusing the login is an answer, not a crash: show why.
      if (!result.ok) return void toast.error(result.message);
      setPassword("");
      await refresh();
      toast.success(`Connected to WordPress as ${result.name}`);
    },
    onError,
  });
  const test = useMutation({
    mutationFn: () => testWordpress({ data: { projectId } }),
    onSuccess: (result) =>
      result.ok
        ? toast.success(
            `WordPress connection works (signed in as ${result.name})`,
          )
        : toast.error(result.message),
    onError,
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectWordpress({ data: { projectId } }),
    onSuccess: refresh,
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>WordPress site</CardTitle>
        <CardDescription>
          Where articles are sent. The password is stored encrypted and is only
          used to create and update posts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connection ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0">
                Connected to{" "}
                <SafeExternalLink
                  url={connection.url}
                  label={connection.url}
                  className="inline-flex items-center gap-1 font-medium break-all underline-offset-2 hover:underline"
                />{" "}
                as <span className="font-medium">{connection.username}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                pending={test.isPending}
                onClick={() => test.mutate()}
              >
                Test connection
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              connect.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor={`${id}-url`}>Site address</FieldLabel>
              <Input
                id={`${id}-url`}
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                autoComplete="url"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-user`}>
                  WordPress username
                </FieldLabel>
                <Input
                  id={`${id}-user`}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-password`}>
                  Application password
                </FieldLabel>
                <Input
                  id={`${id}-password`}
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <FieldDescription>
              Create one in WordPress under Users, Profile, Application
              Passwords. It is not your normal login password, and you can
              revoke it there at any time.
            </FieldDescription>
            <Button
              type="submit"
              pending={connect.isPending}
              disabled={!url.trim() || !username.trim() || !password.trim()}
            >
              Connect WordPress
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
