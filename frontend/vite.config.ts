import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    port: 5173,
    // Browser calls /api/... on :5173; Vite forwards them to the Express API on :8000.
    // Same origin for the browser => no CORS setup needed for our own API.
    proxy: { "/api": "http://localhost:8000" },
  },
});
