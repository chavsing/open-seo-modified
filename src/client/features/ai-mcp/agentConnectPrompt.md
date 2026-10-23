Connect {{BRAND}} to this AI agent. Do what you can; guide me through anything that needs my input.

{{BRAND}} is an SEO tool. Its remote MCP server is at `{{ORIGIN}}/mcp` and signs in with OAuth.

## 1. Check this agent

- Identify this agent and its version. Ask only if you cannot tell.
- Check whether {{BRAND}} is already connected. Keep other integrations and do not add a duplicate.

## 2. If this is ChatGPT

If I pasted this into a regular ChatGPT conversation (web or desktop app, not Codex), you cannot connect {{BRAND}} from here. Don't run commands or edit files. Instead, give me these steps and stop:

1. On chatgpt.com, open **Settings → Security and login** and turn on **Developer mode**. This works on Free and paid plans; no upgrade is needed.
2. Open **Settings → Plugins → Developer mode** (or **Plugins → + → Create MCP App**). Name it {{BRAND}}, enter the server URL `{{ORIGIN}}/mcp` in full, including `https://` (otherwise ChatGPT reports "Unsafe URL"), and keep **OAuth** selected.
3. Create it, sign in to {{BRAND}}, and approve the connection.
4. Start a new chat, select {{BRAND}} from the **+** menu, and send: "Use {{BRAND}} to check my connection and list my projects."

If I'm in Codex, continue below.

## 3. Add the MCP server

- **Claude Cowork or the Claude desktop app:** you cannot add connectors from this chat, so don't run commands. Tell me to open **Customize → Connectors** → **Add custom connector**, enter `{{ORIGIN}}/mcp`, and sign in. Then continue at step 5.
- **Other agents:** add `{{ORIGIN}}/mcp` as a remote (HTTP) MCP server named `{{SERVER_NAME}}`, the way this agent adds one. Check the installed client's help or current documentation before running commands.
- {{BRAND}} works through its MCP tools alone. Do not install plugins or skills from other sources for it.

## 4. Sign in

- Prefer OAuth and let me approve the login in my browser.
- If this client cannot use OAuth, send me to `{{ORIGIN}}/settings` → API keys. Have me enter the key in the client's secret settings or environment, never in chat or a repository.

## 5. Reload and verify

- Use this agent's native reload flow, checking its installed version, help, or official documentation. Prefer automatic discovery or an in-place reload; restart only if required to load the new tools.
- Once tools load in this session, run whoami and list_projects (free reads). If a reload needs my action, give the instructions rather than repeatedly retrying unavailable tools.
- Track connection, sign-in, and verification separately. A connected server is not proof that this session can use its tools. Never claim verification before the free reads succeed.
- Do not create projects or run paid research during setup.

## 6. Finish with a short handoff

Keep progress updates brief. The final reply must be **120 words or fewer** and follow this template:

**Status**
[Briefly say what succeeded or what blocked setup.]

**Next**

1. `[Give the native reload command or UI action for this agent, only if needed.]` Then say "Check that {{BRAND}} is connected." Approve sign-in if prompted.
2. Try asking:
   - "Use {{BRAND}} to find my website's biggest SEO issues." **(recommended)**
   - "Use {{BRAND}} to find keywords worth targeting for [topic]."
   - "Use {{BRAND}} to compare my site with [competitor]."

Adapt the template to the actual result: if setup failed, name the blocker and replace reload with the fix; if fully verified, say it is ready and omit reload. Keep tool names such as whoami and list_projects in your checks, not the final reply. Omit versions, paths, and connection details unless they explain the blocker or I ask.
