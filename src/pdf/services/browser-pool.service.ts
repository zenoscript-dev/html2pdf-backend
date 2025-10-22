import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as puppeteer from "puppeteer";
import { Browser, Page } from "puppeteer";

@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browser: Browser | null = null;
  private isInitialized = false;
  private readonly maxPagesPerBrowser = 10;
  private activePages = 0;

  async onModuleInit() {
    await this.initializeBrowser();
  }

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  private async initializeBrowser(): Promise<void> {
    if (this.isInitialized && this.browser) {
      return;
    }

    try {
      this.logger.log("Initializing shared browser instance...");

      this.browser = await puppeteer.launch({
        headless: true,
        channel: "chrome",
        executablePath: process.env.CHROME_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins",
          "--disable-site-isolation-trials",
          "--disable-dev-shm-usage",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--window-size=1920,1080",
          "--hide-scrollbars",
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins",
          "--disable-site-isolation-trials",
          "--autoplay-policy=user-gesture-required",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-client-side-phishing-detection",
          "--disable-component-update",
          "--disable-default-apps",
          "--disable-domain-reliability",
          "--disable-extensions",
          "--disable-features=AudioServiceOutOfProcess",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-notifications",
          "--disable-offer-store-unmasked-wallet-cards",
          "--disable-popup-blocking",
          "--disable-print-preview",
          "--disable-prompt-on-repost",
          "--disable-renderer-backgrounding",
          "--disable-speech-api",
          "--disable-sync",
          "--ignore-gpu-blacklist",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-first-run",
          "--no-pings",
          "--password-store=basic",
          "--use-gl=swiftshader",
          "--use-mock-keychain",
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });

      // Set up browser event listeners
      this.browser.on("disconnected", () => {
        this.logger.warn("Browser disconnected unexpectedly");
        this.browser = null;
        this.isInitialized = false;
        this.activePages = 0;
      });

      this.browser.on("targetcreated", (target) => {
        this.logger.debug(`New target created: ${target.type()}`);
      });

      this.browser.on("targetdestroyed", (target) => {
        this.logger.debug(`Target destroyed: ${target.type()}`);
        this.activePages = Math.max(0, this.activePages - 1);
      });

      this.isInitialized = true;
      this.logger.log("Shared browser instance initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize browser", error);
      throw error;
    }
  }

  async getPage(): Promise<Page> {
    if (!this.browser || !this.isInitialized) {
      await this.initializeBrowser();
    }

    if (!this.browser) {
      throw new Error("Browser not available");
    }

    // Check if we've reached the maximum number of pages
    if (this.activePages >= this.maxPagesPerBrowser) {
      this.logger.warn(
        `Maximum pages per browser reached (${this.maxPagesPerBrowser}), creating new browser instance`
      );
      await this.closeBrowser();
      await this.initializeBrowser();
    }

    try {
      const page = await this.browser.newPage();
      this.activePages++;

      // Configure the page
      await this.configurePage(page);

      this.logger.debug(`Created new page (active pages: ${this.activePages})`);
      return page;
    } catch (error) {
      this.logger.error("Failed to create new page", error);
      throw error;
    }
  }

  private async configurePage(page: Page): Promise<void> {
    try {
      await page.setBypassCSP(true);
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      });
      await page.setJavaScriptEnabled(true);
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });

      // Enhanced stealth configuration
      await page.evaluateOnNewDocument(() => {
        // Add common browser properties
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });
        Object.defineProperty(navigator, "plugins", {
          get: () => [
            {
              description: "Portable Document Format",
              filename: "internal-pdf-viewer",
              name: "Chrome PDF Plugin",
              mimeTypes: [{ type: "application/pdf" }],
            },
            {
              description: "Portable Document Format",
              filename: "internal-pdf-viewer",
              name: "Chrome PDF Viewer",
              mimeTypes: [{ type: "application/pdf" }],
            },
            {
              description: "Native Client",
              filename: "internal-nacl-plugin",
              name: "Native Client",
              mimeTypes: [{ type: "application/x-nacl" }],
            },
          ],
        });
        Object.defineProperty(navigator, "vendor", {
          get: () => "Google Inc.",
        });
        Object.defineProperty(navigator, "platform", { get: () => "Win32" });
        Object.defineProperty(window, "chrome", { get: () => ({}) });
        Object.defineProperty(window, "outerdimensions", {
          get: () => undefined,
        });
      });

      // Enable request interception
      await page.setRequestInterception(true);

      // Handle request interception
      page.on("request", (request) => {
        const resourceType = request.resourceType();

        // Only block media and font resources to keep page loading fast
        if (["media", "font"].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Set up page cleanup on close
      page.on("close", () => {
        this.activePages = Math.max(0, this.activePages - 1);
        this.logger.debug(`Page closed (active pages: ${this.activePages})`);
      });
    } catch (error) {
      this.logger.error("Failed to configure page", error);
      throw error;
    }
  }

  async closePage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (error) {
      this.logger.error("Error closing page", error);
    }
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        this.logger.log("Closing shared browser instance...");
        await this.browser.close();
        this.logger.log("Shared browser instance closed successfully");
      } catch (error) {
        this.logger.error("Error closing browser", error);
      } finally {
        this.browser = null;
        this.isInitialized = false;
        this.activePages = 0;
      }
    }
  }

  async restartBrowser(): Promise<void> {
    this.logger.log("Restarting browser...");
    await this.closeBrowser();
    await this.initializeBrowser();
  }

  getBrowserStatus(): {
    isInitialized: boolean;
    activePages: number;
    maxPages: number;
  } {
    return {
      isInitialized: this.isInitialized,
      activePages: this.activePages,
      maxPages: this.maxPagesPerBrowser,
    };
  }
}
