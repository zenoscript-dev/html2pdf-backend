import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule } from "./config";
import { HealthModule } from "./health";
import { PdfModule } from "./pdf";

@Module({
  imports: [
    ConfigModule,
    HealthModule,
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 1000, // 1 second
        limit: 2, // 2 requests per second
      },
      {
        name: "medium",
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests per minute
      },
      {
        name: "long",
        ttl: 3600000, // 1 hour
        limit: 100, // 100 requests per hour
      },
    ]),
    PdfModule,
  ],
})
export class AppModule {}
