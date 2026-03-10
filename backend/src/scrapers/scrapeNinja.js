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

    const headerArray = [
      ...Object.entries(extraHeaders).map(([key, value]) => `${key}: ${value}`)
    ];

    if (this.cookie) {
      headerArray.push(`cookie: ${this.cookie}`);
    }

    const payload = {
      url,
      method: method.toUpperCase(),
      headers: headerArray,
      retryNum: 2,
      geo: 'de',
      js: true,
      blockImages: false,
      blockMedia: false,
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
