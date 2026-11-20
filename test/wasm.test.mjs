import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makePng } from "./png.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "image-webp-wasm-test-"));
const file = join(dir, "input.png");
writeFileSync(file, makePng(2000, 300, 21));

function run(mime) {
  const proc = Bun.spawnSync([process.execPath, "test/wasm-smoke.mjs", file, mime], {
    cwd: root,
    env: { ...process.env, IMAGE_WEBP_BACKEND: "wasm" },
  });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  const lines = proc.stdout.toString().trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

describe("wasm backend", () => {
  test("compresses png and downsamples to the configured width", () => {
    const r = run("png");
    expect(r.changed).toBe(true);
    expect(r.mime).toBe("image/webp");
    expect(r.out_width).toBe(1600);
    expect(r.out_bytes).toBeLessThan(r.in_bytes);
  });

  test("non-png input is left untouched", () => {
    const r = run("jpeg");
    expect(r.changed).toBe(false);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));
});
