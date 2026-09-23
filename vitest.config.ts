import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
    env: {
      PLATFORM_SUPER_ADMIN_EMAIL: "superadmin@example.edu",
      PACKAGE_ADVISER_EMAIL: "adviser@example.edu",
      VIEW_AS_LIMITED_ACTORS: "limited@example.edu=viewer@example.com"
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});

