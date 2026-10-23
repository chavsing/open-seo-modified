import installerSkill from "../../../../.agents/skills/setup-openseo/SKILL.md?raw";
import updatePrompt from "./agentUpdatePrompt.md?raw";
import { BRAND_NAME, SUPPORT_EMAIL, MARKETING_SITE_URL } from "@/shared/brand";

export const agentUpdatePrompt = updatePrompt
  .trim()
  .replaceAll("OpenSEO", BRAND_NAME)
  .replaceAll("support@openseo.so", SUPPORT_EMAIL)
  .replaceAll("https://openseo.so", MARKETING_SITE_URL);

// The copyable installer and internal skill share one source of truth.
export function getAgentSetupPrompt(origin: string) {
  const instructions = installerSkill
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .trim();
  return instructions.replaceAll("https://app.openseo.so", origin);
}
