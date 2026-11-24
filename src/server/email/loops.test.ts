import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { sendHostedInvitationEmail } from "@/server/email/loops";

vi.mock("cloudflare:workers", () => ({
  env: { LOOPS_API_KEY: "key", LOOPS_TRANSACTIONAL_NOTICE_ID: "notice" },
}));

afterEach(() => vi.unstubAllGlobals());

describe("sendHostedInvitationEmail", () => {
  it("sends the invite as a notice when there is no invitation template", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendHostedInvitationEmail({
      email: "teammate@example.com",
      inviteUrl: "https://app.example.com/accept-invitation/abc",
      organizationName: "Acme",
      inviterName: "Sam",
      inviterEmail: "sam@example.com",
    });

    const body: unknown = JSON.parse(
      z.string().parse(fetchMock.mock.calls[0]?.[1]?.body),
    );
    expect(body).toMatchObject({
      transactionalId: "notice",
      email: "teammate@example.com",
      dataVariables: {
        linkUrl: "https://app.example.com/accept-invitation/abc",
      },
    });
  });
});
