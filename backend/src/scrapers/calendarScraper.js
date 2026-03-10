'use strict';

const cheerio = require('cheerio');
const ScrapeNinjaClient = require('./scrapeNinja');

const CALENDAR_URL =
  'https://academia.srmist.edu.in/srmAcademia/pages/studentprofile/ajaxPages/getAcademicCalendardata.action';

/**
 * Fetch and parse the academic calendar from SRM Academia.
 * @param {string} cookie - Session cookie string
 * @returns {Promise<Object>} Calendar events organised by month name
 */
async function fetchCalendar(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const result = await client.scrape(CALENDAR_URL, 'GET', '', {
    Accept: 'text/html, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const $ = cheerio.load(result.body);
  const calendar = {};

  // Each month block is typically wrapped in a section/div with a heading
  $('table').each((_, table) => {
    // Try to find the month heading above this table
    const heading =
      $(table).prev('h2, h3, h4, strong, .month-heading').text().trim() ||
      $(table).find('thead th').first().text().trim() ||
      `Month ${Object.keys(calendar).length + 1}`;

    const events = [];

    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;

        const date = $(cells[0]).text().trim();
        const description = $(cells[1]).text().trim();
        const day = cells.length > 2 ? $(cells[2]).text().trim() : '';

        if (!date && !description) return;

        events.push({ date, day, description });
      });

    if (events.length > 0) {
      calendar[heading] = events;
    }
  });

  return calendar;
}

module.exports = { fetchCalendar };
