import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as puppeteer from "puppeteer";
import { ConfigService } from "../config/config.service";
import { PrometheusService } from "../health/prometheus.service";

interface PdfErrorContext {
  url?: string;
  stage?: string;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  cause?: unknown;
}

class PdfError extends Error {
  constructor(message: string, public readonly context: PdfErrorContext = {}) {
    super(message);
    this.name = "PdfError";
  }

  toString(): string {
    const parts = [this.message];
    if (this.context.stage) {
      parts.push(`Stage: ${this.context.stage}`);
    }
    if (this.context.url) {
      parts.push(`URL: ${this.context.url}`);
    }
    if (this.context.httpStatus) {
      parts.push(
        `HTTP Status: ${this.context.httpStatus} ${
          this.context.httpStatusText || ""
        }`
      );
    }
    if (this.context.contentType) {
      parts.push(`Content-Type: ${this.context.contentType}`);
    }
    return parts.join(" | ");
  }
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly maxRetries = 3;
  private readonly initialDelay = 1000;
  private readonly timeouts = {
    navigation: 30000, // 30 seconds for navigation
    networkIdle: 5000, // 5 seconds for network idle
    dynamicContent: 5000, // 5 seconds for dynamic content
    pdfGeneration: 30000, // 30 seconds for PDF generation
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prometheusService: PrometheusService
  ) {}

