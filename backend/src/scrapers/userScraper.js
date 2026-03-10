'use strict';

const cheerio = require('cheerio');
const ScrapeNinjaClient = require('./scrapeNinja');

const USER_URL =
  'https://academia.srmist.edu.in/srmAcademia/pages/studentprofile/ajaxPages/getStudentProfiledata.action';

/**
 * Derive the academic year from an SRM registration number.
 * SRM reg numbers start with the 2-digit year of joining (e.g. RA2111003010401 → 2021).
 * @param {string} regNumber
 * @returns {number} Current academic year (1–4)
 */
function calculateYear(regNumber) {
  if (!regNumber || regNumber.length < 4) return 1;

  // Extract 2-digit year from the reg number (positions 2–3 after "RA")
  const raw = regNumber.replace(/^[A-Za-z]+/, '');
  const joinYearShort = global.parseInt(raw.substring(0, 2), 10);
  if (Number.isNaN(joinYearShort)) return 1;

  const joinYear = joinYearShort + 2000;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-indexed

  // Academic year starts in July (month 7)
  const academicYear = currentMonth >= 7 ? currentYear : currentYear - 1;
  const year = academicYear - joinYear + 1;

  return Math.min(Math.max(year, 1), 4);
}

/**
 * Fetch and parse user profile information from SRM Academia.
 * @param {string} cookie - Session cookie string
 * @returns {Promise<Object>} User profile data
 */
async function fetchUser(cookie) {
  const client = new ScrapeNinjaClient(cookie);
  const result = await client.scrape(USER_URL, 'GET', '', {
    Accept: 'text/html, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const $ = cheerio.load(result.body);

  // SRM profile page stores data in labelled table rows or definition lists
  const data = {};
  $('tr, .profile-row').each((_, row) => {
    const label = $(row).find('th, .label, td:first-child').text().trim().toLowerCase();
    const value = $(row).find('td:last-child, .value').text().trim();
    if (label && value) {
      data[label] = value;
    }
  });

  const name =
    data['student name'] || data['name'] || $('h2, h3, .student-name').first().text().trim() || '';
  const regNumber =
    data['registration number'] || data['reg no'] || data['reg. no.'] || '';
  const department =
    data['department'] || data['dept'] || data['program'] || '';
  const section = data['section'] || data['sec'] || '';
  const semester = data['semester'] || data['sem'] || '';
  const batch = data['batch'] || data['academic year'] || '';
  const email = data['email'] || data['email id'] || '';
  const mobile = data['mobile'] || data['mobile no'] || data['phone'] || '';
  const gender = data['gender'] || '';
  const dob = data['date of birth'] || data['dob'] || '';

  return {
    name,
    regNumber,
    department,
    section,
    semester,
    batch,
    email,
    mobile,
    gender,
    dob,
    year: calculateYear(regNumber),
  };
}

module.exports = { fetchUser };
