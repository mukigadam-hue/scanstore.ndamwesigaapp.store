import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "i18n" || entry.name === "test") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("visible translation labels", () => {
  it("resolves every literal translation key in each supported language", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\b(?:t|i18n\.t)\(\s*["']([\w.:-]+)["']/g)) {
        keys.add(match[1]);
      }
    }

    for (const { code } of SUPPORTED_LANGUAGES) {
      for (const key of keys) {
        expect(i18n.exists(key, { lng: code, count: 2 }), `${code}: ${key}`).toBe(true);
        expect(i18n.t(key, { lng: code, count: 2 }), `${code}: ${key}`).not.toBe(key);
      }
    }
  });
});