import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../lib/options.mjs";
import { DEFAULTS as PAGE_DEFAULTS } from "../page/defaults.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageDir = join(root, "page");
const read = (name) => readFileSync(join(pageDir, name), "utf8");
const html = read("index.html");
const js = read("app.js");
const css = read("style.css");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("page manifest", () => {
  test("is served from its own folder with no reads", () => {
    expect(pkg.magpie.page.file).toBe("page/index.html");
    expect(pkg.magpie.permissions).toEqual([]);
    expect(pkg.files).toContain("page");
  });

  test("defaults stay in step with the hook", () => {
    expect(PAGE_DEFAULTS).toEqual({ ...DEFAULTS });
  });

  test("loads only file scripts and local styles", () => {
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag).toContain("src=");
    expect(html).not.toMatch(/<link[^>]+href="(https?:)?\/\//);
    expect(css).not.toMatch(/url\((['"]?)(https?:)?\/\//);
  });
});

describe("page behaviour", () => {
  test("reaches no network and makes no undeclared reads", () => {
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(js).not.toMatch(/magpie\.read\s*\(/);
    expect(js).not.toMatch(/from\s+["'](?!\.\/)/);
  });

  test("every element it looks up exists", () => {
    const ids = new Set([...js.matchAll(/el\("([^"]+)"\)/g)].map((m) => m[1]));
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });

  test("every field has a label and help text", () => {
    for (const id of ["agent-input", "width", "quality", "max", "min", "cache", "timeout"]) {
      expect(html).toContain(`<label for="${id}"`);
      const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
      expect(tag).toContain(`aria-describedby="${id}-help"`);
      expect(html).toContain(`id="${id}-help"`);
    }
  });
});
