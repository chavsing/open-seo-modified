# AGS MASTER remaining tasks

Last updated: 2026-11-10. Tick a box when a task is done and move it to the
done list at the bottom with the date.

## In progress

- [ ] **Microsoft sign-in.** The client creates his free Azure account
  (needs a card for identity only). Then register the AGS MASTER app, save the
  client ID and secret to `.env.saas`, redeploy, and test "Continue with
  Microsoft" live with a personal Outlook account and a work account.

## Jamil

- [ ] Sign in to the live app and check the Blog Generator and the "AI agent
  coming soon" page.
- [ ] Get the OpenRouter AI key. It unlocks the AI agent, AI writing in the
  Blog Generator and automatic setup for new websites.
- [ ] Provide a test WordPress site on https with an application password.
- [ ] Decide whether to build automatic setup for new websites (see below).

## Claude, waiting on the OpenRouter key

- [ ] Test "Write with AI" for real: write two or three articles, check
  quality and the cost per article, and tune the instructions if needed.
- [ ] AI quality reviewer on top of the 11 rule checks.
- [ ] Automatic schedule: write and send posts at the per-site "posts per
  week" setting (saved but not acting yet).
- [ ] Automatic setup for new websites, if approved: find competitors, find
  blog topics and start tracking keywords when a site is added, and show the
  results on the dashboard instead of the manual "Get started" checklist.
  The first site audit already starts by itself. About 10 to 20 cents per
  new site.

## Claude, waiting on a decision

- [ ] Final WordPress publishing check against a real hosted site, after the
  test site is provided.

## Waiting on the client

- [ ] Legal page details: business name, country and refund policy. Then fill
  in and publish the Privacy and Terms pages.

## Done

- 2026-11-08: Blog Generator (topics, briefs, quality check, WordPress
  publishing, Drafts only / Auto-publish setting) deployed and live.
- 2026-11-08: "AI agent coming soon" notice deployed and live.
- 2026-11-09: Blog Generator and AI notice committed and pushed.
- 2026-11-09: "Write with AI" button built (writes from the brief, checks the
  11 rules, revises once). Waits for the OpenRouter key to work.
- 2026-11-09: Blog Generator errors now say what went wrong (wrong WordPress
  password, not https, no competitors, AI not available) instead of a generic
  message.
- 2026-11-09: Checked the 404s in the local app's browser console. They come
  from a developer tool that only runs locally, so customers never see them.
  Nothing to fix.
- 2026-11-10: AI writer button and clearer error messages committed,
  pushed and deployed. Confirmed the live site serves the new editor.
- 2026-11-09: Checked automatic first audit: it already runs when a website
  is added to a project.

## Dropped

- 2026-11-09: Social media posting (Facebook via Blotato or Zernio). The
  client only needs blog posting, which the WordPress publishing covers.
