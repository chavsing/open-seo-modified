# AGS MASTER remaining tasks

Last updated: 2026-11-25. Tick a box when a task is done and move it to the
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
- [ ] Optional, for Bryan: create a proper "team invitation" email in Loops
      and add its id as LOOPS_TRANSACTIONAL_INVITATION_ID. Until then invites
      go out through the general notice email, which works but is plainer.
- [ ] Tell Claude as soon as the first real customer pays through PayPal.
      Bryan chose (2026-11-24) not to make a test payment, so that payment is
      the first real proof that plans switch on by themselves. Until then the
      webhook has only been tested with PayPal's API stubbed and by checking
      that the live address rejects unsigned requests.

## Claude, next

- [ ] Check the first real PayPal payment in the live records the day it
      happens (plan switched on, applied once, email sent).
- [ ] Not proven live yet: the Shopify-specific setup message and reading a
      store with saved Shopify crawler access. Shopify only blocked some
      stores some of the time during the journey, and no store signature was
      available to test with. Check on the first Shopify customer whose
      setup fails.

## Claude, waiting on a decision

- None.

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

- 2026-11-25: Google Search Console connection proven on live: the Pro test
  account connected Bryan's agsmaster.com property and real data showed (4
  impressions, average position 7.3). No "unverified app" warning, as
  expected for Search Console. The Pro test account was then erased from the
  live database (user, organization, project, Search Console connection,
  credits and history); a recount found nothing left and the real account is
  untouched. AGS MASTER is still allowed in Bryan's Google account
  permissions; Jamil chose to leave that for now.
- 2026-11-25: Pro features run on the live app for the first time, with a
  throwaway Pro account (switched on from the admin page, no payment): the
  $50 monthly credits landed, automatic setup tracked 8 searches and started
  the first rank check (13 of 16 positions; DataForSEO had no answer for 3
  even after retries, and the run says which), prompt tracking researched 3
  topics with 15 prompts and finished its first run, and a weekly scheduled
  audit was picked up by the scheduler and completed. Fixed on the way: a
  customer who left the page within a few seconds of adding a website lost
  that site's first audit and automatic setup for good, because the request
  was cancelled before they started. They now keep running after the page is
  closed, and saving a website or creating a project replies sooner. No real
  customer had hit it.
- 2026-11-25: The team invite email arrived on live and its button opened
  the invitation page. Accepting an invite was not tested. The journey test
  account was then erased from the live database (user, organization, 5
  projects, article, report, invite, credits and allow-list entry); the
  shared report link now returns 404 and the real account is untouched.
- 2026-11-25: Full customer journey on the live app with a throwaway
  account (no payment): sign-up and onboarding, every page loads, automatic
  site setup, keyword research, rank tracking, an AI article (9/10 review),
  view-only teammate invite, Billing with PayPal buttons, a report saved from
  an AI app and shared by public link, and the out-of-credits stop. Fixed on
  the way: team invite emails failed on live (no invitation email template
  in Loops), so they now use the notice email; the dashboard said "Your site
  is set up" when setup had failed, now "Setup didn't finish" with how to
  retry; site setup now uses a store's saved Shopify crawler access and says
  when Shopify is the reason it couldn't read the site.

- 2026-11-24: Safety net for PayPal's webhook. Every 15 minutes the app asks
  PayPal directly about monthly Pro subscriptions it is waiting on (first
  payment not yet applied, or a paid month ending within a day or in its
  grace days) and switches the plan on for any completed charge the webhook
  missed. A charge both report is counted once, even under different PayPal
  IDs. Only subscriptions started from the account's own Subscribe button
  count. Checked that the client's PayPal app is allowed to read
  subscription charges. Matching old payment-link payments by email was
  left out on purpose: those links are only a backup inside the app, and a
  wrong match would give a plan to the wrong account.
- 2026-11-19: Blog Generator tools for customers' own AI apps (ChatGPT,
  Claude and others through Agent setup): list topic ideas and articles,
  read an article, start one from a topic or any keyword, write it with AI
  in the background, and send it to WordPress (a draft unless the user asks
  to publish, with the app's publishing quality gates). 82 tools now. Plugin
  version 1.0.22. Checked over the real protocol on the development copy.
- 2026-11-19: One-click PDF reports declined (would need a paid Cloudflare
  add-on). PDFs stay on the browser's print window, with the customer's logo.
- 2026-11-19: Automatic setup for new websites. Adding a site (new project,
  or a new website on an existing one) now sets it up in the background:
  the Context page is filled in from the website, competitors are found,
  blog topic ideas are researched and up to 8 searches customers use are
  tracked weekly in Rank Tracking. The dashboard shows a "Setting up your
  site" card, then what was done with links, in place of the Get started
  checklist. Runs once per site, only with credits, and not for sites added
  by AI agents. A real run on the development copy cost $0.19.
- 2026-11-18: Audit leftovers fixed. A Pro month or year renewed in its 3
  grace days now counts from the old end date, so a late PayPal charge no
  longer moves the customer's billing date. Starting an AI article now sets
  aside $0.05 of credits until it finishes, so several articles started on a
  small balance can't push it below zero (the customer is told they're out
  of credits instead). Each AI call in article writing is charged as soon as
  it finishes, so a run Cloudflare stops at its time limit is still billed
  for the work it did.
