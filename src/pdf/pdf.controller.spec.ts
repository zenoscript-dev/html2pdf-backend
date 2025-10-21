import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Response } from "express";
import { ConfigService } from "../config/config.service";
import { HtmlTextDto } from "./dto/html-text.dto";
import { UrlDto } from "./dto/url.dto";
import { PdfController } from "./pdf.controller";
import { PdfService } from "./pdf.service";

describe("PdfController", () => {
  let controller: PdfController;
  let pdfService: PdfService;

  const mockResponse = {
    set: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        {
          provide: PdfService,
          useValue: {
            convertHtmlToPdf: jest.fn(),
            convertUrlToPdf: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            maxFileSize: 5242880,
          },
        },
      ],
    }).compile();

    controller = module.get<PdfController>(PdfController);
    pdfService = module.get<PdfService>(PdfService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("convertHtmlFile", () => {
    it("should throw BadRequestException when no file is provided", async () => {
      await expect(
        controller.convertHtmlFile(undefined as any, mockResponse)
      ).rejects.toThrow(BadRequestException);
    });

    it("should convert HTML file to PDF", async () => {
      const mockFile = {
        buffer: Buffer.from("<html><body>Test</body></html>"),
      } as Express.Multer.File;

      const mockPdf = Buffer.from("mock pdf content");
      jest.spyOn(pdfService, "convertHtmlToPdf").mockResolvedValue(mockPdf);

      await controller.convertHtmlFile(mockFile, mockResponse);

      expect(pdfService.convertHtmlToPdf).toHaveBeenCalledWith(
        mockFile.buffer.toString()
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      expect(mockResponse.send).toHaveBeenCalledWith(mockPdf);
    });
  });

  describe("convertHtmlText", () => {
    it("should convert HTML text to PDF", async () => {
      const dto: HtmlTextDto = {
        html: "<html><body>Test</body></html>",
      };

      const mockPdf = Buffer.from("mock pdf content");
      jest.spyOn(pdfService, "convertHtmlToPdf").mockResolvedValue(mockPdf);

      await controller.convertHtmlText(dto, mockResponse);

      expect(pdfService.convertHtmlToPdf).toHaveBeenCalledWith(dto.html);
      expect(mockResponse.set).toHaveBeenCalledWith({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      expect(mockResponse.send).toHaveBeenCalledWith(mockPdf);
    });

    it("should handle conversion errors", async () => {
      const dto: HtmlTextDto = {
        html: "invalid html",
      };

      jest
        .spyOn(pdfService, "convertHtmlToPdf")
        .mockRejectedValue(new BadRequestException("Invalid HTML"));

      await expect(
        controller.convertHtmlText(dto, mockResponse)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("convertUrl", () => {
    it("should convert URL to PDF", async () => {
      const dto: UrlDto = {
        url: "https://example.com",
      };

      const mockPdf = Buffer.from("mock pdf content");
      jest.spyOn(pdfService, "convertUrlToPdf").mockResolvedValue(mockPdf);

      await controller.convertUrl(dto, mockResponse);

      expect(pdfService.convertUrlToPdf).toHaveBeenCalledWith(dto.url);
      expect(mockResponse.set).toHaveBeenCalledWith({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      expect(mockResponse.send).toHaveBeenCalledWith(mockPdf);
    });

    it("should handle conversion errors", async () => {
      const dto: UrlDto = {
        url: "invalid-url",
      };

      jest
        .spyOn(pdfService, "convertUrlToPdf")
        .mockRejectedValue(new BadRequestException("Invalid URL"));

      await expect(controller.convertUrl(dto, mockResponse)).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
