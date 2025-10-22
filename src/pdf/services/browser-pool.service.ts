import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as puppeteer from "puppeteer";
import { Browser, Page } from "puppeteer";

interface PagePoolItem {
  page: Page;
  createdAt: number;
  lastUsed: number;
  id: string;
  isLocked: boolean;
}

interface BrowserInstance {
  browser: Browser;
  id: string;
  activePages: number;
  createdAt: number;
  lastUsed: number;
  isHealthy: boolean;
}

interface PendingRequest {
  resolve: (page: Page) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: number;
}

@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);

  // Multiple browser instances for load balancing
  private readonly browsers: BrowserInstance[] = [];
  private readonly maxBrowsers = 3; // Maximum number of browser instances
  private readonly maxPagesPerBrowser = 8; // Reduced per browser since we have multiple
  private readonly browserMaxAge = 10 * 60 * 1000; // 10 minutes browser lifetime

  // Concurrency management
  private readonly maxConcurrentRequests = 10; // Maximum concurrent PDF requests
  private activeRequests = 0;
  private readonly requestQueue: PendingRequest[] = [];

  // Page pool configuration
  private readonly pagePoolSize = 8; // Increased pool size
  private readonly maxPageAge = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly pagePool: PagePoolItem[] = [];

  // Cleanup intervals
  private poolCleanupInterval: NodeJS.Timeout | null = null;
  private browserHealthCheckInterval: NodeJS.Timeout | null = null;

  async onModuleInit() {
    await this.initializeBrowsers();
    this.startPagePoolCleanup();
    this.startBrowserHealthCheck();
  }

  async onModuleDestroy() {
    this.stopPagePoolCleanup();
    this.stopBrowserHealthCheck();
    await this.closeAllBrowsers();
  }

  private async initializeBrowsers(): Promise<void> {
    if (this.browsers.length > 0) {
      return;
    }

    this.logger.log(`Initializing ${this.maxBrowsers} browser instances...`);

    // Initialize browsers in parallel
    const browserPromises = Array.from(
      { length: this.maxBrowsers },
      (_, index) => this.createBrowserInstance(index)
    );

    try {
      await Promise.all(browserPromises);
      this.logger.log(
        `Successfully initialized ${this.browsers.length} browser instances`
      );
    } catch (error) {
      this.logger.error("Failed to initialize browsers", error);
      throw error;
    }
  }

  private async createBrowserInstance(index: number): Promise<void> {
    try {
      const browser = await puppeteer.launch({
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

      const browserInstance: BrowserInstance = {
        browser,
        id: `browser_${index}_${Date.now()}`,
        activePages: 0,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        isHealthy: true,
      };

      // Set up browser event listeners
      browser.on("disconnected", () => {
        this.logger.warn(
          `Browser ${browserInstance.id} disconnected unexpectedly`
        );
        browserInstance.isHealthy = false;
      });

      browser.on("targetcreated", (target) => {
        this.logger.debug(
          `New target created in browser ${
            browserInstance.id
          }: ${target.type()}`
        );
      });

      browser.on("targetdestroyed", (target) => {
        this.logger.debug(
          `Target destroyed in browser ${browserInstance.id}: ${target.type()}`
        );
        browserInstance.activePages = Math.max(
          0,
          browserInstance.activePages - 1
        );
      });

      this.browsers.push(browserInstance);
      this.logger.debug(
        `Browser instance ${browserInstance.id} initialized successfully`
      );
    } catch (error) {
      this.logger.error(`Failed to create browser instance ${index}`, error);
      throw error;
    }
  }

  async getPage(): Promise<Page> {
    // Check concurrency limits
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return new Promise((resolve, reject) => {
        const pendingRequest: PendingRequest = {
          resolve,
          reject,
          timestamp: Date.now(),
          priority: 1, // Default priority
        };
        this.requestQueue.push(pendingRequest);
        this.logger.debug(
          `Request queued due to concurrency limit (queue size: ${this.requestQueue.length})`
        );
      });
    }

    this.activeRequests++;

    try {
      // Try to get a page from the pool first
      const pooledPage = this.getPooledPage();
      if (pooledPage) {
        this.logger.debug(
          `Reusing pooled page (pool size: ${this.pagePool.length})`
        );
        return pooledPage;
      }

      // If no pooled page available, create a new one
      this.logger.debug("No pooled page available, creating new page");
      return await this.createNewPage();
    } finally {
      this.activeRequests--;
      this.processNextQueuedRequest();
    }
  }

  private processNextQueuedRequest(): void {
    if (
      this.requestQueue.length > 0 &&
      this.activeRequests < this.maxConcurrentRequests
    ) {
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        this.logger.debug(
          `Processing queued request (queue size: ${this.requestQueue.length})`
        );
        // Process the queued request asynchronously
        this.getPage().then(nextRequest.resolve).catch(nextRequest.reject);
      }
    }
  }

  private getPooledPage(): Page | null {
    const now = Date.now();

    // Find an available (unlocked) page in the pool
    const availablePageIndex = this.pagePool.findIndex(
      (item) => !item.isLocked && now - item.lastUsed < this.maxPageAge
    );

    if (availablePageIndex === -1) {
      return null;
    }

    const pageItem = this.pagePool[availablePageIndex];
    pageItem.isLocked = true;
    pageItem.lastUsed = now;

    this.logger.debug(`Retrieved page from pool (ID: ${pageItem.id})`);
    return pageItem.page;
  }

  private async createNewPage(): Promise<Page> {
    // Find the best browser instance using load balancing
    const bestBrowser = this.selectBestBrowser();
    if (!bestBrowser) {
      throw new Error("No healthy browser instances available");
    }

    // Check if we've reached the maximum number of pages for this browser
    if (bestBrowser.activePages >= this.maxPagesPerBrowser) {
      this.logger.warn(
        `Maximum pages per browser reached for ${bestBrowser.id} (${this.maxPagesPerBrowser}), creating new browser instance`
      );
      await this.replaceUnhealthyBrowser(bestBrowser);
      return this.createNewPage(); // Retry with new browser
    }

    try {
      const page = await bestBrowser.browser.newPage();
      bestBrowser.activePages++;
      bestBrowser.lastUsed = Date.now();

      // Configure the page
      await this.configurePage(page);

      // Add to page pool if we have space
      if (this.pagePool.length < this.pagePoolSize) {
        const pageItem: PagePoolItem = {
          page,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          isLocked: true, // Will be unlocked when returned to pool
        };
        this.pagePool.push(pageItem);
        this.logger.debug(
          `Added new page to pool (ID: ${pageItem.id}, pool size: ${this.pagePool.length})`
        );
      }

      this.logger.debug(
        `Created new page in browser ${bestBrowser.id} (active pages: ${bestBrowser.activePages})`
      );
      return page;
    } catch (error) {
      this.logger.error(
        `Failed to create new page in browser ${bestBrowser.id}`,
        error
      );
      throw error;
    }
  }

  private selectBestBrowser(): BrowserInstance | null {
    const healthyBrowsers = this.browsers.filter(
      (browser) => browser.isHealthy
    );

    if (healthyBrowsers.length === 0) {
      return null;
    }

    // Select browser with least active pages (load balancing)
    return healthyBrowsers.reduce((best, current) =>
      current.activePages < best.activePages ? current : best
    );
  }

  private async replaceUnhealthyBrowser(
    browserInstance: BrowserInstance
  ): Promise<void> {
    try {
      // Close the old browser
      await browserInstance.browser.close();

      // Remove from browsers array
      const index = this.browsers.indexOf(browserInstance);
      if (index > -1) {
        this.browsers.splice(index, 1);
      }

      // Create a new browser instance
      await this.createBrowserInstance(this.browsers.length);

      this.logger.log(`Replaced browser instance ${browserInstance.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to replace browser instance ${browserInstance.id}`,
        error
      );
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
        // Find which browser this page belongs to and update its count
        for (const browserInstance of this.browsers) {
          if (browserInstance.browser.isConnected()) {
            browserInstance.activePages = Math.max(
              0,
              browserInstance.activePages - 1
            );
            this.logger.debug(
              `Page closed in browser ${browserInstance.id} (active pages: ${browserInstance.activePages})`
            );
            break;
          }
        }
      });
    } catch (error) {
      this.logger.error("Failed to configure page", error);
      throw error;
    }
  }

  async closePage(page: Page): Promise<void> {
    try {
      // Check if this page is in our pool
      const pageItem = this.pagePool.find((item) => item.page === page);

      if (pageItem) {
        // Return page to pool instead of closing it
        await this.returnPageToPool(pageItem);
      } else {
        // Close the page if it's not in the pool
        if (!page.isClosed()) {
          await page.close();
          // Update browser instance page count
          for (const browserInstance of this.browsers) {
            if (browserInstance.browser.isConnected()) {
              browserInstance.activePages = Math.max(
                0,
                browserInstance.activePages - 1
              );
              this.logger.debug(
                `Page closed in browser ${browserInstance.id} (active pages: ${browserInstance.activePages})`
              );
              break;
            }
          }
        }
      }
    } catch (error) {
      this.logger.error("Error closing page", error);
    }
  }

  private async returnPageToPool(pageItem: PagePoolItem): Promise<void> {
    try {
      // Clear the page content and reset it for reuse
      await this.resetPageForReuse(pageItem.page);

      // Unlock the page
      pageItem.isLocked = false;
      pageItem.lastUsed = Date.now();

      this.logger.debug(
        `Page returned to pool (ID: ${pageItem.id}, pool size: ${this.pagePool.length})`
      );
    } catch (error) {
      this.logger.error(`Error returning page to pool: ${error}`);
      // If we can't reset the page, remove it from the pool and close it
      await this.removePageFromPool(pageItem);
    }
  }

  private async resetPageForReuse(page: Page): Promise<void> {
    try {
      // Clear any existing content
      await page.goto("about:blank");

      // Clear any cookies or local storage
      await page.evaluate(() => {
        // Clear localStorage
        if (typeof localStorage !== "undefined") {
          localStorage.clear();
        }
        // Clear sessionStorage
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.clear();
        }
        // Clear cookies
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(
              /=.*/,
              "=;expires=" + new Date().toUTCString() + ";path=/"
            );
        });
      });

      // Reset viewport and other settings
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
    } catch (error) {
      this.logger.warn(`Failed to reset page for reuse: ${error}`);
      throw error;
    }
  }

  private async removePageFromPool(pageItem: PagePoolItem): Promise<void> {
    const index = this.pagePool.indexOf(pageItem);
    if (index > -1) {
      this.pagePool.splice(index, 1);
    }

    try {
      if (!pageItem.page.isClosed()) {
        await pageItem.page.close();
        // Update browser instance page count
        for (const browserInstance of this.browsers) {
          if (browserInstance.browser.isConnected()) {
            browserInstance.activePages = Math.max(
              0,
              browserInstance.activePages - 1
            );
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error closing page during pool removal: ${error}`);
    }

    this.logger.debug(
      `Page removed from pool (ID: ${pageItem.id}, pool size: ${this.pagePool.length})`
    );
  }

  // Smart waiting strategies
  async waitForPageLoad(page: Page, url?: string): Promise<void> {
    try {
      // Smart waiting based on content type and complexity
      const waitStrategies = [
        // Wait for network idle (most reliable)
        page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }),
        // Wait for DOM content loaded
        page.waitForFunction(() => document.readyState === "interactive", {
          timeout: 5000,
        }),
        // Wait for specific elements if URL is provided
        url ? this.waitForContentElements(page) : Promise.resolve(),
        // Fallback: wait for document ready state
        page.waitForFunction(() => document.readyState === "complete", {
          timeout: 5000,
        }),
      ];

      // Use Promise.race to get the first successful strategy
      await Promise.race(waitStrategies);

      // Additional smart wait for dynamic content
      await this.waitForDynamicContent(page);
    } catch (error) {
      this.logger.warn(`Smart waiting failed, using fallback: ${error}`);
      // Fallback to basic wait
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
    }
  }

  private async waitForContentElements(page: Page): Promise<void> {
    try {
      // Wait for common content elements to be loaded
      await Promise.race([
        page.waitForSelector("body", { timeout: 5000 }),
        page.waitForSelector("main", { timeout: 5000 }),
        page.waitForSelector("article", { timeout: 5000 }),
        page.waitForSelector(".content", { timeout: 5000 }),
        // Fallback timeout
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (error) {
      // Ignore timeout errors for optional elements
    }
  }

  private async waitForDynamicContent(page: Page): Promise<void> {
    try {
      // Wait for images and iframes to load
      await page.waitForFunction(
        () => {
          const images = document.querySelectorAll("img");
          const iframes = document.querySelectorAll("iframe");

          const imageLoadPromises = Array.from(images).map(
            (img) =>
              img.complete ||
              new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
          );

          const iframeLoadPromises = Array.from(iframes).map(
            (iframe) =>
              iframe.contentDocument?.readyState === "complete" ||
              new Promise((resolve) => setTimeout(resolve, 1000))
          );

          return Promise.all([...imageLoadPromises, ...iframeLoadPromises]);
        },
        { timeout: 5000 }
      );
    } catch (error) {
      this.logger.debug(
        `Dynamic content wait completed with timeout: ${error}`
      );
    }
  }

  private async closeAllBrowsers(): Promise<void> {
    this.logger.log("Closing all browser instances...");

    // Close all pages in the pool first
    for (const pageItem of this.pagePool) {
      try {
        if (!pageItem.page.isClosed()) {
          await pageItem.page.close();
        }
      } catch (error) {
        this.logger.warn(`Error closing pooled page: ${error}`);
      }
    }

    // Clear the page pool
    this.pagePool.length = 0;

    // Close all browser instances in parallel
    const closePromises = this.browsers.map(async (browserInstance) => {
      try {
        await browserInstance.browser.close();
        this.logger.debug(
          `Browser instance ${browserInstance.id} closed successfully`
        );
      } catch (error) {
        this.logger.error(
          `Error closing browser instance ${browserInstance.id}`,
          error
        );
      }
    });

    await Promise.all(closePromises);
    this.browsers.length = 0;

    this.logger.log("All browser instances closed successfully");
  }

  async restartBrowsers(): Promise<void> {
    this.logger.log("Restarting all browsers...");
    await this.closeAllBrowsers();
    await this.initializeBrowsers();
  }

  getBrowserStatus(): {
    isInitialized: boolean;
    activeRequests: number;
    maxConcurrentRequests: number;
    browsersCount: number;
    healthyBrowsers: number;
    totalActivePages: number;
    pagePoolSize: number;
    pagePoolActive: number;
    queueSize: number;
  } {
    const totalActivePages = this.browsers.reduce(
      (sum, browser) => sum + browser.activePages,
      0
    );
    const healthyBrowsers = this.browsers.filter(
      (browser) => browser.isHealthy
    ).length;

    return {
      isInitialized: this.browsers.length > 0,
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      browsersCount: this.browsers.length,
      healthyBrowsers,
      totalActivePages,
      pagePoolSize: this.pagePoolSize,
      pagePoolActive: this.pagePool.length,
      queueSize: this.requestQueue.length,
    };
  }

  private startBrowserHealthCheck(): void {
    // Run health check every 3 minutes
    this.browserHealthCheckInterval = setInterval(() => {
      this.performBrowserHealthCheck();
    }, 3 * 60 * 1000);

    this.logger.debug("Browser health check started");
  }

  private stopBrowserHealthCheck(): void {
    if (this.browserHealthCheckInterval) {
      clearInterval(this.browserHealthCheckInterval);
      this.browserHealthCheckInterval = null;
      this.logger.debug("Browser health check stopped");
    }
  }

  private async performBrowserHealthCheck(): Promise<void> {
    const now = Date.now();
    const browsersToReplace: BrowserInstance[] = [];

    for (const browserInstance of this.browsers) {
      const age = now - browserInstance.createdAt;
      const idleTime = now - browserInstance.lastUsed;

      // Replace browsers that are too old or have been idle too long
      if (
        age > this.browserMaxAge ||
        (idleTime > this.browserMaxAge && browserInstance.activePages === 0)
      ) {
        browsersToReplace.push(browserInstance);
      }

      // Mark unhealthy browsers
      if (!browserInstance.isHealthy) {
        browsersToReplace.push(browserInstance);
      }
    }

    // Replace unhealthy/old browsers
    for (const browserInstance of browsersToReplace) {
      await this.replaceUnhealthyBrowser(browserInstance);
    }

    if (browsersToReplace.length > 0) {
      this.logger.debug(
        `Health check: Replaced ${browsersToReplace.length} browser instances`
      );
    }
  }

  private startPagePoolCleanup(): void {
    // Run cleanup every 2 minutes
    this.poolCleanupInterval = setInterval(() => {
      this.cleanupPagePool();
    }, 2 * 60 * 1000);

    this.logger.debug("Page pool cleanup started");
  }

  private stopPagePoolCleanup(): void {
    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval);
      this.poolCleanupInterval = null;
      this.logger.debug("Page pool cleanup stopped");
    }
  }

  private async cleanupPagePool(): Promise<void> {
    const now = Date.now();
    const pagesToRemove: PagePoolItem[] = [];

    // Find pages that are too old or have been idle too long
    for (const pageItem of this.pagePool) {
      const age = now - pageItem.createdAt;
      const idleTime = now - pageItem.lastUsed;

      if (
        age > this.maxPageAge ||
        (idleTime > this.maxPageAge && !pageItem.isLocked)
      ) {
        pagesToRemove.push(pageItem);
      }
    }

    // Remove old pages
    for (const pageItem of pagesToRemove) {
      await this.removePageFromPool(pageItem);
    }

    if (pagesToRemove.length > 0) {
      this.logger.debug(
        `Cleaned up ${pagesToRemove.length} old pages from pool`
      );
    }
  }
}
