import { defineConfig } from "vitest/config";

// Host-runner de pandi-sm. Espeja el modelo gst `AT_DIFF_TEST` / smalltalkCI:
// Vitest descubre los tests y emite JUnit XML (gate de CI). SUnit nativo: diferido.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    reporters: ["default"],
    // `test:ci` añade `--reporter=junit`; la ruta sale de aquí (estable entre versiones).
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      reportsDirectory: "reports/coverage",
      include: ["src/**"],
    },
  },
});
