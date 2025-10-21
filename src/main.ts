import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as compression from "compression";
import * as cors from "cors";
import * as dotenv from "dotenv";
import helmet from "helmet";
import * as morgan from "morgan";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Load environment variables
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  // Apply security middleware
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      maxAge: 86400, // 24 hours
    })
  );
  app.use(morgan("combined"));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
  app.use(compression());

  app.setGlobalPrefix("api/v1");

  // Apply validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("HTML to PDF Converter API")
    .setDescription(
      "A robust API for converting HTML content and URLs to PDF files"
    )
    .setVersion("1.0")
    .addTag("pdf", "PDF conversion endpoints")
    .addTag("health", "Health check and monitoring endpoints")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  const port = process.env.PORT || 6100;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API documentation available at: http://localhost:${port}/api`);
}
bootstrap();
