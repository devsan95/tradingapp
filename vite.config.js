import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/.git/**", "**/.vs/**", "**/node_modules/**", "**/dist/**"]
    }
  }
});
