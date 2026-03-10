'use strict';

require('dotenv').config();

const axios = require('axios');

/**
 * ScrapeNinja client using RapidAPI.
 * Handles HTTP requests to SRM Academia through the ScrapeNinja proxy.
 */
class ScrapeNinjaClient {
  constructor(cookie = '') {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.rapidHost = 'scrapeninja.p.rapidapi.com';
    this.cookie = cookie;
  }

  /**
   * Build the header array from extra headers and the instance cookie.
   * @private
   */
  _buildHeaders(extraHeaders) {
    const headerArray = Object.entries(extraHeaders).map(
      ([key, value]) => `${key}: ${value}`,
    );
    if (this.cookie) {
      headerArray.push(`cookie: ${this.cookie}`);
    }
    return headerArray;
  }

  /**
   * Normalise an axios response into a consistent shape.
   * @private
   */
  _normalise(response) {
    return {
      body: response.data.body || '',
      statusCode: response.data.statusCode || response.status,
      headers: response.data.headers || {},
    };
  }

  /**
   * Perform a basic scraping request via ScrapeNinja (/scrape).
   * @param {string} url - Target URL
   * @param {string} method - HTTP method (GET/POST)
   * @param {string} [data] - Request body (for POST)
   * @param {Object} [extraHeaders] - Additional headers to include
   * @returns {Promise<{body: string, statusCode: number, headers: Object}>}
   */
  async scrape(url, method = 'GET', data = '', extraHeaders = {}) {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    const payload = {
      url,
      method: method.toUpperCase(),
      headers: this._buildHeaders(extraHeaders),
      retryNum: 2,
      geo: 'de',
      js: false,
      blockImages: false,
      blockMedia: false,
    };

    if (method.toUpperCase() === 'POST' && data) {
      payload.data = data;
    }

    const response = await axios.post(
      'https://scrapeninja.p.rapidapi.com/scrape',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.rapidHost,
        },
        timeout: 30000,
      },
    );

    return this._normalise(response);
  }

  /**
   * Perform a JavaScript-rendered scraping request via ScrapeNinja
   * (/v2/scrape-js).  Use this for Zoho login API calls that need
   * JavaScript execution and full cookie handling.
   *
   * @param {string} url - Target URL
   * @param {string} method - HTTP method (GET/POST)
   * @param {string} [data] - Request body (for POST)
   * @param {Object} [extraHeaders] - Additional headers to include
   * @returns {Promise<{body: string, statusCode: number, headers: Object}>}
   */
  async scrapeJs(url, method = 'GET', data = '', extraHeaders = {}) {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    const payload = {
      url,
      method: method.toUpperCase(),
      headers: this._buildHeaders(extraHeaders),
      retryNum: 2,
      geo: 'de',
    };

    if (method.toUpperCase() === 'POST' && data) {
      payload.data = data;
    }

    const response = await axios.post(
      'https://scrapeninja.p.rapidapi.com/v2/scrape-js',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.rapidHost,
        },
        timeout: 30000,
      },
    );

    return this._normalise(response);
  }
}

module.exports = ScrapeNinjaClient;
