'use strict';

const axios = require('axios');
const { convertHexToHTML } = require('../utils/helpers');

const ACADEMIA_BASE = 'https://academia.srmist.edu.in';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Make an authenticated GET request to an SRM Academia page and return
 * the decoded HTML content extracted from the page's hex-encoded response.
 *
 * SRM Academia wraps page content inside a JavaScript call:
 *   ...sanitize('<hex_encoded_html>')...
 * The hex is decoded back to HTML.
 *
 * @param {string} path   - Path under ACADEMIA_BASE (e.g. /srm_university/...)
 * @param {string} cookie - Session cookie string from login
 * @param {Object} [extraHeaders] - Additional headers to merge
 * @returns {Promise<string>} Decoded HTML string
 */
async function getAcademiaPage(path, cookie, extraHeaders = {}) {
  const url = `${ACADEMIA_BASE}${path}`;

  const resp = await axios.get(url, {
    validateStatus: () => true,
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${ACADEMIA_BASE}/`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
      dnt: '1',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-gpc': '1',
      cookie,
      ...extraHeaders,
    },
  });

  if (resp.status !== 200) {
    throw new Error(`Academia returned HTTP ${resp.status} for ${path}`);
  }

  const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
  return decodeAcademiaResponse(raw);
}

/**
 * Decode the hex-encoded HTML content from an SRM Academia page response.
 *
 * Two known formats:
 *  1. `.sanitize('<hex>')` – used by My_Attendance, My_Time_Table_*
 *  2. `zmlvalue="<hex>" > </div>` – used by Academic_Planner pages
 *
 * @param {string} raw - Raw response body
 * @returns {string} Decoded HTML (or the original string if no encoding found)
 */
function decodeAcademiaResponse(raw) {
  // Format 1: .sanitize('...')
  if (raw.includes(".sanitize('")) {
    const parts = raw.split(".sanitize('");
    if (parts.length >= 2) {
      const hex = parts[1].split("')")[0];
      return convertHexToHTML(hex);
    }
  }

  // Format 2: zmlvalue="..." > </div> </div>
  if (raw.includes('zmlvalue="')) {
    const parts = raw.split('zmlvalue="');
    if (parts.length >= 2) {
      const hex = parts[1].split('" > </div>')[0];
      const decoded = convertHexToHTML(hex);
      return decodeHTMLEntities(decoded);
    }
  }

  // Format 3: raw HTML (calendar direct table format)
  if (raw.includes('<table bgcolor=')) {
    return raw;
  }

  return raw;
}

/**
 * Decode common HTML entities in a string.
 * @param {string} str
 * @returns {string}
 */
function decodeHTMLEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // Must be last to avoid double-unescaping
}

module.exports = { getAcademiaPage, decodeHTMLEntities };
