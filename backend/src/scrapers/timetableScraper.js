'use strict';

const cheerio = require('cheerio');
const ScrapeNinjaClient = require('./scrapeNinja');

const TIMETABLE_URL =
  'https://academia.srmist.edu.in/srmAcademia/pages/studentprofile/ajaxPages/getTimeTabledata.action';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Fetch and parse the timetable from SRM Academia.
 * @param {string} cookie - Session cookie string
 * @returns {Promise<Object>} Timetable keyed by day name
 */
async function fetchTimetable(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const result = await client.scrape(TIMETABLE_URL, 'GET', '', {
    Accept: 'text/html, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const $ = cheerio.load(result.body);
  const timetable = {};

  // Initialise empty arrays for each day
  DAYS.forEach((day) => {
    timetable[day] = [];
  });

  // The timetable page contains one table per day or a single table with day
  // column; we handle both layouts generically.
  $('table').each((tableIdx, table) => {
    const dayName = DAYS[tableIdx] || null;
    if (!dayName) return;

    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 3) return;

        const slot = $(cells[0]).text().trim();
        const courseCode = $(cells[1]).text().trim();
        const venue = cells.length > 2 ? $(cells[2]).text().trim() : '';

        if (!slot && !courseCode) return;

        timetable[dayName].push({ slot, courseCode, venue });
      });
  });

  return timetable;
}

module.exports = { fetchTimetable };
