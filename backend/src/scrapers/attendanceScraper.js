'use strict';

const cheerio = require('cheerio');
const { getAcademiaPage } = require('./academiaClient');

const ATTENDANCE_PATH =
  '/srm_university/academia-academic-services/page/My_Attendance';

/**
 * Fetch the raw decoded HTML from the attendance page.
 * @param {string} cookie
 * @returns {Promise<string>}
 */
async function getAttendancePage(cookie) {
  return getAcademiaPage(ATTENDANCE_PATH, cookie);
}

/**
 * Extract the registration number from the page HTML.
 * @param {string} html
 * @returns {string}
 */
function extractRegNumber(html) {
  const m = html.match(/RA2\d{12}/);
  return m ? m[0] : '';
}

/**
 * Parse attendance records from the decoded HTML.
 * Mirrors Go's ScrapeAttendance logic.
 *
 * The table we need begins at:
 *   <table style="font-size :16px;" ...>
 * Each course row has a courseCode cell matching /^\d.{9,}/ or containing "regular".
 *
 * @param {string} html - Decoded attendance page HTML
 * @returns {{ regNumber: string, attendance: Object[], status: number }}
 */
function parseAttendance(html) {
  const regNumber = extractRegNumber(html);

  // Remove placeholder " - " cells so they don't count as data
  let body = html.replace(
    /<td\s+bgcolor='#E6E6FA'\s+style='text-align:center'>\s*-\s*<\/td>/gi,
    '',
  );

  // Extract just the attendance table
  const TABLE_START =
    `<table style="font-size :16px;" border="1" align="center" ` +
    `cellpadding="1" cellspacing="1" bgcolor="#FAFAD2">`;
  const parts = body.split(TABLE_START);
  if (parts.length < 2) {
    return { regNumber, attendance: [], status: 200 };
  }
  const tableHtml = TABLE_START + parts[1].split('</table>')[0] + '</table>';

  const $ = cheerio.load(tableHtml);
  const attendance = [];

  $("td[bgcolor='#E6E6FA']").each((_, cell) => {
    const $cell = $(cell);
    const courseCode = $cell.text().trim();

    // Only process rows with a real course code (starts with digit, length > 10)
    // or contains "regular"
    const isValidCode =
      (courseCode.length > 10 && /^\d/.test(courseCode)) ||
      courseCode.toLowerCase().includes('regular');
    if (!isValidCode) return;

    const siblings = $cell.nextAll('td');
    const courseTitle = siblings.eq(0).text().split(' \u2013')[0].trim();
    const category = siblings.eq(1).text().trim();
    const facultyName = siblings.eq(2).text().trim();
    const slot = siblings.eq(3).text().trim();
    const hoursConducted = siblings.eq(5).text().trim();
    const hoursAbsent = siblings.eq(6).text().trim();

    const conducted = parseFloat(hoursConducted) || 0;
    const absent = parseFloat(hoursAbsent) || 0;
    const percentage =
      conducted > 0
        ? (((conducted - absent) / conducted) * 100).toFixed(2)
        : '0.00';

    const cleanCode = courseCode.replace(/regular/gi, '').trim();

    if (courseTitle.toLowerCase() !== 'null') {
      attendance.push({
        courseCode: cleanCode,
        courseTitle,
        category,
        facultyName,
        slot,
        hoursConducted,
        hoursAbsent,
        attendancePercentage: percentage,
      });
    }
  });

  return { regNumber, attendance, status: 200 };
}

/**
 * Parse marks from the decoded HTML.
 * Mirrors Go's ScrapeMarks logic.
 *
 * @param {string} html - Decoded attendance page HTML
 * @param {Object[]} attendanceList - Already-parsed attendance records (for course name lookup)
 * @returns {{ regNumber: string, marks: Object[], status: number }}
 */
function parseMarks(html, attendanceList, regNumber) {
  // Build a courseCode → courseTitle map
  const courseMap = {};
  for (const a of attendanceList) {
    courseMap[a.courseCode] = a.courseTitle;
  }

  // The marks table starts after the attendance table
  const MARKS_TABLE_START = `<table border="1" align="center" cellpadding="1" cellspacing="1">`;
  const parts = html.split(MARKS_TABLE_START);
  if (parts.length < 2) {
    return { regNumber, marks: [], status: 200 };
  }

  // Cut at the wide table that follows marks
  let marksSection = parts[1].split(
    `<table  width=800px;"border="0"cellspacing="1"cellpadding="1">`,
  )[0];
  marksSection = marksSection.split('<br />')[0];
  marksSection = MARKS_TABLE_START + marksSection;

  const $ = cheerio.load(marksSection);

  // Normalize known HTML artifacts
  let processedHtml = $.html();
  processedHtml = processedHtml.replace(
    /<table style="font-size" :6;="" border="2" cellpadding="1" cellspacing="1"><tbody><tr><td>/g,
    '',
  );
  processedHtml = processedHtml.replace(/<\/td><\/tr>/g, '');

  const $p = cheerio.load(processedHtml);
  const rowsTables = processedHtml.split('</table></td>');

  const marks = [];

  for (const tableHtml of rowsTables) {
    const $t = cheerio.load(tableHtml);
    $t('tr').each((_, row) => {
      const cells = $t(row).find('td');
      const courseCode = cells.eq(0).text().trim();
      const courseType = cells.eq(1).text().trim();

      if (!courseCode) return;

      const testPerformance = [];
      let overallScored = 0;
      let overallTotal = 0;

      cells.eq(2).find('table td').each((_, testCell) => {
        const text = $t(testCell).text().trim();
        const parts = text.split('.00');
        if (parts.length >= 2) {
          const nameParts = parts[0].split('/');
          const testTitle = nameParts[0];
          const total = parseFloat(nameParts[1]) || 0;
          const scoredStr = parts[1].trim();
          const scored = scoredStr === 'Abs' ? 0 : parseFloat(scoredStr) || 0;

          testPerformance.push({
            test: testTitle,
            marks: {
              scored: scoredStr === 'Abs' ? 'Abs' : scored.toFixed(2),
              total: total.toFixed(2),
            },
          });

          overallScored += scored;
          overallTotal += total;
        }
      });

      marks.push({
        courseName: courseMap[courseCode] || courseCode,
        courseCode,
        courseType,
        overall: {
          scored: overallScored.toFixed(2),
          total: overallTotal.toFixed(2),
        },
        testPerformance,
      });
    });
  }

  // Sort: Theory first, then Practical
  const theory = marks.filter((m) => m.courseType === 'Theory');
  const practical = marks.filter((m) => m.courseType === 'Practical');
  const sortedMarks = [...theory, ...practical];

  return { regNumber, marks: sortedMarks, status: 200 };
}

/**
 * Fetch and parse attendance data from SRM Academia.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{ regNumber: string, attendance: Object[], status: number }>}
 */
async function fetchAttendance(cookie) {
  try {
    const html = await getAttendancePage(cookie);
    return parseAttendance(html);
  } catch (err) {
    return { regNumber: '', attendance: [], status: 500, error: err.message };
  }
}

/**
 * Fetch and parse marks data from SRM Academia.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{ regNumber: string, marks: Object[], status: number }>}
 */
async function fetchMarks(cookie) {
  try {
    const html = await getAttendancePage(cookie);
    const { regNumber, attendance } = parseAttendance(html);
    return parseMarks(html, attendance, regNumber);
  } catch (err) {
    return { regNumber: '', marks: [], status: 500, error: err.message };
  }
}

module.exports = { fetchAttendance, fetchMarks };
