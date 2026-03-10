'use strict';

const cheerio = require('cheerio');
const { getAcademiaPage } = require('./academiaClient');

const CALENDAR_PATH =
  '/srm_university/academia-academic-services/page/Academic_Planner_2025_26_EVEN';

// Month names (Jan-indexed 0) for sorting and lookup
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parse the academic calendar from the decoded HTML.
 * Mirrors Go's CalendarHelper.parseCalendar logic.
 *
 * The page has a multi-column layout where each group of 5 columns
 * represents one month:
 *   col 0: date, col 1: day, col 2: event, col 3: dayOrder, col 4: spacer
 *   (then the same 5-column block repeats for the next month, starting at pad+0)
 *
 * Month headings are in <th> cells that contain "'2" (e.g. "Jan'25").
 *
 * @param {string} html - Decoded calendar HTML
 * @returns {Object} CalendarResponse
 */
function parseCalendar(html) {
  const $ = cheerio.load(html);

  // Collect month headers (cells that look like "Jan'25", "Feb'25" etc.)
  const monthHeaders = [];
  $('th').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes("'2")) {
      monthHeaders.push(text);
    }
  });

  if (monthHeaders.length === 0) {
    return { error: true, message: 'No month headers found', status: 500, calendar: [], today: null, tomorrow: null, index: 0 };
  }

  // Initialise one CalendarMonth entry per header
  const data = monthHeaders.map((month) => ({ month, days: [] }));

  // Walk all table rows, extract (date, day, event, dayOrder) for each month column
  $('table tr').each((_, row) => {
    const tds = $(row).find('td');
    monthHeaders.forEach((_, i) => {
      const pad = i * 5; // 5 columns per month (index includes a spacer col)
      const date = tds.eq(pad).text().trim();
      const day = tds.eq(pad + 1).text().trim();
      const event = tds.eq(pad + 2).text().trim();
      const dayOrder = tds.eq(pad + 3).text().trim();

      if (date && dayOrder) {
        data[i].days.push({ date, day, event, dayOrder });
      }
    });
  });

  // Sort months chronologically and sort days within each month
  const sorted = sortCalendarData(data);

  // Determine today and tomorrow
  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()]; // e.g. "Mar"
  let monthIndex = 0;
  let monthEntry = sorted[0];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].month.startsWith(currentMonthName)) {
      monthEntry = sorted[i];
      monthIndex = i;
      break;
    }
  }

  let today = null;
  let tomorrow = null;

  if (monthEntry && monthEntry.days.length > 0) {
    const todayDateStr = String(now.getDate());
    const todayIdx = monthEntry.days.findIndex((d) => d.date === todayDateStr);
    if (todayIdx >= 0) {
      today = monthEntry.days[todayIdx];
      const tomorrowIdx = todayIdx + 1;
      if (tomorrowIdx < monthEntry.days.length) {
        tomorrow = monthEntry.days[tomorrowIdx];
      } else if (monthIndex + 1 < sorted.length && sorted[monthIndex + 1].days.length > 0) {
        tomorrow = sorted[monthIndex + 1].days[0];
      }
    }
  }

  return {
    error: false,
    status: 200,
    today,
    tomorrow,
    index: monthIndex,
    calendar: sorted,
  };
}

/**
 * Sort calendar months chronologically, and sort days within each month numerically.
 * Mirrors Go's SortCalendarData.
 *
 * @param {Object[]} data
 * @returns {Object[]}
 */
function sortCalendarData(data) {
  const monthIndex = Object.fromEntries(MONTH_NAMES.map((m, i) => [m, i]));

  // Sort months
  const sorted = [...data].sort((a, b) => {
    const ma = a.month.substring(0, 3);
    const mb = b.month.substring(0, 3);
    return (monthIndex[ma] ?? 99) - (monthIndex[mb] ?? 99);
  });

  // Sort days within each month
  for (const month of sorted) {
    month.days.sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));
  }

  return sorted;
}

/**
 * Fetch and parse the academic calendar.
 * @param {string} cookie - Session cookie
 * @returns {Promise<Object>} CalendarResponse
 */
async function fetchCalendar(cookie) {
  try {
    const html = await getAcademiaPage(CALENDAR_PATH, cookie, {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
    });
    return parseCalendar(html);
  } catch (err) {
    return {
      error: true,
      message: err.message,
      status: 500,
      calendar: [],
      today: null,
      tomorrow: null,
      index: 0,
    };
  }
}

module.exports = { fetchCalendar };
