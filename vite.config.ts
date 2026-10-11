import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Served from the root of abstract.dannyobrien.dev
export default defineConfig({
  base: "/",
  plugins: [solid(), tailwindcss()],
});
