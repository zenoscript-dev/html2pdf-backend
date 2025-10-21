import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "./config.service";

describe("ConfigService", () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("port", () => {
    it("should return default port when not set", () => {
      delete process.env.PORT;
      expect(service.port).toBe(6100);
    });

    it("should return configured port", () => {
      process.env.PORT = "3000";
      expect(service.port).toBe(3000);
    });
  });

  describe("nodeEnv", () => {
    it("should return default environment when not set", () => {
      delete process.env.NODE_ENV;
      expect(service.nodeEnv).toBe("development");
    });

    it("should return configured environment", () => {
      process.env.NODE_ENV = "production";
      expect(service.nodeEnv).toBe("production");
    });
  });

  describe("maxFileSize", () => {
    it("should return default file size when not set", () => {
      delete process.env.MAX_FILE_SIZE;
      expect(service.maxFileSize).toBe(5242880); // 5MB
    });

    it("should return configured file size", () => {
      process.env.MAX_FILE_SIZE = "10485760"; // 10MB
      expect(service.maxFileSize).toBe(10485760);
    });
  });

  describe("puppeteerTimeout", () => {
    it("should return default timeout when not set", () => {
      delete process.env.PUPPETEER_TIMEOUT;
      expect(service.puppeteerTimeout).toBe(30000); // 30 seconds
    });

    it("should return configured timeout", () => {
      process.env.PUPPETEER_TIMEOUT = "60000"; // 60 seconds
      expect(service.puppeteerTimeout).toBe(60000);
    });
  });

  describe("puppeteerArgs", () => {
    it("should return minimal args in development", () => {
      process.env.NODE_ENV = "development";
      const args = service.puppeteerArgs;
      expect(args).toEqual([
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ]);
    });

    it("should include headless in production", () => {
      process.env.NODE_ENV = "production";
      const args = service.puppeteerArgs;
      expect(args).toContain("--headless");
    });
  });

  describe("corsOrigin", () => {
    it("should return default origin when not set", () => {
      delete process.env.CORS_ORIGIN;
      expect(service.corsOrigin).toBe("*");
    });

    it("should return configured origin", () => {
      process.env.CORS_ORIGIN = "https://example.com";
      expect(service.corsOrigin).toBe("https://example.com");
    });
  });

  describe("rateLimitTtl", () => {
    it("should return default TTL when not set", () => {
      delete process.env.RATE_LIMIT_TTL;
      expect(service.rateLimitTtl).toBe(60); // 1 minute
    });

    it("should return configured TTL", () => {
      process.env.RATE_LIMIT_TTL = "120";
      expect(service.rateLimitTtl).toBe(120);
    });
  });

  describe("rateLimitMax", () => {
    it("should return default limit when not set", () => {
      delete process.env.RATE_LIMIT_MAX;
      expect(service.rateLimitMax).toBe(10); // 10 requests
    });

    it("should return configured limit", () => {
      process.env.RATE_LIMIT_MAX = "20";
      expect(service.rateLimitMax).toBe(20);
    });
  });

  describe("maxConcurrentJobs", () => {
    it("should return default limit when not set", () => {
      delete process.env.MAX_CONCURRENT_JOBS;
      expect(service.maxConcurrentJobs).toBe(5);
    });

    it("should return configured limit", () => {
      process.env.MAX_CONCURRENT_JOBS = "10";
      expect(service.maxConcurrentJobs).toBe(10);
    });
  });
});
