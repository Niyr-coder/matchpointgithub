import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tests/e2e/**",
    "playwright.config.ts",
  ]),
  {
    rules: {
      // El plugin react-hooks (React 19) flagea TODO setState dentro de useEffect.
      // En nuestro código son patrones legítimos: cargar de localStorage en mount,
      // hidratar count desde fetch, suscribirse a realtime y guardar el resultado.
      // Migrar a useSyncExternalStore para cada caso sería overkill. Lo dejamos
      // como warning para detectar regresiones pero no bloquear el build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
