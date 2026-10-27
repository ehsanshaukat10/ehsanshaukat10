import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // A Vercel deployment must never silently use browser-local demo accounts.
  define: {
    "import.meta.env.VITE_HOSTED_APP": JSON.stringify(
      process.env.VERCEL === "1",
    ),
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.AYNOR_API_URL || "http://127.0.0.1:3001",
        timeout: 0,
      },
    },
  },
});
