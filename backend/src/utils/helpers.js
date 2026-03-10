'use strict';

/**
 * Convert a hex-encoded string to its HTML/text representation.
 * @param {string} hex
 * @returns {string}
 */
function convertHexToHTML(hex) {
  if (!hex) return '';
  let result = '';
  for (let i = 0; i < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return result;
}

/**
 * Safe float parser – returns 0 if the value cannot be parsed.
 * @param {string|number} value
 * @returns {number}
 */
function safeParseFloat(value) {
  const num = global.parseFloat(String(value).trim());
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Safe integer parser – returns 0 if the value cannot be parsed.
 * @param {string|number} value
 * @returns {number}
 */
function safeParseInt(value) {
  const num = global.parseInt(String(value).trim(), 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Extract cookies from a Set-Cookie header string or array.
 * @param {string|string[]} setCookieHeader
 * @returns {string} Concatenated cookie string suitable for use in Cookie header
 */
function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  return cookies
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * Encode an object as a base64 token string.
 * @param {Object} payload
 * @returns {string}
 */
function encodeToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode a base64 token string back to an object.
 * @param {string} token
 * @returns {Object|null}
 */
function decodeToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  convertHexToHTML,
  safeParseFloat,
  safeParseInt,
  extractCookies,
  encodeToken,
  decodeToken,
};
