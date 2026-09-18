# CBR EDM

A community-run noticeboard for underground EDM events in and around Canberra.
No algorithm, no accounts, no feed. See [SPEC.md](./SPEC.md) for the full
build specification (its working name, "Project C-EDM", predates the real
name and domain below) and [CHANGELOG.md](./CHANGELOG.md) for what has
actually been built.

The site name shown on the page is `CBR DANCE MUSIC`, read from
[`src/config.js`](./src/config.js), so renaming later is still a one-file
change. The project itself may be referred to as either `cbrdance` or
`cbredm` - both `cbrdance.org` and `cbredm.org` are owned and redirect to
the same Worker.

## Local development

Requirements: Node.js 18 or later, and `npx` (comes with Node).

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

This starts `wrangler dev` on `http://127.0.0.1:8787`, backed by a local D1
database seeded with clearly fake crews and events (see
[`seed/seed.sql`](./seed/seed.sql)). `GET /health` confirms the Worker, D1 and
static assets bindings are all wired up correctly.

Local dev never touches your real Cloudflare account. Add `--remote` to the
migration or seed commands only if you deliberately want to run them against
the live database, and never run the seed script against remote.

### Testing the admin panel locally

`/admin*` is protected by Cloudflare Access in production (step 10 below),
which does not exist in local dev. To exercise the admin panel without it,
copy the example dev vars file and restart `wrangler dev`:

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` is gitignored and never deployed. `DEV_BYPASS_ACCESS=true` only
has any effect when running locally; production always requires a real,
independently verified Access JWT (see `src/lib/auth.js`), and rejects the
request if that verification fails for any reason, including a
misconfigured Access application.

## Owner setup checklist

Claude Code cannot do any of the following steps itself; they need a human
with access to accounts, a card, and a domain registrar.

1. **Private GitHub repo.** Create it on your personal GitHub account and
   push this repo to it. Set your git commit email to your GitHub `noreply`
   address (Settings > Emails > "Keep my email address private" gives you
   one like `12345+username@users.noreply.github.com`) so no personal
   address appears in history:
   ```bash
   git config user.email "your-id+username@users.noreply.github.com"
   ```
2. **Personal Cloudflare account.** Sign up at
   [dash.cloudflare.com](https://dash.cloudflare.com) if you do not have one.
3. **Domain: `cbredm.org`.** (A second domain, `cbrdance.org`, was bought
   later and set up to redirect to the same Worker - see the custom domains
   step below.) Check whether
   [Cloudflare Registrar](https://developers.cloudflare.com/registrar/)
   sells `.org` domains at purchase time. If not, buy it from any registrar
   and point the nameservers at Cloudflare. Before buying, check what the
   registrar's WHOIS privacy settings will display about the registrant, so
   your personal details stay private.
4. **Dedicated project mailbox.** Create a new, free email account used only
   for this project (not your personal address). This becomes the admin
   alert destination, the Cloudflare Access login identity, and the address
   people see replies come from.
5. **Email Routing.** Enable it on the domain in the Cloudflare dashboard.
   Add the project mailbox as a verified destination address. Create routes:
   - `events@cbredm.org` to the Email Worker (inbound submissions).
   - `noreply@cbredm.org` as the sender identity for admin alerts.
6. **Email Service sending.** Onboard the domain for outbound sending so the
   Worker can email alerts to the verified project mailbox.
7. **D1 database.** Run `npx wrangler d1 create c_edm_db`, then replace the
   placeholder `database_id` in `wrangler.jsonc` with the real one it prints.
8. **R2 bucket.** Run `npx wrangler r2 bucket create c-edm-flyers` (requires
   a card on file, even though usage should stay in the free tier at this
   project's scale).
9. **Turnstile widget.** Create one for the domain in the dashboard. Put the
   site key in `wrangler.jsonc` (`vars.TURNSTILE_SITE_KEY`) and set the
   secret key as a Worker secret: `npx wrangler secret put TURNSTILE_SECRET_KEY`.
10. **Cloudflare Access.** Protect `/admin*` with an Access application,
    allowing only the project mailbox to sign in via one-time PIN. Record the
    Access team domain and the application's audience (AUD) tag and put them
    in `wrangler.jsonc` (`vars.ACCESS_TEAM_DOMAIN`, `vars.ACCESS_AUD`).
11. **Web Analytics.** Enable it for the domain in the dashboard.
12. **Workers Builds.** Connect it to the GitHub repo so pushes to `main`
    deploy automatically.
13. **Custom domain.** Attach it to the Worker once everything above is in
    place.

## Deploying

Once Workers Builds is connected (step 12), pushing to `main` deploys
automatically. To deploy manually instead:

```bash
npm run deploy
```

Run migrations against the real database separately and deliberately:

```bash
npm run db:migrate:remote
```

## Backups

D1 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
covers point-in-time recovery for the last 30 days automatically. Because the
archive is meant to last forever, also do a manual export monthly and store
it somewhere outside Cloudflare (a personal backup drive or cloud storage you
control):

```bash
npx wrangler d1 export c_edm_db --remote --output backup-$(date +%Y-%m-%d).sql
```

## Current free tier limits (checked against Cloudflare docs, September 2026)

These are the limits that matter at this project's expected scale (roughly
5 events a month, small compressed flyers). Check
[developers.cloudflare.com](https://developers.cloudflare.com) for current
numbers before relying on any of these for a decision, since free tiers do
change.

| Service | Free tier limit |
|---|---|
| Workers requests | 100,000 / day |
| Workers CPU time | 10 ms / request |
| Workers subrequests | 50 external / request |
| D1 rows read | 5 million / day |
| D1 rows written | 100,000 / day |
| D1 storage | 5 GB total |
| R2 storage | 10 GB-month / month |
| R2 Class A operations (writes) | 1 million / month |
| R2 Class B operations (reads) | 10 million / month |
| R2 egress | Always free |
| Email Routing destination addresses | 200 / account |
| Email Routing inbound message size | 25 MiB |

At 5 events a month with compressed WebP flyers (a few hundred KB each), R2
storage growth is a few MB a month. The forever archive fits comfortably
inside the free tier for years.

**Generated flyer edge cache.** `GET /flyer/:id.svg` (`src/routes/flyer.js`)
caches its rendered SVG with the Workers Cache API (`caches.default`),
keyed by the same event/template/seed/surface/engine-version/data-hash
tuple the flyer engine uses for its cache key. This cache isn't in the
table above: it isn't billed or quota-limited the way D1 or R2 are, but
it's per data centre, not global, so a visitor hitting a colo for the
first time still triggers one render there. Our SVGs are a few KB, well
under any size ceiling Cache API entries have.

**Real terrain for the contour flyer template.** `src/lib/geocode.js`
calls two free, no-key external services, once per explicit "Fetch real
terrain" action (admin or crew), never on a schedule or automatically on
save: [Nominatim](https://nominatim.org/) (OpenStreetMap) for geocoding,
and [OpenTopoData](https://www.opentopodata.org/)'s public `srtm30m`
endpoint for elevation. At this project's scale (a handful of lookups a
month) both are well within their public usage policies, but both are
community-run with no uptime guarantee -- a failed lookup just leaves
the event on the procedural contour map, the same as if it were never
attempted. Never called for a `location_tba` event.

## Repo layout

See [SPEC.md](./SPEC.md) section 3.6 for the intended layout. In short:
`src/` is the Worker (routes, templates, and `lib/` helpers), `public/` is
static assets, `migrations/` is numbered D1 SQL, `seed/` is fake local-only
data.
