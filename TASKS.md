# AGS MASTER remaining tasks

Last updated: 2026-11-12. Tick a box when a task is done and move it to the
done list at the bottom with the date.

## In progress

- None.

## Jamil

- [ ] Google verification for Google Analytics access (started 2026-11-11,
      the reason text is already entered). Still to do: record the demo
      video, upload it to YouTube as unlisted, paste the link in Google Cloud
      console under Data Access, and submit. Needs a Google account with a
      Google Analytics property that has data. Until it is approved, people
      connecting Google Analytics see Google's "unverified app" warning and
      the app is capped at 100 users for that permission. Search Console does
      not need it.
- [ ] Renew the Microsoft sign-in secret before 2028-11-10, or Microsoft
      sign-in stops working.
- [ ] Keep the OpenRouter balance topped up (about $14 left on 2026-11-11);
      consider auto top-up.
- [ ] After the live tests: disconnect the test WordPress (the Cloudflare
      tunnel address) in the Default project's Blog Generator Settings, or set
      "How often to write" to Off, so the run due 2026-11-19 doesn't fail.

## Claude, next

- [ ] Audit leftovers (found 2026-11-12, not fixed yet): closing the tab
  during "Write with AI" stops the run after about 30 seconds, unbilled and
  unsaved, and an automatic run that hits Cloudflare's time limit is unbilled.
  Both need AI writing moved into a background job; propose a plan first.
  Also: a renewal recorded in the 3 grace days restarts the month from
  today, and two "Write with AI" clicks on a small balance can go below zero.
- [ ] "New article" button: type a keyword, get a brief, no topic search
      needed.
- [ ] Automatic setup for new websites (approved 2026-11-11): find
      competitors, find blog topics, start tracking keywords and fill in the
      Context page (business overview, positioning) from the site scan when a
      site is added. Show the results on the dashboard instead of the manual
      "Get started" checklist. About 10 to 20 cents per new site. Filling in
      Context matters because the blog writer now uses it to make articles
      specific to the business.

## Claude, waiting on a decision

- [ ] Blog Generator tools for customers' own AI apps (Claude, ChatGPT, Grok
      through Agent setup). Today the 76 MCP tools cover everything except
      the Blog Generator. Adding them is a new MCP tool, so it needs a plugin
      version bump.

## Later, if the client wants company customers

- [ ] Microsoft publisher verification, to remove the "unverified" label.
      Needs the client's Microsoft AI Cloud Partner Program sign-up, a business
      email on agsmaster.com and a domain proof file on the site. Without it,
      some companies block their staff from signing in with Microsoft.

## Waiting on the client

- Nothing outstanding. If the client later registers a business name, swap
  it into both legal pages in place of "Bryan Dave Sumait, doing business as
  AGS MASTER" and redeploy the landing site.

## Done

- 2026-11-13: Blog editor follow-ups (client feedback). Autosave about 1.5
  seconds after an edit, with "All changes saved" top right instead of a
  Save button, and a leave warning while a picture is being made. The
  featured image shows above the article text. Every picture has Regenerate
  and Remove on hover. Section pictures are made side by side, with a
  loading placeholder under each heading. Formatting (bold, links, headings,
  lists) no longer clears the AI review score; changed words still do.
  Picture prompts now ask for plain, unbranded packaging (a test picture
  had painted the brand's logo on a coffee bag). Auto-publish now keeps any
  article that isn't finished (a failed check, a score under 9 or a missing
  picture) in the Blog Generator instead of sending a WordPress draft.
  Pictures go to WordPress as image figures that fit the theme's column
  (they overflowed on Twenty Twenty-Five) and carry their media id, so
  WordPress serves smaller sizes to phones. Tested locally; not deployed yet.
- 2026-11-13: Blog images (client request, like the MadeEA editor). The
  article editor is now a visual editor (headings, bold, lists, links,
  pictures) that still saves Markdown. Featured image card: create from the
  title or a description, optional style example. "Add section pictures"
  picks sections (3 longest ticked) and adds pictures one at a time with a
  Stop button. Sending uploads pictures to the WordPress media library and
  sets the featured image. Automatic articles get a featured image plus 2
  section pictures. Model: GPT Image 2.6 Flare via OpenRouter, Nano Banana
  2.1 as fallback, about $0.04 of credits per picture. Tested locally with
  real pictures; the WordPress upload is not tested yet.
