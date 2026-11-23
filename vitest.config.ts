import { defineConfig } from "vitest/config";

// Only the bench's own tests: fixture/ holds the fixture's own suite, which must not run here.
// Every test spawns a real `npm run replay`, which can take several seconds under load.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 30000 } });
