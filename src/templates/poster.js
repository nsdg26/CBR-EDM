import { html, raw } from '../lib/escape.js';
import qrcode from '../vendor/qrcode.mjs';
import { config } from '../config.js';

const SIZES = {
  a4: { label: 'A4', widthMm: 210, heightMm: 297 },
  a6: { label: 'A6', widthMm: 105, heightMm: 148 },
};

/**
 * GET /poster. Section 17 phase 4: a printable poster with the site name,
 * slogan and a QR code to the home page, in the site's visual style, for
 * stickers and record shop walls. Works without JavaScript; size is
 * chosen with plain links.
 * @param {string} homeUrl - absolute URL to the site's home page
 * @param {'a4'|'a6'} size
 */
export function posterPage(homeUrl, size) {
  const dimensions = SIZES[size] || SIZES.a4;
  const otherSize = size === 'a6' ? 'a4' : 'a6';

  const qr = qrcode(0, 'M');
  qr.addData(homeUrl);
  qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });

  return html`<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poster - ${config.siteName}</title>
  <style>
    @font-face {
      font-family: 'Big Shoulders Display';
      src: url('/fonts/big-shoulders-display.woff2') format('woff2-variations');
      font-weight: 700 900;
    }
    @font-face {
      font-family: 'Archivo';
      src: url('/fonts/archivo.woff2') format('woff2-variations');
      font-weight: 400 600;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #2b2a27;
      font-family: 'Archivo', Arial, sans-serif;
      color: #d9d8d2;
    }

    .screen-only {
      padding: 1.5rem;
      text-align: center;
    }

    .screen-only a, .screen-only button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 2px solid #d9d8d2;
      padding: 0.5rem 1rem;
      text-decoration: none;
      display: inline-block;
      margin: 0.25rem;
      cursor: pointer;
    }

    .sheet {
      background: #d9d8d2;
      color: #141312;
      width: ${dimensions.widthMm}mm;
      height: ${dimensions.heightMm}mm;
      margin: 0 auto;
      padding: 12mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8mm;
    }

    .sheet h1 {
      font-family: 'Big Shoulders Display', sans-serif;
      font-weight: 900;
      text-transform: uppercase;
      font-size: ${size === 'a6' ? '9mm' : '16mm'};
      line-height: 1.05;
      margin: 0;
    }

    .sheet p {
      font-size: ${size === 'a6' ? '4mm' : '6mm'};
      line-height: 1.3;
      margin: 0;
      max-width: 42ch;
    }

    .sheet svg {
      width: ${size === 'a6' ? '45mm' : '70mm'};
      height: ${size === 'a6' ? '45mm' : '70mm'};
    }

    @media print {
      @page { size: ${dimensions.label}; margin: 0; }
      body { background: none; }
      .screen-only { display: none; }
      .sheet { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="screen-only">
    <p>Print size: ${dimensions.label}. <a href="/poster?size=${otherSize}">Switch to ${SIZES[otherSize].label}</a></p>
    <button type="button" data-print-button>Print</button>
  </div>
  <div class="sheet">
    <h1>${config.siteName}</h1>
    <p>${config.slogan}</p>
    ${raw(qrSvg)}
    <p>${homeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
  </div>
  <script src="/js/poster-print.js" defer></script>
</body>
</html>`;
}
