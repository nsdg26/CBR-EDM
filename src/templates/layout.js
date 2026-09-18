import { html, raw } from '../lib/escape.js';
import { config } from '../config.js';

function navLinks() {
  return [
    ['/submit', 'Submit an event'],
    ['/crews', 'Crews'],
    ['/archive', 'Archive'],
    ['/look-after-each-other', config.harmReductionTitle],
    ['/contact', 'Get in touch'],
    ['/calendar.ics', 'Subscribe to the calendar'],
  ];
}

/**
 * The shared page shell: header with site name and slogan, footer with the
 * required links (section 6), and a slot for page content.
 * @param {{ title: string, bodyContent: string, activeNav?: string, extraHead?: string, bodyClass?: string }} options
 */
export function layout({ title, bodyContent, extraHead = '', bodyClass = '' }) {
  return html`<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} - ${config.siteName}` : config.siteName}</title>
  <meta name="description" content="${config.slogan}">
  <link rel="stylesheet" href="/css/style.css">
  ${raw(extraHead)}
</head>
<body${bodyClass ? html` class="${bodyClass}"` : ''}>
  <header class="site-header">
    <div class="hero-name-row">
      <a href="/" class="site-name">${config.siteName}</a>
      <p class="slogan-strip">${config.slogan}</p>
    </div>
    <nav aria-label="Main">
      <ul class="site-nav">
        ${navLinks().map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}
      </ul>
    </nav>
  </header>
  <main>
    ${raw(bodyContent)}
  </main>
  ${raw(siteFooter())}
  <!-- build:CF_VERSION_ID -->
  <script src="/js/header-height.js" defer></script>
  <script src="/js/board-toggle.js" defer></script>
  <script src="/js/lineup-rows.js" defer></script>
  <script src="/js/submit-form.js" defer></script>
  <script src="/js/edit-form.js" defer></script>
  <script src="/js/crew-dashboard.js" defer></script>
  <script src="/js/contact-form.js" defer></script>
</body>
</html>`;
}

function siteFooter() {
  // Nav links already live in the header, section 6; no need to repeat them
  // down here. Nothing else to say unless there's Acknowledgement of
  // Country text to show (see config.js's ackText).
  if (!config.ackText) return '';

  return html`<footer class="site-footer">
    <p>${config.ackText}</p>
  </footer>`;
}
