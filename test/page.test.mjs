import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../lib/options.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageDir = join(root, "page");
const read = (name) => readFileSync(join(pageDir, name), "utf8");
const html = read("index.html");
const js = read("app.js");
const css = read("style.css");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const pageScope = {};
new Function("globalThis", read("defaults.js"))(pageScope);
const PAGE_DEFAULTS = pageScope.IMAGE_WEBP_DEFAULTS;

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

  test("declares the metadata Magpie's listing reads", () => {
    expect(pkg.magpie.name.length).toBeLessThanOrEqual(80);
    expect(pkg.magpie.summary.en).toBeTruthy();
    expect(pkg.magpie.summary.zh).toBeTruthy();
    expect(pkg.magpie.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.byteLength(pkg.magpie.icon)).toBeLessThan(1024 * 1024);
    expect(Buffer.from(pkg.magpie.icon.split(",")[1], "base64").toString()).toBe(read("icon.svg"));
  });

  test("ships a registry entry that matches the package", () => {
    const entry = JSON.parse(readFileSync(join(root, "community/registry-entry.json"), "utf8"));
    expect(entry.package).toBe(pkg.name);
    expect(entry.kind).toBe("middleware");
    expect(entry.summary.en).toBeTruthy();
  });

  test("uses classic scripts, since a sandboxed frame refuses modules", () => {
    expect(html).not.toMatch(/type="module"/);
    for (const script of [js, read("defaults.js")]) {
      expect(script).not.toMatch(/^\s*(import|export)\b/m);
    }
  });

  test("saves without form submission, which a sandboxed frame blocks", () => {
    expect(html).toMatch(/<button id="save" type="button"/);
    expect(js).not.toMatch(/addEventListener\("submit"/);
  });
});

describe("page behaviour", () => {
  test("reaches no network and makes no undeclared reads", () => {
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(js).not.toMatch(/magpie\.read\s*\(/);
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
