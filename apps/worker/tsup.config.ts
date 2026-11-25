import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // o pacote compartilhado é TypeScript puro: embutimos no bundle
  noExternal: ["@despachante/shared"],
});
