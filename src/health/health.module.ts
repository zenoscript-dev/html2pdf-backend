import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./controllers/health.controller";
import { PrometheusController } from "./controllers/prometheus.controller";
import { PrometheusService } from "./services/prometheus.service";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, PrometheusController],
  providers: [PrometheusService],
  exports: [PrometheusService],
})
export class HealthModule {}
