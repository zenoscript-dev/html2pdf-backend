import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

@Injectable()
export class PrometheusService implements OnModuleInit {
  private readonly registry: Registry;
  private readonly pdfConversionDuration: Histogram;
  private readonly pdfConversionTotal: Counter;
  private readonly pdfConversionErrors: Counter;
  private readonly activeConversions: Gauge;

  constructor() {
    this.registry = new Registry();

    // Add default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });

    // PDF conversion duration histogram
    this.pdfConversionDuration = new Histogram({
      name: "pdf_conversion_duration_seconds",
      help: "Duration of PDF conversion in seconds",
      labelNames: ["type"], // html, url
      buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60],
      registers: [this.registry],
    });

    // Total PDF conversions counter
    this.pdfConversionTotal = new Counter({
      name: "pdf_conversion_total",
      help: "Total number of PDF conversions",
      labelNames: ["type", "status"],
      registers: [this.registry],
    });

    // PDF conversion errors counter
    this.pdfConversionErrors = new Counter({
      name: "pdf_conversion_errors_total",
      help: "Total number of PDF conversion errors",
      labelNames: ["type", "error"],
      registers: [this.registry],
    });

    // Active conversions gauge
    this.activeConversions = new Gauge({
      name: "pdf_conversion_active",
      help: "Number of active PDF conversions",
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Initialize metrics
    this.activeConversions.set(0);
  }

  startConversion(type: string) {
    this.activeConversions.inc();
    return this.pdfConversionDuration.startTimer({ type });
  }

  endConversion(timer: () => number, status: "success" | "error") {
    this.activeConversions.dec();
    timer();
    this.pdfConversionTotal.inc({ type: "total", status });
  }

  recordError(type: string, error: string) {
    this.pdfConversionErrors.inc({ type, error });
  }
}
