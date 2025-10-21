import { Injectable } from "@nestjs/common";
import { config } from "dotenv";
import {
  BASE_PUPPETEER_ARGS,
  DEFAULT_MAX_CONCURRENT_JOBS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_PORT,
  DEFAULT_PUPPETEER_TIMEOUT,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_TTL,
} from "../constants/config.constants";
import { Config } from "../interfaces/config.interface";

@Injectable()
export class ConfigService implements Config {
  constructor() {
    config();
  }

  get port(): number {
    return parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV || "development";
  }

  get maxFileSize(): number {
    return parseInt(
      process.env.MAX_FILE_SIZE || String(DEFAULT_MAX_FILE_SIZE),
      10
    );
  }

  get puppeteerTimeout(): number {
    return parseInt(
      process.env.PUPPETEER_TIMEOUT || String(DEFAULT_PUPPETEER_TIMEOUT),
      10
    );
  }

  get corsOrigin(): string {
    return process.env.CORS_ORIGIN || "*";
  }

  get rateLimitTtl(): number {
    return parseInt(
      process.env.RATE_LIMIT_TTL || String(DEFAULT_RATE_LIMIT_TTL),
      10
    );
  }

  get rateLimitMax(): number {
    return parseInt(
      process.env.RATE_LIMIT_MAX || String(DEFAULT_RATE_LIMIT_MAX),
      10
    );
  }

  get puppeteerArgs(): string[] {
    return this.nodeEnv === "production"
      ? [...BASE_PUPPETEER_ARGS, "--headless"]
      : BASE_PUPPETEER_ARGS;
  }

  get puppeteerExecPath(): string | undefined {
    return process.env.PUPPETEER_EXEC_PATH;
  }

  get maxConcurrentJobs(): number {
    return parseInt(
      process.env.MAX_CONCURRENT_JOBS || String(DEFAULT_MAX_CONCURRENT_JOBS),
      10
    );
  }
}
