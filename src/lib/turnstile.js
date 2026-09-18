// Cloudflare Turnstile server-side verification, section 9.1 and 12.
// The widget alone never protects a form: this call to siteverify is what
// actually does.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {string} token - the "cf-turnstile-response" field from the form
 * @param {string} secretKey
 * @param {string} [remoteIp]
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(token, secretKey, remoteIp) {
  if (!token || !secretKey) return false;

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const result = await response.json();
    if (result.success !== true) {
      // The widget itself can report success to the visitor (it got a
      // token) while this call still fails -- almost always a site
      // key/secret key mismatch or a stale/reused token, never something
      // fixable from here. error-codes (e.g. "invalid-input-secret",
      // "timeout-or-duplicate") is exactly what's needed to tell those
      // apart in the Worker logs, see README.md step 9.
      console.error('Turnstile siteverify failed:', result['error-codes']);
    }
    return result.success === true;
  } catch (err) {
    console.error('Turnstile siteverify request failed:', err);
    return false;
  }
}
