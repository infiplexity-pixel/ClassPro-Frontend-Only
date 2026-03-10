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
    this.rapidURL = 'https://scrapeninja.p.rapidapi.com/scrape';
    this.cookie = cookie;
  }

  /**
   * Perform a scraping request via ScrapeNinja.
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

    const requestHeaders = {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'https://academia.srmist.edu.in/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    };

    if (this.cookie) {
      requestHeaders.cookie = this.cookie;
    }

    const payload = {
      url,
      method: method.toUpperCase(),
      headers: requestHeaders,
      retryNum: 2,
      geo: 'in',
      js: false,
      blockImages: true,
      blockMedia: true,
    };

    if (method.toUpperCase() === 'POST' && data) {
      payload.data = data;
    }

    const response = await axios.post(this.rapidURL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': this.rapidHost,
      },
      timeout: 30000,
    });

    return {
      body: response.data.body || '',
      statusCode: response.data.statusCode || response.status,
      headers: response.data.headers || {},
    };
  }
}

module.exports = ScrapeNinjaClient;
