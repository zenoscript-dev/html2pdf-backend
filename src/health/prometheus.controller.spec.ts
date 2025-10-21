import { Test, TestingModule } from "@nestjs/testing";
import { register } from "prom-client";
import { PrometheusController } from "./prometheus.controller";
import { PrometheusService } from "./prometheus.service";

jest.mock("prom-client", () => ({
  register: {
    metrics: jest.fn(),
  },
}));

describe("PrometheusController", () => {
  let controller: PrometheusController;
  let prometheusService: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrometheusController],
      providers: [
        {
          provide: PrometheusService,
          useValue: {
            startConversion: jest.fn(),
            endConversion: jest.fn(),
            recordError: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PrometheusController>(PrometheusController);
    prometheusService = module.get<PrometheusService>(PrometheusService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getMetrics", () => {
    it("should return metrics from prom-client register", async () => {
      const mockMetrics = "mock_metrics_data";
      (register.metrics as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await controller.getMetrics();

      expect(register.metrics).toHaveBeenCalled();
      expect(result).toBe(mockMetrics);
    });
  });
});
