// Security headers, section 12. Applied to HTML responses only, since
// forcing these onto an image or calendar file response serves no purpose
// and risks breaking their own Content-Type handling.

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  // The Turnstile widget injects its own inline styles into its iframe/host
  // elements, so style-src needs 'unsafe-inline'. This is far lower risk
  // than allowing inline scripts (still fully blocked above): styles can't
  // execute code or exfiltrate data on their own.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // challenges.cloudflare.com is also needed here, not just in frame-src
  // and script-src: the Turnstile widget's own JS makes fetch/XHR calls
  // back to its origin for parts of the challenge flow, which connect-src
  // (not frame-src) governs. Without it those calls are silently blocked,
  // which can present as "the widget looks fine, but the check keeps
  // failing" without a proper error message on screen.
  "connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
].join('; ');

/**
 * @param {Response} response
 * @param {{ noReferrer?: boolean }} [options] - pass noReferrer on edit and crew pages, section 12
 * @param {import('../env.js').Env} [env] - used to fill in the build comment, see layout.js
 */
export async function withSecurityHeaders(response, options = {}, env) {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', options.noReferrer ? 'no-referrer' : 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');

  // layout.js leaves this placeholder in every page; filled in here, in the
  // one place all HTML responses pass through, rather than threading env
  // into every route just to render an HTML comment.
  const buildId = env?.CF_VERSION_METADATA?.id ? env.CF_VERSION_METADATA.id.slice(0, 8) : 'dev';

  return new Response(
    (await response.text()).replace('CF_VERSION_ID', buildId),
    { status: response.status, statusText: response.statusText, headers },
  );
}
