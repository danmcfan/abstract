import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// GitHub Pages serves the site from /<repo>/
export default defineConfig({
  base: "/abstract/",
  plugins: [solid(), tailwindcss()],
});
