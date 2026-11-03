function hasExtension(specifier) {
  return /\.[cm]?[jt]s$/.test(specifier) || specifier.endsWith(".json") || specifier.endsWith(".mjs");
}

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !hasExtension(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
