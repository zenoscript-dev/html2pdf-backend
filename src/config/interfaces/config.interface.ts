export interface Config {
  port: number;
  nodeEnv: string;
  maxFileSize: number;
  puppeteerTimeout: number;
  corsOrigin: string;
  rateLimitTtl: number;
  rateLimitMax: number;
  puppeteerArgs: string[];
  puppeteerExecPath?: string;
  maxConcurrentJobs: number;
}
