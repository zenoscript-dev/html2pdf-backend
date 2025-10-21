import { Injectable } from "@nestjs/common";
import { config } from "dotenv";

@Injectable()
export class ConfigService {
  constructor() {
    config();
  }

  get port(): number {
    return parseInt(process.env.PORT || "5000", 10);
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV || "development";
  }

  get maxFileSize(): number {
    return parseInt(process.env.MAX_FILE_SIZE || "5242880", 10); // 5MB default
  }

  get puppeteerTimeout(): number {
    return parseInt(process.env.PUPPETEER_TIMEOUT || "30000", 10); // 30 seconds default
  }

  get corsOrigin(): string {
    return process.env.CORS_ORIGIN || "*";
  }

  get rateLimitTtl(): number {
    return parseInt(process.env.RATE_LIMIT_TTL || "60", 10); // 1 minute default
  }

  get rateLimitMax(): number {
    return parseInt(process.env.RATE_LIMIT_MAX || "10", 10); // 10 requests per minute default
  }

  get puppeteerArgs(): string[] {
    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ];

    return this.nodeEnv === "production"
      ? [...baseArgs, "--headless"]
      : baseArgs;
  }

  get puppeteerExecPath(): string | undefined {
    return process.env.PUPPETEER_EXEC_PATH;
  }

  get maxConcurrentJobs(): number {
    return parseInt(process.env.MAX_CONCURRENT_JOBS || "5", 10);
  }
}
