// OpenAPI registry. Every Route Handler is paired with a registerPath() call
// (kept next to the handler in route.openapi.ts files). On build, the
// scripts/build-openapi.ts importer pulls them all in and emits public/openapi.json.
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

// Single security scheme registration. Done once, referenced via { bearerAuth: [] }.
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "sb-access-token",
});
