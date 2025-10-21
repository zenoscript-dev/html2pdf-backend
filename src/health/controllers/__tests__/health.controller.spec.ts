import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "../health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  let healthService: HealthCheckService;
  let memoryIndicator: MemoryHealthIndicator;
  let diskIndicator: DiskHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest.fn(),
            checkRSS: jest.fn(),
          },
        },
        {
          provide: DiskHealthIndicator,
          useValue: {
            checkStorage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthCheckService>(HealthCheckService);
    memoryIndicator = module.get<MemoryHealthIndicator>(MemoryHealthIndicator);
    diskIndicator = module.get<DiskHealthIndicator>(DiskHealthIndicator);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("check", () => {
    it("should perform health checks", async () => {
      const mockHealthCheck = {
        status: "up",
        info: {
          memory_heap: { status: "up" },
          memory_rss: { status: "up" },
          disk_health: { status: "up" },
        },
        details: {
          memory_heap: { status: "up" },
          memory_rss: { status: "up" },
          disk_health: { status: "up" },
        },
        error: {},
      };

      jest
        .spyOn(healthService, "check")
        .mockResolvedValue(mockHealthCheck as any);

      const result = await controller.check();

      expect(healthService.check).toHaveBeenCalled();
      expect(result).toEqual(mockHealthCheck);
    });
  });
});
