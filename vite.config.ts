/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE_PATH lets the same build work at the repo root ("/") or under a
// GitHub Pages project path ("/overlap/"). It is set in the deploy workflow.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
