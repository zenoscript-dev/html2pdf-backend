export interface PdfErrorContext {
  url?: string;
  stage?: string;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  cause?: unknown;
}
