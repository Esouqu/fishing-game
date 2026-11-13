import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // Relative URLs keep the build working both at a custom domain root and at
  // https://<user>.github.io/<repo>/ without a hard-coded repository name.
  base: "./",
  server: {
    port: 8080,
    open: false,
  },
  build: {
    target: "es2020",
  },
});
