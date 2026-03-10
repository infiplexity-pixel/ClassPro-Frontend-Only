'use strict';

const ScrapeNinjaClient = require('./scrapeNinja');
const { extractCookies } = require('../utils/helpers');

const BASE_URL = 'https://academia.srmist.edu.in';
const LOGIN_URL = `${BASE_URL}/#Login`;
const CAPTCHA_URL = `${BASE_URL}/srmAcademia/cdigest/get_captcha_image/`;
const DO_LOGIN_URL = `${BASE_URL}/srmAcademia/servlet/mimin.action`;

/**
 * Fetch the captcha image via ScrapeNinja and return as a base64 data URL.
 * @param {string} cdigest - Captcha digest identifier
 * @param {string} [existingCookies] - Cookies from the login-page scrape
 * @returns {Promise<{image: string, cookies: string}>}
 */
async function fetchCaptcha(cdigest, existingCookies = '') {
  const client = new ScrapeNinjaClient(existingCookies);
  const url = `${CAPTCHA_URL}${cdigest}`;
  const result = await client.scrape(url, 'GET');
  const setCookie = result.headers['set-cookie'] || result.headers['Set-Cookie'] || '';
  const newCookies = extractCookies(setCookie);
  const cookies = newCookies || existingCookies;

  // ScrapeNinja returns binary responses (images) as a base64-encoded string
  // in the JSON body field.  Use it directly; do not re-encode.
  const b64 = typeof result.body === 'string' ? result.body : Buffer.from(result.body).toString('base64');

  return { image: `data:image/png;base64,${b64}`, cookies };
}

/**
 * Scrape the SRM Academia login page to extract the cdigest token, then
 * fetch the associated captcha image.  Call this on the *first* login
 * attempt (before the user has entered a captcha).
 * @returns {Promise<{image: string, cdigest: string, cookies: string}>}
 */
async function initLogin() {
  const client = new ScrapeNinjaClient();
  const result = await client.scrape(BASE_URL, 'GET');
  const html = result.body || '';

  // Extract the cdigest value embedded in the login page HTML.
  // SRM Academia embeds it in several possible places – try them in order.
  const patterns = [
    /name=["']cdigest["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']cdigest["']/i,
    /"cdigest"\s*:\s*"([^"]+)"/i,
    /get_captcha_image\/([a-zA-Z0-9_\-]+)/i,
    /cdigest[^=]*=\s*["']([^"']+)["']/i,
  ];

  let cdigest;
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      cdigest = match[1];
      break;
    }
  }

  const pageCookies = extractCookies(
    result.headers['set-cookie'] || result.headers['Set-Cookie'] || '',
  );

  if (cdigest){
    const { image, cookies } = await fetchCaptcha(cdigest, pageCookies);
    return { image, cdigest, cookies };
  }
}

/**
 * Perform a login request against SRM Academia.
 * @param {Object} credentials - { username, password, captcha, cdigest, cookies }
 * @returns {Promise<{success: boolean, cookies: string, token: string}>}
 */
async function login({ username, password, captcha, cdigest, cookies = '' }) {
  const client = new ScrapeNinjaClient(cookies);

  const formData =
    `actionType=authLoginAjax` +
    `&requestType=SERVICE` +
    `&username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}` +
    `&captcha=${encodeURIComponent(captcha)}` +
    `&cdigest=${encodeURIComponent(cdigest)}`;

  const result = await client.scrape(DO_LOGIN_URL, 'POST', formData);

  const setCookie =
    result.headers['set-cookie'] || result.headers['Set-Cookie'] || '';
  const newCookies = extractCookies(setCookie);

  let body;
  try {
    body = JSON.parse(result.body);
  } catch {
    body = {};
  }

  const success =
    result.statusCode === 200 &&
    (body.status === 'success' ||
      body.loginStatus === 'success' ||
      (typeof result.body === 'string' && result.body.includes('success')));

  return {
    success,
    cookies: newCookies || cookies,
    token: newCookies || cookies,
    message: body.message || '',
  };
}

/**
 * Perform a logout request against SRM Academia.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{success: boolean}>}
 */
async function logout(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const logoutUrl = `${BASE_URL}/srmAcademia/servlet/mimin.action?actionType=logout`;
  try {
    await client.scrape(logoutUrl, 'GET');
  } catch {
    // Ignore errors on logout
  }
  return { success: true };
}

module.exports = { fetchCaptcha, initLogin, login, logout };
