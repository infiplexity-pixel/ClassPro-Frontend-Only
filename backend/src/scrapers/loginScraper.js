'use strict';

const ScrapeNinjaClient = require('./scrapeNinja');
const { extractCookies } = require('../utils/helpers');

const BASE_URL = 'https://academia.srmist.edu.in';
const LOGIN_URL = `${BASE_URL}/#Login`;
const CAPTCHA_URL = `${BASE_URL}/srmAcademia/cdigest/get_captcha_image/`;
const DO_LOGIN_URL = `${BASE_URL}/srmAcademia/servlet/mimin.action`;

/**
 * Fetch the captcha image bytes via ScrapeNinja and return as base64.
 * @param {string} cdigest - Captcha digest identifier
 * @returns {Promise<{image: string, cookies: string}>}
 */
async function fetchCaptcha(cdigest) {
  const client = new ScrapeNinjaClient();
  const url = `${CAPTCHA_URL}${cdigest}`;
  const result = await client.scrape(url, 'GET');
  const setCookie = result.headers['set-cookie'] || result.headers['Set-Cookie'] || '';
  const cookies = extractCookies(setCookie);
  return { image: Buffer.from(result.body).toString('base64'), cookies };
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

module.exports = { fetchCaptcha, login, logout };
