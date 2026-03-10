'use strict';

const { fetchCourses } = require('./courseScraper');
const { fetchUser } = require('./userScraper');

/**
 * Batch slot definitions – mirrors Go's TimetableHelper.go.
 * Each batch has 5 days (Day 1–5) with 10 slots each.
 */
const BATCH_1 = {
  batch: '1',
  slots: [
    { day: 1, dayOrder: 'Day 1', slots: ['A', 'A', 'F', 'F', 'G', 'P6', 'P7', 'P8', 'P9', 'P10'] },
    { day: 2, dayOrder: 'Day 2', slots: ['P11', 'P12', 'P13', 'P14', 'P15', 'B', 'B', 'G', 'G', 'A'] },
    { day: 3, dayOrder: 'Day 3', slots: ['C', 'C', 'A', 'D', 'B', 'P26', 'P27', 'P28', 'P29', 'P30'] },
    { day: 4, dayOrder: 'Day 4', slots: ['P31', 'P32', 'P33', 'P34', 'P35', 'D', 'D', 'B', 'E', 'C'] },
    { day: 5, dayOrder: 'Day 5', slots: ['E', 'E', 'C', 'F', 'D', 'P46', 'P47', 'P48', 'P49', 'P50'] },
  ],
};

const BATCH_2 = {
  batch: '2',
  slots: [
    { day: 1, dayOrder: 'Day 1', slots: ['P1', 'P2', 'P3', 'P4', 'P5', 'A', 'A', 'F', 'F', 'G'] },
    { day: 2, dayOrder: 'Day 2', slots: ['B', 'B', 'G', 'G', 'A', 'P16', 'P17', 'P18', 'P19', 'P20'] },
    { day: 3, dayOrder: 'Day 3', slots: ['P21', 'P22', 'P23', 'P24', 'P25', 'C', 'C', 'A', 'D', 'B'] },
    { day: 4, dayOrder: 'Day 4', slots: ['D', 'D', 'B', 'E', 'C', 'P36', 'P37', 'P38', 'P39', 'P40'] },
    { day: 5, dayOrder: 'Day 5', slots: ['P41', 'P42', 'P43', 'P44', 'P45', 'E', 'E', 'C', 'F', 'D'] },
  ],
};

/**
 * Deduplicate an array of strings, preserving order.
 * @param {string[]} arr
 * @returns {string[]}
 */
function unique(arr) {
  const seen = new Set();
  return arr.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

/**
 * Build a slot-to-TableSlot mapping from the list of courses.
 *
 * A course slot string may be a single slot ("A") or a hyphen-separated
 * range ("P1-P2-P3").
 *
 * @param {Object[]} courses
 * @returns {Object} Map of slotName → TableSlot[]
 */
function buildSlotMap(courses) {
  const slotMap = {};

  for (const course of courses) {
    const slotStr = course.slot || '';
    const slots = slotStr.includes('-') ? slotStr.split('-') : [slotStr];
    const isOnline = (course.room || '').toLowerCase().includes('online');
    const courseType = isOnline ? 'Practical' : course.slotType || 'Theory';

    for (const slot of slots) {
      const trimmed = slot.trim();
      if (!trimmed) continue;

      const tableSlot = {
        code: course.code,
        name: course.title,
        slot: trimmed,
        roomNo: course.room,
        courseType,
        online: isOnline,
        isOptional: false,
      };

      if (!slotMap[trimmed]) slotMap[trimmed] = [];
      slotMap[trimmed].push(tableSlot);
    }
  }

  return slotMap;
}

/**
 * Map course slots onto the batch schedule.
 * @param {Object} batch - One of BATCH_1 or BATCH_2
 * @param {Object} slotMap - Output of buildSlotMap()
 * @returns {Object[]} Array of DaySchedule objects
 */
function mapSlotsToSchedule(batch, slotMap) {
  const schedule = [];

  for (const day of batch.slots) {
    const table = day.slots.map((slot) => {
      const entries = slotMap[slot];
      if (!entries || entries.length === 0) return null;
      if (entries.length === 1) return entries[0];

      // Merge multiple courses sharing the same slot
      return {
        code: unique(entries.map((e) => e.code)).join('/'),
        name: unique(entries.map((e) => e.name)).join('/'),
        slot,
        roomNo: unique(entries.map((e) => e.roomNo)).join('/'),
        courseType: entries[0].courseType,
        online: entries[0].online,
        isOptional: false,
      };
    });

    schedule.push({ day: day.day, table });
  }

  return schedule;
}

/**
 * Select the correct batch based on the student's batch number from user profile.
 * Defaults to batch 1 if the batch number is unknown.
 *
 * @param {number|string} batchNum
 * @returns {Object} BATCH_1 or BATCH_2
 */
function selectBatch(batchNum) {
  const n = parseInt(String(batchNum), 10);
  return n === 2 ? BATCH_2 : BATCH_1;
}

/**
 * Fetch and build the timetable for the authenticated student.
 * @param {string} cookie - Session cookie
 * @returns {Promise<{ regNumber: string, batch: string, schedule: Object[] }>}
 */
async function fetchTimetable(cookie) {
  try {
    const [courseData, userData] = await Promise.all([
      fetchCourses(cookie),
      fetchUser(cookie),
    ]);

    const batchNum = parseInt(String(userData.batch || '1'), 10) || 1;
    const batch = selectBatch(batchNum);
    const slotMap = buildSlotMap(courseData.courses);
    const schedule = mapSlotsToSchedule(batch, slotMap);

    return {
      regNumber: courseData.regNumber,
      batch: batch.batch,
      schedule,
    };
  } catch (err) {
    return { regNumber: '', batch: '1', schedule: [], status: 500, error: err.message };
  }
}

module.exports = { fetchTimetable };
