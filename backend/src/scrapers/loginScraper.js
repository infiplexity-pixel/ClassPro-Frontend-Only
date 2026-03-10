'use strict';

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const ZOHO_BASE = 'https://academia.srmist.edu.in/accounts/p/40-10002227248';
const ZOHO_LOGOUT_URL =
  'https://academia.srmist.edu.in/accounts/p/10002227248/logout' +
  '?servicename=ZohoCreator&serviceurl=https://academia.srmist.edu.in';

const LOGIN_PAGE =
  'https://academia.srmist.edu.in/accounts/p/10002227248/signin' +
  '?hide_fp=true&orgtype=40&service_language=en' +
  '&css_url=/49910842/academia-academic-services/downloadPortalCustomCss/login' +
  '&dcc=true' +
  '&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin';

const SERVICE_URL =
  'https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient() {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      maxRedirects: 10,
      validateStatus: () => true,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    })
  );
  return { client, jar };
}

async function extractCSRF(jar, url) {
  const cookies = await jar.getCookies(url);
  const iamcsr = cookies.find(c => c.key === 'iamcsr');
  return iamcsr ? iamcsr.value : null;
}

async function jarCookieHeader(jar, url) {
  return jar.getCookieString(url);
}

/**
 * Fully simulate a browser loading the login page:
 * 1. GET the SRM academia root to pick up any domain-level cookies
 * 2. GET the actual login page (follows redirects via jar)
 * 3. Small random delay to appear human
 */
