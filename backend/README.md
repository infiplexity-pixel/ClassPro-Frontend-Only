# ClassPro Backend (Node.js / ScrapeNinja)

JavaScript/Node.js replacement for the original Go backend (`goscraper`). Uses **ScrapeNinja via RapidAPI** for all web scraping operations against SRM Academia.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| HTTP Client | Axios |
| HTML Parsing | Cheerio |
| Scraping Proxy | ScrapeNinja (RapidAPI) |
| Environment | dotenv |

---

## Prerequisites

- Node.js >= 16.0.0
- An active [RapidAPI](https://rapidapi.com) account subscribed to [ScrapeNinja](https://rapidapi.com/restyler/api/scrapeninja)

---

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and fill in your RAPIDAPI_KEY
   ```

3. **Start the server**
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RAPIDAPI_KEY` | ✅ | Your RapidAPI key for ScrapeNinja |
| `PORT` | No | Server port (default: `8080`) |
| `NODE_ENV` | No | `development` or `production` |
| `URL` | No | Comma-separated list of allowed CORS origins |
| `SUPABASE_URL` | No | Supabase project URL (optional database) |
| `SUPABASE_KEY` | No | Supabase anon key (optional database) |

---

## API Endpoints

All protected endpoints require the `X-CSRF-Token` header (base64-encoded JSON containing the session cookie obtained from `/login`).

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/hello` | Health check |
| `GET` | `/captcha/:cdigest` | Fetch captcha image |
| `POST` | `/login` | Authenticate with SRM Academia |
| `POST` | `/logout` | Invalidate session |

### Protected (require `X-CSRF-Token`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/attendance` | Attendance records |
| `GET` | `/marks` | Marks data |
| `GET` | `/courses` | Course list |
| `GET` | `/timetable` | Weekly timetable |
| `GET` | `/calendar` | Academic calendar |
| `GET` | `/user` | User profile |
| `GET` | `/all` | All data in one request |

### Login Request Body

```json
{
  "username": "your_srm_username",
  "password": "your_srm_password",
  "captcha": "captcha_text",
  "cdigest": "captcha_digest_from_captcha_endpoint",
  "cookies": "optional_pre_existing_cookies"
}
```

---

## ScrapeNinja Configuration

Every outbound request is proxied through ScrapeNinja with the following settings:

```js
{
  geo: 'in',          // Route through India
  retryNum: 2,        // Retry up to 2 times
  js: false,          // No JavaScript rendering (faster)
  blockImages: true,  // Skip image downloads
  blockMedia: true    // Skip media downloads
}
```

---

## Docker Deployment

```bash
# Build and run with Docker Compose
docker compose up --build

# Or with custom port
PORT=9090 docker compose up --build
```

The `Dockerfile` uses `node:18-alpine` for a minimal image. A built-in HEALTHCHECK pings `/hello` every 30 seconds.

---

## Rate Limiting

The server enforces **25 requests per minute per IP address** to protect the upstream ScrapeNinja quota.

---

## Notes

- ScrapeNinja adds ~500–1000 ms overhead compared to direct requests, but handles anti-bot measures automatically.
- The frontend communicates with this backend through the `NEXT_PUBLIC_URL` environment variable.
- The server listens on `0.0.0.0:${PORT}` and is ready for container deployment.
