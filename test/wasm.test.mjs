import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import encodeJpeg from "@jsquash/jpeg/encode.js";
import decodePng from "@jsquash/png/decode.js";
import { makePng } from "./png.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "image-webp-wasm-test-"));
const png = makePng(2000, 300, 21);
const pngFile = join(dir, "input.png");
writeFileSync(pngFile, png);

// 用与运行时相同的 wasm 栈生成真实 JPEG，避免依赖系统工具。
const jpegFile = join(dir, "input.jpg");
writeFileSync(jpegFile, Buffer.from(await encodeJpeg(await decodePng(png), { quality: 90 })));

function run(file, mime) {
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
    const r = run(pngFile, "png");
    expect(r.changed).toBe(true);
    expect(r.mime).toBe("image/webp");
    expect(r.out_width).toBe(1600);
    expect(r.out_bytes).toBeLessThan(r.in_bytes);
  });

  test("compresses jpeg and downsamples to the configured width", () => {
    const r = run(jpegFile, "jpeg");
    expect(r.changed).toBe(true);
    expect(r.mime).toBe("image/webp");
    expect(r.out_width).toBe(1600);
    expect(r.out_bytes).toBeLessThan(r.in_bytes);
  });

  test("accepts the jpg alias", () => {
    const r = run(jpegFile, "jpg");
    expect(r.changed).toBe(true);
    expect(r.mime).toBe("image/webp");
  });

  test("undecodable input is left untouched", () => {
    const r = run(pngFile, "jpeg");
    expect(r.changed).toBe(false);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));
});