- 2026-11-12: Cloudflare: "Always Use HTTPS" on (http now redirects to
  https on agsmaster.com, www and app) and HSTS on (6 months, subdomains,
  no preload) plus the no-sniff header. Checked live on all three.
- 2026-11-12: Audit fixes. Invite-only sign-up now only accepts team
  invitations from paying accounts. Autopilot checks the WordPress login
  before any paid work. /admin can't put Pro over Lifetime, or a Pro month
  over a running year. A slow WordPress site no longer gets a duplicate post
  on retry. The crawler name is one word (AGSMASTER-Audit). A trailing space
  in a title no longer locks Publish. Lapsed Pro plans lose their unused
  monthly credits after the grace days (bought extras stay). Scheduled rank
  tracking stays paused (upstream marked it unreliable); the in-app notice
  and Sam now say so plainly instead of promising it.
- 2026-11-12: New publishing rule (approved by Jamil for the client): an
  article goes live only when every code check passes, the AI editor marks
  nothing as must-fix, and it scores at least 9/10. The editor now lists
  "must fix" and "could be better" separately. Google's related searches
  became a suggestion instead of a hard check (14 code checks), because
  forcing them in read as filler. Two real AI test articles scored 9/10
  with nothing must-fix on the first draft.
- 2026-11-12: Live automatic posting test passed. On the Default project
  (bluebottlecoffee.com, competitor stumptowncoffee.com) the schedule picked
  "coffee roasters", wrote it, the AI editor gave 7/10, and it arrived in a
  local WordPress (through a Cloudflare tunnel) as a draft, as designed.
- 2026-11-12: Blog writer stricter: 15 checks instead of 11. New: no typical
  AI phrases or em dashes, at least two of the brief's related searches
  (ignoring "near me" style searches), the keyword at most 3% of the words,
  length in line with what ranks now, and a 120 to 160 character meta
  description sent to WordPress as the excerpt (confirmed in WordPress).
- 2026-11-12: Blog writer uses the project's Context page (business overview,
  positioning, writing preferences, key pages) so articles are specific to
  the business.
- 2026-11-12: Agent setup page: "Set up your Grok bot here" button linking to
  the client's Grok bot.
- 2026-11-12: Plan buttons read "Pay for a year here" and "Pay once here".
  The Pro plan keeps PayPal's own button so payments match accounts.
- 2026-11-12: Live AI app connection (MCP) tested: sign-in, 76 tools, account
  and project list read.
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
- 2026-11-11: AI reviewer and automatic posting built and tested on this
  computer. Every article is scored out of 10 by an AI editor and revised
  up to 3 times; publishing (by hand or automatic) needs all 11 checks and
  10/10. The schedule picks a topic (skipping other brands' names and
  repeats), researches, writes, reviews, then publishes at 10/10 on
  Auto-publish or sends a draft. Three automatic test runs scored 8, 9
  and 9, cost 1.6 to 2.5 cents each and took about 2 minutes.
- 2026-11-11: "Write with AI" tested with the real AI key: two articles,
  about 25 seconds and about 1,200 words each, 10/10 on the rule checks,
  3 credits ($0.003) each. One read well, one was generic in places.
- 2026-11-11: AI key added to the live app; the built-in AI chat answers.
- 2026-11-10: Privacy Policy and Terms of Service written and live at
  agsmaster.com/privacy and agsmaster.com/terms. Philippines law, the
  30-day money-back guarantee the app already shows, and the Blog
  Generator and AI features covered. Run by Bryan Dave Sumait, doing
  business as AGS MASTER.
- 2026-11-10: Azure sign-in screen branded: logo, home page, Terms and
  Privacy links.
- 2026-11-10: Microsoft sign-in live. App registered in the client's Azure,
  deployed, and tested with a personal Microsoft account: permission screen
  on first sign-in, straight in after that. Work account not tested.
- 2026-11-09: Checked automatic first audit: it already runs when a website
  is added to a project.

## Dropped

- 2026-11-09: Social media posting (Facebook via Blotato or Zernio). The
  client only needs blog posting, which the WordPress publishing covers.
