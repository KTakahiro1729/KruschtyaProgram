import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers';

export default defineWorkersConfig({
  test: {
    globals: true,
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml'
        }
      }
    }
  }
});
