'use strict';

const cheerio = require('cheerio');
const ScrapeNinjaClient = require('./scrapeNinja');

const COURSES_URL =
  'https://academia.srmist.edu.in/srmAcademia/pages/studentprofile/ajaxPages/getTimeTabledata.action';

/**
 * Fetch and parse the course list from SRM Academia.
 * @param {string} cookie - Session cookie string
 * @returns {Promise<Object[]>} Array of course objects
 */
async function fetchCourses(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const result = await client.scrape(COURSES_URL, 'GET', '', {
    Accept: 'text/html, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const $ = cheerio.load(result.body);
  const courses = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 6) return;

    const courseCode = $(cells[0]).text().trim();
    const courseTitle = $(cells[1]).text().trim();
    const courseType = $(cells[2]).text().trim();
    const faculty = $(cells[3]).text().trim();
    const slot = $(cells[4]).text().trim();
    const room = cells.length > 5 ? $(cells[5]).text().trim() : '';

    if (!courseCode) return;

    courses.push({
      courseCode,
      courseTitle,
      courseType,
      faculty,
      slot,
      room,
    });
  });

  return courses;
}

module.exports = { fetchCourses };
