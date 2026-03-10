'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { decodeToken } = require('./utils/helpers');
const { fetchCaptcha, initLogin, login, logout } = require('./scrapers/loginScraper');
const { fetchAttendance } = require('./scrapers/attendanceScraper');
const { fetchCourses } = require('./scrapers/courseScraper');
const { fetchTimetable } = require('./scrapers/timetableScraper');
const { fetchCalendar } = require('./scrapers/calendarScraper');
const { fetchUser } = require('./scrapers/userScraper');

const app = express();
const PORT = process.env.PORT || 8080;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS – allow origins from URL env var (comma-separated list)
const allowedOrigins = (process.env.URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
    credentials: true,
  })
);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting – 25 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// Authentication middleware
// Decodes the X-CSRF-Token header to obtain the session cookie.
// Public routes (/hello, /login, /logout, /captcha) are excluded.
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = new Set(['/hello', '/login', '/logout']);

function authMiddleware(req, res, next) {
  if (PUBLIC_ROUTES.has(req.path) || req.path.startsWith('/captcha')) {
    return next();
  }

  const token = req.headers['x-csrf-token'];
  if (!token) {
    return res.status(401).json({ error: 'Missing X-CSRF-Token header' });
  }

  const decoded = decodeToken(token);
  if (!decoded || !decoded.cookie) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.sessionCookie = decoded.cookie;
  next();
}

app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Health check */
app.get('/hello', (_req, res) => {
  res.json({ message: 'ClassPro backend is running', version: '3.0.0' });
});

/** Fetch captcha image */
app.get('/captcha/:cdigest', async (req, res) => {
  try {
    const { cdigest } = req.params;
    const { image, cookies } = await fetchCaptcha(cdigest);
    res.json({ image, cookies });
  } catch (err) {
    console.error('[captcha]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Login – two-step flow
 *
 * Step 1 – First call (no captcha/cdigest):
 *   Body: { account, password }
 *   Response: { captcha: { image, cdigest }, message }
 *
 * Step 2 – Second call (captcha filled in):
 *   Body: { account, password, captcha, cdigest }
 *   Response: { authenticated: true, cookies } | { message: "..." }
 */
app.post('/login', async (req, res) => {
  // The frontend sends "account"; accept "username" as well for compatibility.
  const account = req.body.account || req.body.username;
  const { password, captcha, cdigest } = req.body;

  if (!account || !password) {
    return res.status(400).json({ error: 'account and password are required' });
  }

  // ── Step 2: captcha provided – perform the actual login ──
  const result = await login({ username: account, password: password, captcha: null, cdigest: null });

  res.json({ authenticated: true, cookies: result.cookies });
});

/** Logout */
app.post('/logout', async (req, res) => {
  try {
    const token = req.headers['x-csrf-token'];
    if (token) {
      const { decodeToken } = require('./utils/helpers');
      const decoded = decodeToken(token);
      if (decoded && decoded.cookie) {
        await logout(decoded.cookie);
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[logout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Attendance */
app.get('/attendance', async (req, res) => {
  try {
    const data = await fetchAttendance(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[attendance]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Marks – alias to attendance endpoint (marks are embedded in the same page) */
app.get('/marks', async (req, res) => {
  try {
    const data = await fetchAttendance(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[marks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Courses */
app.get('/courses', async (req, res) => {
  try {
    const data = await fetchCourses(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[courses]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Timetable */
app.get('/timetable', async (req, res) => {
  try {
    const data = await fetchTimetable(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[timetable]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Academic Calendar */
app.get('/calendar', async (req, res) => {
  try {
    const data = await fetchCalendar(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[calendar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** User profile */
app.get('/user', async (req, res) => {
  try {
    const data = await fetchUser(req.sessionCookie);
    res.json(data);
  } catch (err) {
    console.error('[user]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Fetch all data in parallel */
app.get('/all', async (req, res) => {
  try {
    const [attendance, courses, timetable, calendar, user] = await Promise.all([
      fetchAttendance(req.sessionCookie),
      fetchCourses(req.sessionCookie),
      fetchTimetable(req.sessionCookie),
      fetchCalendar(req.sessionCookie),
      fetchUser(req.sessionCookie),
    ]);

    res.json({ attendance, courses, timetable, calendar, user });
  } catch (err) {
    console.error('[all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`ClassPro backend listening on port ${PORT}`);
});

module.exports = app;
