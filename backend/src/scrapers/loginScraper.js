'use strict';

const ScrapeNinjaClient = require('./scrapeNinja');
const { extractCookies } = require('../utils/helpers');

// Zoho Accounts base URL used by SRM Academia
const ZOHO_BASE = 'https://academia.srmist.edu.in/accounts/p/40-10002227248';
const ZOHO_LOGOUT_URL =
  'https://academia.srmist.edu.in/accounts/p/10002227248/logout' +
  '?servicename=ZohoCreator&serviceurl=https://academia.srmist.edu.in';

// Common referer used on all Zoho login API requests
const LOGIN_REFERER =
  'https://academia.srmist.edu.in/accounts/p/10002227248/signin' +
  '?hide_fp=true&orgtype=40&service_language=en' +
  '&css_url=/49910842/academia-academic-services/downloadPortalCustomCss/login' +
  '&dcc=true&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin';

// Common service URL used in login form bodies
const SERVICE_URL =
  'https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin';

/**
 * Fetch the captcha image from the Zoho captcha JSON endpoint.
 *
 * The endpoint returns: { "captcha": { "image_bytes": "<base64>" } }
 * image_bytes is already base64-encoded so we use it directly.
 *
 * @param {string} cdigest - Captcha digest identifier
 * @returns {Promise<{image: string}>}
 */
async function fetchCaptcha(cdigest) {
  const url = `${ZOHO_BASE}/webclient/v1/captcha/${cdigest}?darkmode=false`;
  const client = new ScrapeNinjaClient();

  const result = await client.scrape(url, 'GET', '', {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: LOGIN_REFERER,
  });

  let parsed;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new Error('Failed to parse captcha JSON response');
  }

  const imageBytes = parsed?.captcha?.image_bytes;
  if (!imageBytes) {
    throw new Error('Missing image_bytes in captcha response');
  }

  return { image: `data:image/png;base64,${imageBytes}` };
}

/**
 * Call the Zoho lookup endpoint for a given username, optionally supplying
 * captcha credentials.
 *
 * @param {string} username
 * @param {{ cdigest: string, captcha: string }|null} captchaData
 * @returns {Promise<Object>} Raw Zoho JSON response
 */
async function lookupUser(username, captchaData = null) {
  const user = username.replace(/@srmist\.edu\.in$/i, '');
  const url = `${ZOHO_BASE}/signin/v2/lookup/${encodeURIComponent(user)}@srmist.edu.in`;

  let body =
    `mode=primary` +
    `&cli_time=${Date.now()}` +
    `&orgtype=40` +
    `&service_language=en` +
    `&serviceurl=${SERVICE_URL}`;

  if (captchaData && captchaData.cdigest && captchaData.captcha) {
    body +=
      `&captcha=${encodeURIComponent(captchaData.captcha)}` +
      `&cdigest=${encodeURIComponent(captchaData.cdigest)}`;
  }

  const client = new ScrapeNinjaClient();
  const result = await client.scrapeJs(url, 'POST', body, {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    Origin: 'https://academia.srmist.edu.in',
    Referer: LOGIN_REFERER,
  });

  let data;
  try {
    data = JSON.parse(result.body);
  } catch {
    throw new Error('Failed to parse lookup response');
  }

  return data;
}

/**
 * Return true if the Zoho response indicates that a CAPTCHA (HIP) is needed.
 * @param {Object} data - Parsed Zoho response JSON
 */
function requiresHIP(data) {
  const message = data.message || '';
  const errors = Array.isArray(data.errors) ? data.errors : [];
  return (
    message.includes('HIP') ||
    errors.some((e) => e?.message?.includes('HIP'))
  );
}

/**
 * Initialise a login session for the given username.
 *
 * Calls the Zoho lookup endpoint; if a CAPTCHA is required (HIP) the cdigest
 * is extracted from the response, the captcha image is fetched, and the data
 * needed by the frontend is returned.
 *
 * @param {string} username
 * @returns {Promise<{captcha?: {image: string, cdigest: string}, requiresCaptcha: boolean, error?: string}>}
 */
