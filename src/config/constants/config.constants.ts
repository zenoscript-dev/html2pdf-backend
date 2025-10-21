export const DEFAULT_PORT = 6100;
export const DEFAULT_MAX_FILE_SIZE = 5242880; // 5MB
export const DEFAULT_PUPPETEER_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_RATE_LIMIT_TTL = 60; // 1 minute
export const DEFAULT_RATE_LIMIT_MAX = 10; // 10 requests per minute
export const DEFAULT_MAX_CONCURRENT_JOBS = 5;

export const BASE_PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
  "--disable-extensions",
];
