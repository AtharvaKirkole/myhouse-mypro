export const config = {
  port: Number(process.env.PORT ?? 4000),
  env: process.env.NODE_ENV ?? "development",
  dataDir: process.env.DATA_DIR ?? "data",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
  accessTtl: "15m",
  refreshTtlDays: 30,
  rateLimitPerMin: Number(process.env.RATE_LIMIT ?? 300),
  aiProvider: process.env.AI_PROVIDER ?? "mock", // mock | openai | anthropic | gemini
};
