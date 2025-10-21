import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "../config/config.service";
import { PrometheusService } from "../health/prometheus.service";
import { PdfService } from "./pdf.service";

describe("PdfService", () => {
  let service: PdfService;
  let configService: ConfigService;
  let prometheusService: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: ConfigService,
          useValue: {
            puppeteerArgs: ["--no-sandbox"],
            puppeteerTimeout: 30000,
            maxFileSize: 5242880,
          },
        },
        {
          provide: PrometheusService,
          useValue: {
            startConversion: jest.fn().mockReturnValue(() => {}),
            endConversion: jest.fn(),
            recordError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
    configService = module.get<ConfigService>(ConfigService);
    prometheusService = module.get<PrometheusService>(PrometheusService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("convertHtmlToPdf", () => {
    it("should throw BadRequestException for empty HTML", async () => {
      await expect(service.convertHtmlToPdf("")).rejects.toThrow(
        BadRequestException
      );
      expect(prometheusService.recordError).toHaveBeenCalledWith(
        "html",
        "Invalid HTML content"
      );
    });

    it("should throw BadRequestException for missing HTML tags", async () => {
      await expect(service.convertHtmlToPdf("<div>test</div>")).rejects.toThrow(
        BadRequestException
      );
      expect(prometheusService.recordError).toHaveBeenCalledWith(
        "html",
        "Missing HTML tags"
      );
    });

    it("should convert valid HTML to PDF", async () => {
      const html = "<html><body><h1>Test</h1></body></html>";
      const result = await service.convertHtmlToPdf(html);
      expect(result).toBeInstanceOf(Buffer);
      expect(prometheusService.startConversion).toHaveBeenCalledWith("html");
      expect(prometheusService.endConversion).toHaveBeenCalledWith(
        expect.any(Function),
        "success"
      );
    });
  });

  describe("convertUrlToPdf", () => {
    it("should throw BadRequestException for invalid URL", async () => {
      await expect(service.convertUrlToPdf("invalid-url")).rejects.toThrow(
        BadRequestException
      );
      expect(prometheusService.recordError).toHaveBeenCalledWith(
        "url",
        "Invalid URL format"
      );
    });

    it("should convert valid URL to PDF", async () => {
      const url = "https://example.com";
      const result = await service.convertUrlToPdf(url);
      expect(result).toBeInstanceOf(Buffer);
      expect(prometheusService.startConversion).toHaveBeenCalledWith("url");
      expect(prometheusService.endConversion).toHaveBeenCalledWith(
        expect.any(Function),
        "success"
      );
    });

    it("should handle network errors gracefully", async () => {
      const url = "https://non-existent-domain.com";
      await expect(service.convertUrlToPdf(url)).rejects.toThrow(
        BadRequestException
      );
      expect(prometheusService.recordError).toHaveBeenCalled();
    });
  });
});
