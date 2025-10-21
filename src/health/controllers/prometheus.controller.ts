import { Controller, Get } from "@nestjs/common";
import { register } from "prom-client";
import { PrometheusService } from "../services/prometheus.service";

@Controller("metrics")
export class PrometheusController {
  constructor(private prometheusService: PrometheusService) {}

  @Get()
  async getMetrics(): Promise<string> {
    return await register.metrics();
  }
}
