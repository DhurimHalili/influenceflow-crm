// Lets node run the app's TypeScript tests directly: the app imports
// "./utils" (bundler style), node needs "./utils.ts".
// Run: node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/<name>.test.ts
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + ".ts", context);
    throw error;
  }
}`));