async function initSession(client, jar) {
  // Step 1: hit the root domain first, just like a browser navigation
  await client.get('https://academia.srmist.edu.in/', {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  await sleep(300 + Math.random() * 400);

  // Step 2: load the actual login page
  await client.get(LOGIN_PAGE, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  await sleep(500 + Math.random() * 500);

  // Step 3: verify we got the CSRF token
  const csrf = await extractCSRF(jar, 'https://academia.srmist.edu.in');
  if (!csrf) {
    throw new Error('initSession: failed to obtain iamcsr CSRF token');
  }

  return csrf;
}

async function fetchCaptcha(client, jar, cdigest) {
  const url = `${ZOHO_BASE}/webclient/v1/captcha/${cdigest}?darkmode=false`;
  const cookieStr = await jarCookieHeader(jar, url);

  const resp = await client.get(url, {
    headers: {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Referer': LOGIN_PAGE,
      'cookie': cookieStr,
    },
  });

  const imageBytes = resp.data?.captcha?.image_bytes;
  if (!imageBytes) throw new Error('Missing image_bytes in captcha response');
  return imageBytes;
}

async function lookupUser(client, jar, username, captchaData = null) {
  const user = username.replace(/@srmist\.edu\.in$/i, '');
  const url = `${ZOHO_BASE}/signin/v2/lookup/${encodeURIComponent(user)}@srmist.edu.in`;

  const csrf = await extractCSRF(jar, 'https://academia.srmist.edu.in');
  if (!csrf) throw new Error('No CSRF token — initSession failed');

  const cookieStr = await jarCookieHeader(jar, url);

  let body =
    `mode=primary` +
    `&cli_time=${Date.now()}` +
    `&orgtype=40` +
    `&service_language=en` +
    `&serviceurl=${SERVICE_URL}`;

  // if (captchaData?.cdigest && captchaData?.captcha) {
  //   body +=
  //     `&captcha=${encodeURIComponent(captchaData.captcha)}` +
  //     `&cdigest=${encodeURIComponent(captchaData.cdigest)}`;
  // }

  const resp = await client.post(url, body, {
    headers: {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Origin': 'https://academia.srmist.edu.in',
      'Referer': LOGIN_PAGE,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'X-ZCSRF-TOKEN': `iamcsrcoo=${csrf}`,
      'cookie': cookieStr,
    },
  });

  return resp.data;
}

async function getSession(client, jar, password, identifier, digest) {
  const url =
    `${ZOHO_BASE}/signin/v2/primary/${encodeURIComponent(identifier)}/password` +
    `?digest=${encodeURIComponent(digest)}` +
    `&cli_time=${Date.now()}` +
    `&servicename=ZohoCreator` +
    `&service_language=en` +
    `&serviceurl=${SERVICE_URL}`;

  const csrf = await extractCSRF(jar, 'https://academia.srmist.edu.in');
  const cookieStr = await jarCookieHeader(jar, url);

  const body = JSON.stringify({ passwordauth: { password } });

  await sleep(200 + Math.random() * 300);

  const resp = await client.post(url, body, {
    headers: {
      'accept': '*/*',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-zcsrf-token': `iamcsrcoo=${csrf}`,
      'cookie': cookieStr,
      'Origin': 'https://academia.srmist.edu.in',
      'Referer': LOGIN_PAGE,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
  });

  if (resp.status >= 400) throw new Error(`HTTP error: ${resp.status}`);

  const data = resp.data;
  const code = String(data.code || '');

  if (code === 'SI303') {
    const redirectUri = data?.passwordauth?.redirect_uri;
    if (redirectUri) {
      const cookieStrNow = await jarCookieHeader(jar, redirectUri);
      await client.get(redirectUri, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': LOGIN_PAGE,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'cookie': cookieStrNow,
        },
      });

      await sleep(300 + Math.random() * 200);

      const cleanupCsrf = await extractCSRF(jar, 'https://academia.srmist.edu.in');
      const cleanupCookies = await jarCookieHeader(jar, 'https://academia.srmist.edu.in');

      await client.delete(
        'https://academia.srmist.edu.in/accounts/p/10002227248/webclient/v1/account/self/user/self/activesessions',
        {
          headers: {
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'x-zcsrf-token': `iamcsrcoo=${cleanupCsrf}`,
            'Referer': redirectUri,
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'cookie': cleanupCookies,
          },
        }
      );
    }
  }

  const finalCookies = await jarCookieHeader(jar, 'https://academia.srmist.edu.in');
  data.cookies = finalCookies;
  return data;
}

function requiresHIP(data) {
  const message = String(data.message || '');
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const localized = String(data.localized_message || '');
  return (
    message.includes('HIP') ||
    localized.includes('HIP') ||
    errors.some(e => String(e?.message || '').includes('HIP'))
  );
}

async function login({ username, password, captcha, cdigest }) {
  const { client, jar } = makeClient();

  await initSession(client, jar);

  const captchaData = captcha && cdigest ? { captcha, cdigest } : null;
  const data = await lookupUser(client, jar, username, captchaData);
  console.log('lookup:', data);

  const statusCode = Number(data.status_code) || 0;
  const errors = Array.isArray(data.errors) ? data.errors : [];

  if (errors.length > 0) {
    const lookupMsg = String(errors[0]?.message || '');
    if (requiresHIP(data)) {
      const cdigestStr = String(data.cdigest || '');
      if (cdigestStr) {
        let captchaImage = null;
        try { captchaImage = await fetchCaptcha(client, jar, cdigestStr); } catch (_) {}
        return {
          authenticated: false, session: null, lookup: data,
          cookies: '', status: statusCode,
          message: String(data.localized_message || ''),
          errors: [lookupMsg],
          captcha: captchaImage
            ? { image: captchaImage, cdigest: cdigestStr }
            : { cdigest: cdigestStr },
        };
      }
    }
    return {
      authenticated: false, session: null, lookup: null,
      cookies: '', status: statusCode,
      message: String(data.message || ''),
      errors: [lookupMsg],
    };
  }

  if (!String(data.message || '').includes('User exists')) {
    if (requiresHIP(data)) {
      const cdigestStr = String(data.cdigest || '');
      if (cdigestStr) {
        let captchaImage = null;
        try { captchaImage = await fetchCaptcha(client, jar, cdigestStr); } catch (_) {}
        return {
          authenticated: false, session: null, lookup: data,
          cookies: '', status: statusCode,
          message: String(data.localized_message || ''),
          errors: [],
          captcha: captchaImage
            ? { image: captchaImage, cdigest: cdigestStr }
            : { cdigest: cdigestStr },
        };
      }
    }
    return {
      authenticated: false, session: null, lookup: null,
      cookies: '', status: statusCode,
      message: String(data.message || ''),
      errors: [],
    };
  }

  const lookup = data.lookup;
  if (!lookup?.identifier || !lookup?.digest) {
    throw new Error('Invalid lookup data: missing identifier or digest');
  }

  const session = await getSession(client, jar, password, lookup.identifier, lookup.digest);
  console.log('session:', session);

  const passwordAuthCode = session?.passwordauth?.code ?? null;
  const sessionMessage = String(session.message || '');
  const cookies = String(session.cookies || '');
  const code = String(session.code || '');
  const sessionBody = { success: true, code, message: sessionMessage };

  const isSuccess =
    code === 'SI200' ||
    code === 'SI303' ||
    sessionMessage.toLowerCase().includes('success');

  if (!isSuccess || sessionMessage.toLowerCase().includes('invalid')) {
    sessionBody.success = false;
    return {
      authenticated: false, session: sessionBody,
      lookup: { identifier: lookup.identifier, digest: lookup.digest },
      cookies, status: statusCode, message: sessionMessage, errors: [],
    };
  }

  return {
    authenticated: true, session: sessionBody,
    lookup, cookies, status: statusCode,
    message: data.message, errors: [],
  };
}

async function logout(cookie) {
  const { client } = makeClient();
  const resp = await client.get(ZOHO_LOGOUT_URL, {
    headers: {
      'DNT': '1',
      'Referer': 'https://academia.srmist.edu.in/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1',
      'Cookie': cookie,
    },
  });
  return { status: resp.status, result: resp.data };
}

module.exports = { login, logout, fetchCaptcha };