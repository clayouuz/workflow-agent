import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Expand a leading ~ without treating it as a literal directory name. */
export function expandUserPath(input: string): string {
  const value = input.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

/** Keep user-facing paths portable while retaining caller-provided relative paths. */
export function toPortablePath(input: string): string {
  const value = input.trim();
  if (!isAbsolute(value)) return value.replaceAll("\\", "/");
  const absolute = resolve(value);
  const home = resolve(homedir());
  if (absolute === home || absolute.startsWith(`${home}${sep}`)) {
    const suffix = relative(home, absolute).replaceAll("\\", "/");
    return suffix ? `~/${suffix}` : "~";
  }
  const cwd = resolve(process.cwd());
  if (absolute === cwd || absolute.startsWith(`${cwd}${sep}`)) {
    const suffix = relative(cwd, absolute).replaceAll("\\", "/");
    return suffix || ".";
  }
  return absolute.replaceAll("\\", "/");
}
