import { defineConfig } from "vitest/config";

// Only the bench's own tests: a fixture copied under test/ or elsewhere must not run here.
// Every test spawns a real `npm run replay`, which can take several seconds under load.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 30000 } });
