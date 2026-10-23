import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { PageHeader } from "@/client/components/PageHeader";
import { ShieldAlert } from "lucide-react";
import { getAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import { getAgentSetupPrompt } from "@/client/features/ai-mcp/agentSetupPrompt";
import { CopyButton } from "@/client/components/CopyButton";
import { AgentList } from "@/client/features/ai-mcp/AgentList";
import { BRAND_NAME } from "@/shared/brand";

// Self-hosting guide from the upstream open-source project. Only self-hosted
// deployments behind Cloudflare Access ever show it.
const CLOUDFLARE_ACCESS_GUIDE_URL =
  "https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access";

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

function AiPage() {
  const origin = window.location.origin;
  const mcpUrl = `${origin}/mcp`;
  const prompt = getAgentSetupPrompt(origin);

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Agent setup"
          description={`The most powerful way to use ${BRAND_NAME} is through the AI agent you already use. Set it up once, then ask it anything.`}
        />

        <div className="mt-8 space-y-5">
          <Card size="lg">
            <CardHeader>
              <CardTitle>
                <h2>Set up your agent</h2>
              </CardTitle>
              <CardDescription>
                Paste the setup prompt into your agent to connect {BRAND_NAME}.
                It will guide you through any manual steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentList />
              <div className="mt-5">
                <CopyButton
                  variant="default"
                  size="lg"
                  value={prompt}
                  label="Copy setup prompt"
                  successMessage="Setup prompt copied"
                  onCopy={() => captureClientEvent("mcp:setup_prompt_copy")}
                />
              </div>
            </CardContent>
            <CardFooter className="text-muted-foreground">
              <p>
                Once connected, ask your agent to use {BRAND_NAME} to find your
                website&rsquo;s biggest SEO issues.
              </p>
            </CardFooter>
          </Card>
        </div>

        {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
          <Alert variant="warning" className="mt-8">
            <ShieldAlert />
            <AlertDescription>
              This instance is behind Cloudflare Access. MCP clients cannot
              connect until Managed OAuth is enabled on your Access application.{" "}
              <a
                href={CLOUDFLARE_ACCESS_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium"
              >
                Setup guide
              </a>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>
            MCP server URL for this instance:{" "}
            <code className="font-mono text-foreground/80">{mcpUrl}</code>
          </span>
          <CopyButton
            value={mcpUrl}
            successMessage="MCP URL copied"
            onCopy={() => captureClientEvent("mcp:setup_url_copy")}
          />
        </div>
      </div>
    </div>
  );
}
