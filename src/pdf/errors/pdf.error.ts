import { PdfErrorContext } from "../interfaces/pdf-error.interface";

export class PdfError extends Error {
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
