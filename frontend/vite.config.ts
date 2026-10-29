import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localBackendPlugin } from "./dev/local-backend";

export default defineConfig({
  base: "/",
  plugins: [react(), localBackendPlugin()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
  },
});
