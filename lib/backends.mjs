// 编码后端探测：sharp（若已安装）→ cwebp（PATH 或 IMAGE_WEBP_CWEBP）→ 无。
// 两者都不存在时 hook 静默跳过，请求原样转发。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 读取 PNG / JPEG / WebP 的像素宽度，读不出返回 0。
export function probeWidth(buf) {
  if (!buf || buf.length < 24) return 0;
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") {
    return buf.readUInt32BE(16);
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegWidth(buf);
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    return webpWidth(buf);
  }
  return 0;
}

function jpegWidth(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return 0;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return buf.readUInt16BE(i + 7);
    }
    i += 2 + len;
  }
  return 0;
}

function webpWidth(buf) {
  const chunk = buf.toString("latin1", 12, 16);
  if (chunk === "VP8X") return 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
  if (chunk === "VP8L") return 1 + (buf.readUInt32LE(21) & 0x3fff);
  if (chunk === "VP8 ") return buf.readUInt16LE(26) & 0x3fff;
  return 0;
}

async function sharpBackend() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return null;
  }
  if (typeof sharp !== "function") return null;
  return {
    name: "sharp",
    async compress(buf, { width, quality }) {
      const out = await sharp(buf)
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: "inside" })
        .webp({ quality })
        .toBuffer();
      return Buffer.from(out);
    },
  };
}

function cwebpBackend() {
  const bin = process.env.IMAGE_WEBP_CWEBP || Bun.which("cwebp");
  if (!bin) return null;
  return {
    name: "cwebp",
    async compress(buf, { width, quality, signal }) {
      const dir = mkdtempSync(join(tmpdir(), "magpie-image-webp-"));
      const input = join(dir, "in.img");
      const output = join(dir, "out.webp");
      try {
        await Bun.write(input, buf);
        const args = [bin, "-quiet", "-q", String(quality)];
        if (probeWidth(buf) > width) args.push("-resize", String(width), "0");
        args.push(input, "-o", output);
        const proc = Bun.spawn(args, { stdout: "ignore", stderr: "pipe", signal });
        if ((await proc.exited) !== 0) return null;
        return Buffer.from(await Bun.file(output).arrayBuffer());
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

let backendPromise;

export function getBackend() {
  backendPromise ??= (async () => (await sharpBackend()) ?? cwebpBackend() ?? null)();
  return backendPromise;
}
