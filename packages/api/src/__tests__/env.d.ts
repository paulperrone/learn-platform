declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    AI?: Ai;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    OPENROUTER_API_KEY: string;
    OPENROUTER_MANAGEMENT_KEY?: string;
    ASSETS?: Fetcher;
  }
}
