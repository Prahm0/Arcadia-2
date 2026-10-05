// The Worker's imports leave off ".ts" and import ../db as a folder, which the
// bundler allows and Node doesn't. Fill those in (same as planChanges.test.mjs).
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith(".") || specifier.endsWith(".ts")) return next(specifier, context);
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try { return next(candidate, context); } catch { /* next shape */ }
    }
    return next(specifier, context);
  },
});
