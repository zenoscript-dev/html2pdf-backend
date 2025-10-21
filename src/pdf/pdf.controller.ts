import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Response } from "express";
import { ConfigService } from "../config/config.service";
import { HtmlTextDto } from "./dto/html-text.dto";
import { UrlDto } from "./dto/url.dto";
import { PdfService } from "./pdf.service";

@ApiTags("pdf")
@Controller("convert")
@UseGuards(ThrottlerGuard)
export class PdfController {
  private readonly logger = new Logger(PdfController.name);

  constructor(
    private readonly pdfService: PdfService,
    private readonly configService: ConfigService
  ) {}

  @Post("html-file")
  @Throttle({
    short: { ttl: 1000, limit: 2 },
    medium: { ttl: 60000, limit: 10 },
  })
  @ApiOperation({
    summary: "Convert HTML file to PDF",
    description: "Upload an HTML file and receive a PDF file in response",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "HTML file to convert (max 5MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "PDF file generated successfully",
    content: {
      "application/pdf": {
        schema: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input - file is missing, too large, or not HTML",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 5242880, // 5MB
      },
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== "text/html") {
          return callback(
            new BadRequestException("Only HTML files are allowed"),
            false
          );
        }
        callback(null, true);
      },
    })
  )
  async convertHtmlFile(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ): Promise<void> {
    try {
      if (!file) {
        throw new BadRequestException("No file uploaded");
      }

      const html = file.buffer.toString();
      const pdf = await this.pdfService.convertHtmlToPdf(html);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      res.send(pdf);
    } catch (error) {
      this.logger.error(`Error converting HTML file: ${error.message}`);
      throw error;
    }
  }

  @Post("html-text")
  @Throttle({
    short: { ttl: 1000, limit: 2 },
    medium: { ttl: 60000, limit: 10 },
  })
  @ApiOperation({
    summary: "Convert HTML text to PDF",
    description:
      "Send HTML content in the request body and receive a PDF file in response",
  })
  @ApiResponse({
    status: 200,
    description: "PDF file generated successfully",
    content: {
      "application/pdf": {
        schema: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input - HTML content is missing or invalid",
  })
  async convertHtmlText(
    @Body() dto: HtmlTextDto,
    @Res() res: Response
  ): Promise<void> {
    try {
      const pdf = await this.pdfService.convertHtmlToPdf(dto.html);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      res.send(pdf);
    } catch (error) {
      this.logger.error(`Error converting HTML text: ${error.message}`);
      throw error;
    }
  }

  @Post("url")
  @Throttle({
    short: { ttl: 1000, limit: 2 },
    medium: { ttl: 60000, limit: 10 },
  })
  @ApiOperation({
    summary: "Convert webpage to PDF",
    description:
      "Convert a webpage to PDF by providing its URL. If protocol (http:// or https://) is not provided, https:// will be used by default.",
  })
  @ApiResponse({
    status: 200,
    description: "PDF file generated successfully",
    content: {
      "application/pdf": {
        schema: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      "Invalid input - URL is missing, malformed, or website is inaccessible",
  })
  async convertUrl(@Body() dto: UrlDto, @Res() res: Response): Promise<void> {
    try {
      const pdf = await this.pdfService.convertUrlToPdf(dto.url);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      res.send(pdf);
    } catch (error) {
      this.logger.error(`Error converting URL: ${error.message}`);
      throw error;
    }
  }
}