- 2026-11-18: Automatic PayPal activation. Pro Yearly, Lifetime and the
  credit pack ($50 of credits for $65) now use PayPal checkout buttons in the
  app: the server sets the price and account, and the plan or credits turn on
  the moment the payment completes. A PayPal webhook (registered on Bryan's
  live PayPal app next to his GoHighLevel one) turns each monthly Pro charge
  into another paid month. Payments it can't tie to an account (old payment
  links, a subscription started outside the app, or a wrong amount) wait
  under "PayPal payments to check" on /admin. Other PayPal sales on the same
  account are ignored.
- 2026-11-17: View-only team seats. Inviting a teammate now asks for Full
  access (Admin) or View only, and the team menu switches an existing
  teammate between the two. A view-only teammate sees the dashboard, rank
  tracking, saved keywords, site audits, prompt tracking, GSC insights,
  blog articles and reports, but every change, research tool, the AI chat
  and AI app connections are refused on the server with a clear message.
  New actions are refused for them by default. Gap review priority 2 is
  complete.
- 2026-11-16: Gap review decisions from Bryan: no free trial (free plan with
  $1 of credits stays), rank tracking limited to the cheapest option,
  Drafts only as the WordPress default (already the default). Automatic
  rank checks are back on for paid plans, weekly or monthly only (no
  daily), after porting the original OpenSEO's reliability fixes; they are
  paid from the customer's credits. Owners get one email when keywords on
  Google's first two pages drop 5 or more places. Blog Generator: start an
  article from your own keyword, and articles now link to the customer's
  earlier published articles, with made-up links to their site removed.
  Brand Lookup stays out of the menu: Prompt Research replaced it.
  Later the same day: a Blog Generator Calendar tab (sent articles and when
  the next automatic ones are due), writing up to 5 topic ideas at once, a
  Keyword Gap page under Research (a competitor's keywords your site doesn't
  rank for, with Write about it), and two AI chatbot questions in the
  landing page FAQ. All deployed. Also: site audits can repeat weekly or
  monthly (paid plans, Lighthouse off), every audit shows new and fixed
  issues against the previous one, and the owner gets an email after each
  scheduled audit. Local SEO dropped: Bryan's customers are a mix of
  businesses in different countries, not mostly local ones. Reports: paid
  accounts can put their own company name, website and logo on shared and
  printed reports (Reports, Your branding). A PDF made on the server needs
  Cloudflare's browser service, so PDFs still come from the print window.
- 2026-11-16: Customer billing emails (gap review phase 1, the parts that
  don't need PayPal). "Your plan is active" when a payment is recorded on
  /admin (Pro month, Pro year, Lifetime, extra credits). A daily email when
  a Pro year ends in 14 days, in 3 days, and once it has ended. A daily
  warning when a paid account drops under $5 of credits, once per credit
  period. Each reminder is sent once. Yearly customers now get a "Pay for a
  year here" button on the billing page (it only told them to pay). Still
  to do for phase 1: automatic activation after PayPal payment (waits on
  the client's PayPal REST app).
- 2026-11-15: Landing page: Blog Generator section and menu link, 30-day
  money-back guarantee under the hero, under the prices and in the FAQ,
  rank tracking worded as checks. Live on agsmaster.com.
- 2026-11-13: Loops "AGS MASTER notice" email template published and its id
  added to the live app. A test notice reached the admin inbox and its
  button opened app.agsmaster.com.
- 2026-11-13: Suggestions batch (tested locally, deployed 2026-11-13; database
  tables and new screens checked live).
  Version history on articles (text from before each editing session and
  each AI rewrite, with its AI review; restore keeps the current text too).
  "Write with AI" runs as a background job, so a closed tab no longer loses
  a paid article (tested: closed mid-way, finished in 78 s). AI picks the
  WordPress category and 3 to 6 tags after writing; both can be changed in
  a new card and are sent with the post (new tags are created on the site).
  Picture alt text is written by AI from the picture itself. The meta
  description is also sent to Yoast and Rank Math fields, which only works
  on sites that expose them. Owners get an email after each automatic post,
  and admins a daily email when the OpenRouter balance is under $10 (both
  use the Loops "AGS MASTER notice" template). /admin shows the OpenRouter balance.
  The Context page has "Set up from my website" (fills empty sections and
  key pages, finds 3 competitors, researches topics, about $0.13).
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
  WordPress serves smaller sizes to phones. Deployed; the client confirmed
  picture width and Regenerate on the live app.
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
