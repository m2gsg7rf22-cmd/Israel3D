import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Project pages are served from https://<user>.github.io/Israel3D/, so
  // asset URLs in the built bundle need that base path; the dev server
  // still runs at the root for convenience.
  base: command === "build" ? "/Israel3D/" : "/",
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
}));
