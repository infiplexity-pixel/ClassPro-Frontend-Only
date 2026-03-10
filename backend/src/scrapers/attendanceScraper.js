'use strict';

const cheerio = require('cheerio');
const ScrapeNinjaClient = require('./scrapeNinja');
const { safeParseFloat, safeParseInt } = require('../utils/helpers');

const ATTENDANCE_URL =
  'https://academia.srmist.edu.in/srmAcademia/pages/studentprofile/ajaxPages/getStudentProfiledata.action';

/**
 * Fetch and parse attendance data from SRM Academia.
 * @param {string} cookie - Session cookie string
 * @returns {Promise<Object[]>} Array of attendance records
 */
async function fetchAttendance(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const result = await client.scrape(ATTENDANCE_URL, 'GET', '', {
    Accept: 'text/html, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const $ = cheerio.load(result.body);
  const attendance = [];

  // SRM Academia renders attendance in a table – each row is one course
  $('table tbody tr, .AttendanceDetailTableContainer tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    const courseCode = $(cells[0]).text().trim();
    const courseTitle = $(cells[1]).text().trim();
    const courseType = $(cells[2]).text().trim();
    const hoursConducted = safeParseInt($(cells[3]).text().trim());
    const hoursAbsent = safeParseInt($(cells[4]).text().trim());
    const attendancePercentage =
      cells.length > 5
        ? safeParseFloat($(cells[5]).text().trim())
        : hoursConducted > 0
        ? safeParseFloat(
            (((hoursConducted - hoursAbsent) / hoursConducted) * 100).toFixed(2)
          )
        : 0;

    if (!courseCode) return;

    attendance.push({
      courseCode,
      courseTitle,
      courseType,
      hoursConducted,
      hoursAbsent,
      attendancePercentage,
    });
  });

  return attendance;
}

module.exports = { fetchAttendance };
