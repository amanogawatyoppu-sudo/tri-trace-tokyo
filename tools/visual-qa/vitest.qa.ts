// Runs the map dumps used by the review scripts (not part of npm test).
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tools/visual-qa/*.qa.ts'], testTimeout: 600000 } });