async function initLogin(username) {
  const data = await lookupUser(username);

  if (requiresHIP(data)) {
    const cdigestStr = typeof data.cdigest === 'string' ? data.cdigest : '';
    if (!cdigestStr) {
      return { requiresCaptcha: true, error: 'Captcha required but no cdigest returned' };
    }

    try {
      const { image } = await fetchCaptcha(cdigestStr);
      return { captcha: { image, cdigest: cdigestStr }, requiresCaptcha: true };
    } catch {
      // Return cdigest even if image fetch fails; frontend can retry
      return { captcha: { cdigest: cdigestStr }, requiresCaptcha: true };
    }
  }

  if ((data.message || '').includes('User exists') || (data.status_code === 200 && data.lookup)) {
    return { lookup: data.lookup, requiresCaptcha: false };
  }

  return {
    requiresCaptcha: false,
    error: data.message || 'Unknown error during lookup',
  };
}

/**
 * Authenticate with password against the Zoho accounts service.
 *
 * @param {string} password
 * @param {string} identifier - From the lookup response
 * @param {string} digest     - From the lookup response
 * @returns {Promise<Object>} Session response (contains cookies in headers)
 */
async function getSession(password, identifier, digest) {
  const url =
    `${ZOHO_BASE}/signin/v2/primary/${encodeURIComponent(identifier)}/password` +
    `?digest=${encodeURIComponent(digest)}` +
    `&cli_time=${Date.now()}` +
    `&servicename=ZohoCreator` +
    `&service_language=en` +
    `&serviceurl=${SERVICE_URL}`;

  const body = JSON.stringify({ passwordauth: { password } });

  const client = new ScrapeNinjaClient();
  const result = await client.scrapeJs(url, 'POST', body, {
    Accept: '*/*',
    'Content-Type': 'application/json',
    Origin: 'https://academia.srmist.edu.in',
    Referer: LOGIN_REFERER,
  });

  let data;
  try {
    data = JSON.parse(result.body);
  } catch {
    throw new Error('Failed to parse session response');
  }

  // Extract session cookies from the response headers
  const setCookie =
    result.headers['set-cookie'] ||
    result.headers['Set-Cookie'] ||
    '';
  data.cookies = extractCookies(setCookie);

  return data;
}

/**
 * Complete the two-step Zoho login.
 *
 * @param {Object} credentials - { username, password, captcha, cdigest }
 * @returns {Promise<{success: boolean, cookies: string, message: string}>}
 */
async function login({ username, password, captcha, cdigest }) {
  // Step 1: lookup (with captcha credentials if supplied)
  const captchaData =
    captcha && cdigest ? { captcha, cdigest } : null;
  const data = await lookupUser(username, captchaData);

  if (requiresHIP(data)) {
    return { success: false, message: 'Invalid captcha or captcha required' };
  }

  if (!(data.message || '').includes('User exists') && !(data.status_code === 200 && data.lookup)) {
    return { success: false, message: data.message || 'Login failed' };
  }

  // Step 2: password authentication
  const lookup = data.lookup;
  if (!lookup || !lookup.identifier || !lookup.digest) {
    return { success: false, message: 'Invalid lookup data' };
  }

  const session = await getSession(password, lookup.identifier, lookup.digest);

  const sessionMessage = session.message || '';
  const cookies = session.cookies || '';

  if (
    sessionMessage.toLowerCase().includes('invalid') ||
    !cookies ||
    cookies.split(';').some((c) => c.trim() === 'undefined')
  ) {
    return { success: false, message: sessionMessage || 'Invalid password' };
  }

  return { success: true, cookies, message: sessionMessage };
}

/**
 * Perform a logout request against the Zoho accounts service.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{success: boolean}>}
 */
async function logout(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  try {
    await client.scrape(ZOHO_LOGOUT_URL, 'GET', '', {
      Accept: 'text/html,application/xhtml+xml',
      Referer: 'https://academia.srmist.edu.in/',
    });
  } catch {
    // Ignore errors on logout
  }
  return { success: true };
}

module.exports = { fetchCaptcha, initLogin, login, logout };
