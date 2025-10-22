import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ConfigModule } from "../config";
import { HealthModule } from "../health";
import { PdfController } from "./controllers/pdf.controller";
import { BrowserPoolService } from "./services/browser-pool.service";
import { PdfService } from "./services/pdf.service";

@Module({
  imports: [ConfigModule, HealthModule],
  controllers: [PdfController],
  providers: [
    PdfService,
    BrowserPoolService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class PdfModule {}
