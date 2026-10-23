import connectPrompt from "./agentConnectPrompt.md?raw";
import { BRAND_NAME } from "@/shared/brand";

const SERVER_NAME = BRAND_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// The copyable prompt that connects an AI agent to this instance's MCP server.
export function getAgentSetupPrompt(origin: string) {
  return connectPrompt
    .trim()
    .replaceAll("{{BRAND}}", BRAND_NAME)
    .replaceAll("{{SERVER_NAME}}", SERVER_NAME)
    .replaceAll("{{ORIGIN}}", origin);
}
