import { describe, expect, it } from "vitest";
import { getAgentSetupPrompt } from "./agentSetupPrompt";

describe("agent setup prompt", () => {
  it("connects to the current instance and sends no one to upstream OpenSEO", () => {
    const prompt = getAgentSetupPrompt("https://seo.example.com");
    expect(prompt).toContain("https://seo.example.com/mcp");
    expect(prompt).toContain("https://seo.example.com/settings");
    expect(prompt).not.toMatch(/openseo\.so|github\.com|\{\{/);
  });
});
