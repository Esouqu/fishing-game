import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 8080,
    open: false,
  },
  build: {
    target: "es2020",
  },
});
