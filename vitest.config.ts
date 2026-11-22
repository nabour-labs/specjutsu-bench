import { defineConfig } from "vitest/config";

// Every test spawns a real `npm run replay`, which can take several seconds under load.
export default defineConfig({ test: { testTimeout: 30000 } });
