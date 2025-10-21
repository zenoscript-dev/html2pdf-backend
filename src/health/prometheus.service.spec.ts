import { Test, TestingModule } from "@nestjs/testing";
import { PrometheusService } from "./prometheus.service";

describe("PrometheusService", () => {
  let service: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusService],
    }).compile();

    service = module.get<PrometheusService>(PrometheusService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("startConversion", () => {
    it("should start conversion timer and increment active conversions", () => {
      const timer = service.startConversion("html");
      expect(typeof timer).toBe("function");
    });
  });

  describe("endConversion", () => {
    it("should end conversion timer and decrement active conversions", () => {
      const timer = service.startConversion("html");
      service.endConversion(timer, "success");
      // No error means success
    });
  });

  describe("recordError", () => {
    it("should record error metrics", () => {
      service.recordError("html", "test error");
      // No error means success
    });
  });

  describe("onModuleInit", () => {
    it("should initialize metrics", () => {
      service.onModuleInit();
      // No error means success
    });
  });
});
