import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./services/config.service";

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
