import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Served from the root of abstract.dannyobrien.dev
export default defineConfig({
  base: "/",
  plugins: [solid(), tailwindcss()],
  // scripts/with-server.sh turns hot reload off, so a file saved mid-run
  // can't reload the page a playthrough is driving.
  server: { hmr: process.env["ABSTRACT_NO_HMR"] !== "1" },
  build: {
    rolldownOptions: {
      output: {
        // Three.js gets its own chunks, so it stays cached when the robot
        // changes. Its core and its renderer are split to keep each under
        // Vite's 500 kB warning.
        codeSplitting: {
          groups: [
            { name: "three-core", test: /node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/ },
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
});
