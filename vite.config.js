import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// FRONTEND_PORT and API_TARGET are set by start.bat after it picks free ports.
// Defaults keep the original behaviour when the file is used directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.FRONTEND_PORT || 3000),
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
});
