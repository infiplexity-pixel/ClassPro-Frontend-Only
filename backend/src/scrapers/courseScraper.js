'use strict';

const cheerio = require('cheerio');
const { getAcademiaPage } = require('./academiaClient');

const COURSE_PATH =
  '/srm_university/academia-academic-services/page/My_Time_Table_2023_24';

/**
 * Fetch the raw decoded HTML from the course/timetable page.
 * @param {string} cookie
 * @returns {Promise<string>}
 */
async function getCoursePage(cookie) {
  return getAcademiaPage(COURSE_PATH, cookie);
}

/**
 * Determine if a slot is a Practical slot (contains "P") or Theory.
 * @param {string} slot
 * @returns {string}
 */
function getSlotType(slot) {
  return slot.includes('P') ? 'Practical' : 'Theory';
}

/**
 * Capitalise the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parse course data from the decoded course page HTML.
 * Mirrors Go's GetCourses logic.
 *
 * @param {string} html - Decoded course page HTML
 * @returns {{ regNumber: string, courses: Object[], status: number }}
 */
function parseCourses(html) {
  const regMatch = html.match(/RA2\d{12}/);
  const regNumber = regMatch ? regMatch[0] : '';

  const TABLE_MARKER =
    `<table cellspacing="1" cellpadding="1" border="1" align="center" ` +
    `style="width:900px!important;" class="course_tbl">`;
  const parts = html.split(TABLE_MARKER);
  if (parts.length < 2) {
    return { regNumber, courses: [], status: 500, error: 'Course table not found in page' };
  }

  const tableBody = parts[1].split('</table>')[0];
  const tableHtml =
    `<table style="font-size :16px;" border="1" align="center" cellpadding="1" ` +
    `cellspacing="1" bgcolor="#FAFAD2"><tbody>` +
    tableBody +
    `</tbody></table>`;

  const $ = cheerio.load(tableHtml);
  const courses = [];

  $('tr').each((i, row) => {
    if (i === 0) return; // skip header row

    const cells = $(row).find('td');
    if (cells.length < 11) return;

    const getText = (idx) => cells.eq(idx).text().trim();

    let credit = getText(3) || 'N/A';
    let courseType = getText(6) || 'N/A';
    let faculty = getText(7) || 'N/A';
    let room = getText(9) || 'N/A';
    let slot = getText(8).replace(/-$/, ''); // trim trailing dash

    if (room !== 'N/A') {
      room = capitalizeFirst(room);
    }

    const title = getText(2).split(' \u2013')[0];

    courses.push({
      code: getText(1),
      title,
      credit,
      category: getText(4),
      courseCategory: getText(5),
      type: courseType,
      slotType: getSlotType(slot),
      faculty,
      slot,
      room,
      academicYear: getText(10),
    });
  });

  return { regNumber, courses, status: 200 };
}

/**
 * Fetch and parse courses from SRM Academia.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{ regNumber: string, courses: Object[], status: number }>}
 */
async function fetchCourses(cookie) {
  try {
    const html = await getCoursePage(cookie);
    return parseCourses(html);
  } catch (err) {
    return { regNumber: '', courses: [], status: 500, error: err.message };
  }
}

module.exports = { fetchCourses, getCoursePage, parseCourses };