  async convertHtmlToPdf(html: string): Promise<Buffer> {
    const timer = this.prometheusService.startConversion("html");
    let browser;

    try {
      // Validate HTML string
      if (!html || typeof html !== "string") {
        this.prometheusService.recordError("html", "Invalid HTML content");
        throw new BadRequestException("Invalid HTML content");
      }

      // Basic HTML structure validation - be more lenient
      if (!html.includes("<html") && !html.includes("<HTML")) {
        this.logger.warn("HTML content missing <html> tags, wrapping content");
        html = `<html><head><title>Generated PDF</title></head><body>${html}</body></html>`;
      }
      this.logger.debug("Launching Puppeteer browser...");
      browser = await puppeteer.launch({
        headless: true,
        channel: "chrome",
        executablePath: process.env.CHROME_PATH || undefined,
        args: [
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
          "--disable-dev-shm-usage",
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
          "--disable-setuid-sandbox",
          "--disable-speech-api",
          "--disable-sync",
          "--hide-scrollbars",
          "--ignore-gpu-blacklist",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-first-run",
          "--no-pings",
          "--no-sandbox",
          "--no-zygote",
          "--password-store=basic",
          "--use-gl=swiftshader",
          "--use-mock-keychain",
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });

      this.logger.debug("Browser launched successfully");
      const page = await browser.newPage();
      await page.setBypassCSP(true);

      // Set common browser configurations
      try {
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
      } catch (configError: unknown) {
        throw new Error(
          `Failed to configure browser: ${
            configError instanceof Error
              ? configError.message
              : String(configError)
          }`
        );
      }

      // Set content with timeout and wait for network idle
      this.logger.debug("Setting HTML content...");
      await page.setContent(html, {
        timeout: this.timeouts.navigation,
        waitUntil: "networkidle0",
      });

      // Header and footer will be added by Puppeteer's built-in functionality during PDF generation
      this.logger.debug(
        "Content loaded, ready for PDF generation with headers and footers"
      );

      // Wait for any remaining dynamic content
      await page
        .waitForFunction(
          () => {
            const readyState = document.readyState;
            const loadingElements = document.querySelectorAll(
              "img[loading], iframe[loading]"
            );
            return readyState === "complete" && loadingElements.length === 0;
          },
          { timeout: this.timeouts.dynamicContent }
        )
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Dynamic content wait timed out: ${errorMessage}`);
        });

      // Generate PDF with retry
      this.logger.debug("Starting PDF generation");

      // Get company name and generate header/footer templates
      const companyName = this.configService.pdfWatermarkText;
      const color = this.configService.pdfWatermarkColor;
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const pdf = await this.retryOperation(
        async () => {
          try {
            const result = await page.pdf({
              format: "A4",
              printBackground: true,
              timeout: this.timeouts.pdfGeneration,
              scale: 0.8,
              displayHeaderFooter: true,
              headerTemplate: `
                <div style="width: 100%; font-size: 10px; padding: 5px 20px; color: ${color}; border-bottom: 2px solid ${color}; display: flex; justify-content: space-between; align-items: center; background: white; -webkit-print-color-adjust: exact;">
                  <span style="font-weight: bold; font-size: 12px;">${companyName}</span>
                  <span style="text-align: right;">${dateStr}<br/>${timeStr}</span>
                </div>
              `,
              footerTemplate: `
                <div style="width: 100%; font-size: 9px; padding: 5px 20px; color: ${color}; border-top: 2px solid ${color}; display: flex; justify-content: space-between; align-items: center; background: white; -webkit-print-color-adjust: exact;">
                  <span style="font-style: italic;">© ${companyName} - All Rights Reserved</span>
                  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Generated on ${dateStr} at ${timeStr}</span>
                </div>
              `,
              margin: {
                top: "80px",
                right: "40px",
                bottom: "80px",
                left: "40px",
              },
            });
            this.logger.debug("PDF generation successful");
            return result;
          } catch (pdfError: unknown) {
            const errorMessage =
              pdfError instanceof Error ? pdfError.message : String(pdfError);
            this.logger.debug(`PDF generation failed: ${errorMessage}`);
            throw new PdfError(`PDF generation failed: ${errorMessage}`, {
              stage: "pdf_generation",
              cause: pdfError,
            });
          }
        },
        2,
        500
      );

      return Buffer.from(pdf);
    } catch (error: unknown) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = Object.prototype.toString.call(error);
        }
      } else {
        errorMessage = String(error);
      }

      // Log detailed error information
      this.logger.error({
        message: "Failed to convert HTML to PDF",
        error: errorMessage,
        errorObject: error,
        puppeteerConfig: {
          executablePath: process.env.CHROME_PATH || "default",
          channel: "chrome",
          args: [
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
            "--disable-dev-shm-usage",
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
            "--disable-setuid-sandbox",
            "--disable-speech-api",
            "--disable-sync",
            "--hide-scrollbars",
            "--ignore-gpu-blacklist",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-first-run",
            "--no-pings",
            "--no-sandbox",
            "--no-zygote",
            "--password-store=basic",
            "--use-gl=swiftshader",
            "--use-mock-keychain",
          ],
        },
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof PdfError) {
        throw new BadRequestException(error.toString());
      }

      // Provide more specific error messages
      if (errorMessage.includes("net::ERR_CONNECTION_TIMED_OUT")) {
        throw new BadRequestException(
          "Operation timed out. The content might be too large or complex."
        );
      } else if (errorMessage.includes("net::ERR_FAILED")) {
        throw new BadRequestException(
          "Failed to process HTML content. Please check if the HTML is valid."
        );
      } else if (errorMessage.includes("net::ERR_ABORTED")) {
        throw new BadRequestException(
          "Operation was aborted. Please try again with simpler HTML content."
        );
      }

      this.prometheusService.recordError("html", errorMessage);
      throw new BadRequestException(
        `Failed to convert HTML to PDF: ${errorMessage}`
      );
    } finally {
      if (browser) {
        await browser.close().catch((closeError: unknown) => {
          const errorMessage =
            closeError instanceof Error
              ? closeError.message
              : String(closeError);
          this.logger.error({
            message: "Error closing browser",
            error: errorMessage,
            errorObject: closeError,
          });
        });
      }
      this.prometheusService.endConversion(timer, "success");
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error = new Error("Operation failed after all retries");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        lastError = new Error(errorMessage);

        if (attempt < maxRetries) {
          this.logger.warn(
            `Attempt ${attempt} failed, retrying in ${delay}ms: ${errorMessage}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          // Increase delay for next attempt
          delay *= 2;
        }
      }
    }

