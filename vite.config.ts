import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [wasm(), solid()],
  worker: { format: "es", plugins: () => [wasm()] },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  build: { target: "esnext" },
})
