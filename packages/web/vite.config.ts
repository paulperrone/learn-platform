import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:8787",
      "/api": "http://localhost:8787",
    },
  },
});
