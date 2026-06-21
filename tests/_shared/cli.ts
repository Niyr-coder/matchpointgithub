/** True cuando el archivo se ejecuta con tsx/node, no cuando se importa. */
export function isDirectRun(fragment: string): boolean {
  const arg = process.argv[1]?.replace(/\\/g, "/") ?? "";
  return arg.includes(fragment);
}