    throw lastError;
  }

  async convertUrlToPdf(url: string): Promise<Buffer> {
    const timer = this.prometheusService.startConversion("url");
    let browser;
    try {
      // Validate URL format
      try {
        new URL(url);
      } catch (urlError) {
        this.prometheusService.recordError("url", "Invalid URL format");
        throw new BadRequestException("Invalid URL format");
      }

      try {
        this.logger.debug("Launching Puppeteer browser...");
        browser = await puppeteer.launch({
          headless: true,
          channel: "chrome",
          executablePath: process.env.CHROME_PATH || undefined,
          args: [
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
            "--disable-dev-shm-usage",
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
            "--disable-setuid-sandbox",
            "--disable-speech-api",
            "--disable-sync",
            "--hide-scrollbars",
            "--ignore-gpu-blacklist",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-first-run",
            "--no-pings",
            "--no-sandbox",
            "--no-zygote",
            "--password-store=basic",
            "--use-gl=swiftshader",
            "--use-mock-keychain",
          ],
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
        });

        this.logger.debug("Browser launched successfully");
        const page = await browser.newPage();
        await page.setBypassCSP(true);

        // Set common browser configurations
        try {
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
        } catch (configError: unknown) {
          throw new Error(
            `Failed to configure browser: ${
              configError instanceof Error
                ? configError.message
                : String(configError)
            }`
          );
        }

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

        // Handle request interception and logging
        page.on("request", (request) => {
          const resourceType = request.resourceType();
          const requestUrl = request.url();

          this.logger.debug({
            message: "Network request",
            url: requestUrl,
            method: request.method(),
            resourceType,
            headers: request.headers(),
          });

          // Only block media and font resources to keep page loading fast
          if (["media", "font"].includes(resourceType)) {
            request.abort();
          } else {
            request.continue();
          }
        });

        // Log responses for debugging
        page.on("response", (response) => {
          const request = response.request();
          const status = response.status();

          if (status >= 400) {
            this.logger.warn({
              message: "Failed network request",
              url: request.url(),
              method: request.method(),
              status,
              statusText: response.statusText(),
            });
          } else {
            this.logger.debug({
              message: "Network response",
              url: request.url(),
              method: request.method(),
              status,
              contentType: response.headers()["content-type"],
            });
          }
        });

        // Navigate to URL with retry
        this.logger.debug(`Attempting to navigate to URL: ${url}`);
        await this.retryOperation(
          async () => {
            try {
              const response = await page.goto(url, {
                timeout: this.timeouts.navigation,
                waitUntil: ["networkidle0", "domcontentloaded"],
              });

              if (!response) {
                throw new Error("Navigation failed: No response received");
              }

              const status = response.status();
              if (status < 200 || status >= 400) {
                throw new PdfError(
                  `Navigation failed: HTTP ${status} - ${response.statusText()}`,
                  {
                    stage: "navigation",
                    url,
                    httpStatus: status,
                    httpStatusText: response.statusText(),
                    contentType: response.headers()["content-type"],
                  }
                );
              }

              this.logger.debug({
                message: "Navigation successful",
                url,
                status,
                contentType: response.headers()["content-type"],
              });

              // Wait for any remaining dynamic content
              await page
                .waitForFunction(
                  () => {
                    const readyState = document.readyState;
                    const loadingElements = document.querySelectorAll(
                      "img[loading], iframe[loading]"
                    );
                    return (
                      readyState === "complete" && loadingElements.length === 0
                    );
                  },
                  { timeout: this.timeouts.dynamicContent }
                )
                .catch((error: unknown) => {
                  this.logger.warn(
                    `Dynamic content wait timed out: ${
                      error instanceof Error ? error.message : String(error)
                    }`
                  );
                });

              return response;
            } catch (navError: unknown) {
              const errorMessage =
                navError instanceof Error ? navError.message : String(navError);
              this.logger.error({
                message: "Navigation failed",
                url,
                error: errorMessage,
                errorObject: navError,
              });
              throw new PdfError(`Navigation failed: ${errorMessage}`, {
                stage: "navigation",
                url,
                cause: navError,
              });
            }
          },
          3,
          1000
        );

        // Wait for network to be idle and any remaining dynamic content
        await Promise.all([
          page
            .waitForNetworkIdle({
              idleTime: 1000,
              timeout: this.timeouts.networkIdle,
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              this.logger.warn(`Network idle wait failed: ${errorMessage}`);
            }),
          new Promise((resolve) => setTimeout(resolve, 2000)), // Additional wait for dynamic content
        ]);

        // Header and footer will be added by Puppeteer's built-in functionality during PDF generation
        this.logger.debug(
          "Page loaded, ready for PDF generation with headers and footers"
        );

        // Generate PDF with retry
        this.logger.debug("Starting PDF generation");

        // Get company name and generate header/footer templates
        const companyName = this.configService.pdfWatermarkText;
        const color = this.configService.pdfWatermarkColor;
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const timeStr = now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const pdf = await this.retryOperation(
          async () => {
            try {
              const result = await page.pdf({
                format: "A4",
                printBackground: true,
                timeout: this.timeouts.pdfGeneration,
                scale: 0.8, // Slightly scale down to ensure content fits
                displayHeaderFooter: true,
                headerTemplate: `
                  <div style="width: 100%; font-size: 10px; padding: 5px 20px; color: ${color}; border-bottom: 2px solid ${color}; display: flex; justify-content: space-between; align-items: center; background: white; -webkit-print-color-adjust: exact;">
                    <span style="font-weight: bold; font-size: 12px;">${companyName}</span>
                    <span style="text-align: right;">${dateStr}<br/>${timeStr}</span>
                  </div>
                `,
                footerTemplate: `
                  <div style="width: 100%; font-size: 9px; padding: 5px 20px; color: ${color}; border-top: 2px solid ${color}; display: flex; justify-content: space-between; align-items: center; background: white; -webkit-print-color-adjust: exact;">
                    <span style="font-style: italic;">© ${companyName} - All Rights Reserved</span>
                    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Generated on ${dateStr} at ${timeStr}</span>
                  </div>
                `,
                margin: {
                  top: "80px",
                  right: "40px",
                  bottom: "80px",
                  left: "40px",
                },
              });
              this.logger.debug("PDF generation successful");
              return result;
            } catch (pdfError: unknown) {
              const errorMessage =
                pdfError instanceof Error ? pdfError.message : String(pdfError);
              this.logger.debug(`PDF generation failed: ${errorMessage}`);
              throw new PdfError(`PDF generation failed: ${errorMessage}`, {
                stage: "pdf_generation",
                url,
                cause: pdfError,
              });
            }
          },
          2,
          500
        );

        return Buffer.from(pdf);
      } catch (error: unknown) {
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === "object" && error !== null) {
          try {
            errorMessage = JSON.stringify(error);
          } catch {
            errorMessage = Object.prototype.toString.call(error);
          }
        } else {
          errorMessage = String(error);
        }

        // Log detailed error information
        this.logger.error({
          message: "Navigation or PDF generation failed",
          error: errorMessage,
          errorObject: error,
          puppeteerConfig: {
            executablePath: process.env.CHROME_PATH || "default",
            channel: "chrome",
            args: [
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
              "--disable-dev-shm-usage",
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
              "--disable-setuid-sandbox",
              "--disable-speech-api",
              "--disable-sync",
              "--hide-scrollbars",
              "--ignore-gpu-blacklist",
              "--metrics-recording-only",
              "--mute-audio",
              "--no-default-browser-check",
              "--no-first-run",
              "--no-pings",
              "--no-sandbox",
              "--no-zygote",
              "--password-store=basic",
              "--use-gl=swiftshader",
              "--use-mock-keychain",
            ],
          },
        });

        throw new PdfError(
          `Failed to navigate or generate PDF: ${errorMessage}`,
          {
            stage: "process",
            url,
            cause: error,
          }
        );
      } finally {
        if (browser) {
          await browser.close().catch((error: unknown) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.error({
              message: "Error closing browser",
              error: errorMessage,
              errorObject: error,
            });
          });
        }
      }
    } catch (error: unknown) {
      // Enhanced error handling
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = Object.prototype.toString.call(error);
        }
      } else {
        errorMessage = String(error);
      }

      // Log detailed error information
      this.logger.error({
        message: "Failed to convert URL to PDF",
        error: errorMessage,
        errorObject: error,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Provide more specific error messages
      if (errorMessage.includes("net::ERR_NAME_NOT_RESOLVED")) {
        throw new BadRequestException(
          "Could not resolve the domain name. Please check if the URL is correct."
        );
      } else if (errorMessage.includes("net::ERR_CONNECTION_TIMED_OUT")) {
        throw new BadRequestException(
          "Connection timed out. The website might be down or blocking access."
        );
      } else if (errorMessage.includes("net::ERR_CONNECTION_REFUSED")) {
        throw new BadRequestException(
          "Connection was refused. The website might be blocking access."
        );
      } else if (errorMessage.includes("socket hang up")) {
        throw new BadRequestException(
          "Connection was unexpectedly closed. The website might be blocking automated access. Try again in a few minutes."
        );
      }

      this.prometheusService.recordError("url", errorMessage);
      throw new BadRequestException(
        `Failed to convert URL to PDF: ${errorMessage}`
      );
    } finally {
      this.prometheusService.endConversion(timer, "success");
    }
  }
}
