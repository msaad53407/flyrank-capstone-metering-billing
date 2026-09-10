import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/demo/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/generate": "http://localhost:8000",
      "/usage": "http://localhost:8000",
      "/billing": "http://localhost:8000",
      "/webhooks": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
