'use strict';

const cheerio = require('cheerio');
const { getCoursePage, parseCourses } = require('./courseScraper');

/**
 * Calculate the student's current year from their registration number.
 * SRM reg numbers: RA2<YY><rest> where YY is the 2-digit joining year.
 * Mirrors Go's getYear logic.
 *
 * @param {string} regNumber
 * @returns {number} 1–4
 */
function getYear(regNumber) {
  if (!regNumber || regNumber.length < 4) return 1;

  const raw = regNumber.replace(/^[A-Za-z]+/, '');
  const joinYearShort = parseInt(raw.substring(0, 2), 10);
  if (isNaN(joinYearShort)) return 1;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentYearShort = currentYear % 100;
  const currentMonth = now.getMonth() + 1; // 1-indexed

  let academicYear = currentYearShort;
  if (currentMonth >= 7) academicYear++;

  let studentYear = academicYear - joinYearShort;
  if (joinYearShort > currentYearShort) studentYear--;

  return Math.min(Math.max(studentYear, 1), 4);
}

/**
 * Parse user profile from the decoded course page HTML.
 * Mirrors Go's GetUser + getUserHelper logic.
 *
 * The user table is:
 *   <table border="0" align="left" cellpadding="1" cellspacing="1" style="width:900px;">
 *
 * @param {string} html - Decoded course page HTML
 * @param {string} regNumber - Registration number (extracted separately)
 * @returns {Object} User profile
 */
function parseUser(html, regNumber) {
  const TABLE_START =
    `<table border="0" align="left" cellpadding="1" cellspacing="1" style="width:900px;">`;

  const parts = html.split(TABLE_START);
  if (parts.length < 2) {
    return { regNumber, year: getYear(regNumber) };
  }

  const tableHtml = TABLE_START + parts[1].split('</table>')[0] + '</table>';
  const $ = cheerio.load(tableHtml);

  const user = {
    name: '',
    mobile: '',
    program: '',
    semester: 0,
    regNumber,
    combo: '',
    batch: '',
    year: getYear(regNumber),
    department: '',
    section: '',
    specialization: '',
  };

  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    for (let i = 0; i < cells.length; i += 2) {
      const key = cells.eq(i).text().replace(/:$/, '').trim();
      const valueCell = cells.eq(i + 1);

      switch (key) {
        case 'Name':
          user.name = valueCell.text().trim();
          break;
        case 'Program':
          user.program = valueCell.text().trim();
          break;
        case 'Combo / Batch': {
          const fullText = valueCell.text().trim();
          const batchFont = valueCell.find('font').text().trim();
          user.combo = fullText;
          user.batch = batchFont || fullText;
          break;
        }
        case 'Mobile':
          user.mobile = valueCell.text().trim();
          break;
        case 'Semester':
          user.semester = parseInt(valueCell.text().trim(), 10) || 0;
          break;
        case 'Department': {
          const deptText = valueCell.text().trim();
          const arr = deptText.split('-');
          user.department = arr[0].trim();
          if (arr.length > 1) {
            let section = arr[1].trim();
            section = section.replace(/^\(/, '').replace(/ Section\)$/, '');
            user.section = section.trim();
          }
          break;
        }
        default:
          break;
      }
    }
  });

  return user;
}

/**
 * Fetch and parse user profile from SRM Academia.
 * @param {string} cookie - Session cookie
 * @returns {Promise<Object>} User profile data
 */
async function fetchUser(cookie) {
  try {
    const html = await getCoursePage(cookie);
    const { regNumber } = parseCourses(html);
    return parseUser(html, regNumber);
  } catch (err) {
    return { regNumber: '', year: 1, status: 500, error: err.message };
  }
}

module.exports = { fetchUser };
