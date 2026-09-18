import { html, raw } from '../../lib/escape.js';
import { config } from '../../config.js';

const NAV = [
  ['/admin', 'Queue'],
  ['/admin/events', 'Events'],
  ['/admin/changes', 'Changes'],
  ['/admin/inbound-emails', 'Inbound emails'],
  ['/admin/crews', 'Crews'],
  ['/admin/contact-messages', 'Messages'],
  ['/admin/harm-reduction', 'Harm reduction links'],
  ['/admin/stats', 'Stats'],
  ['/poster', 'Poster'],
];

/**
 * The admin panel shell. Plain, functional, no-store. Section 10.2.
 * @param {{ title: string, bodyContent: string, email: string, now?: Date }} options
 */
export function adminLayout({ title, bodyContent, email, now = new Date() }) {
  const showReminderBanner = now >= new Date('2027-04-01T00:00:00Z');

  return html`<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - ${config.siteName} admin</title>
  <link rel="stylesheet" href="/css/admin.css">
</head>
<body>
  <header class="admin-header">
    <nav>
      ${NAV.map(([href, label]) => html`<a href="${href}">${label}</a>`)}
    </nav>
    <span>Signed in as ${email}</span>
  </header>
  ${showReminderBanner
    ? html`<p class="admin-banner">CanTEST funding was due to end June 2027. Check the service is still running.</p>`
    : ''}
  <main>
    ${raw(bodyContent)}
  </main>
  <script src="/js/admin-confirm.js" defer></script>
  <script src="/js/lineup-rows.js" defer></script>
  <script src="/js/admin-events-form.js" defer></script>
</body>
</html>`;
}
