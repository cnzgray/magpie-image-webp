// 在独立进程里按指定后端跑一次 hook，用于验证 IMAGE_WEBP_BACKEND=wasm 的冷启动路径。
// 输出一行 JSON；data URL 本身不打印。
import { readFileSync } from "node:fs";
import { onRequest } from "../image-webp.hooks.mjs";
import { probeWidth } from "../lib/backends.mjs";

const file = process.argv[2];
const mime = process.argv[3] || "png";
const width = Number(process.argv[4] || 1600);
const bytes = readFileSync(file);
const url = `data:image/${mime};base64,${bytes.toString("base64")}`;
const body = {
  messages: [{ role: "user", content: [{ type: "image_url", image_url: { url } }] }],
};

const started = performance.now();
const out = await onRequest(body, {
  agent: "dsh",
  options: { width, quality: 85, min: 0 },
});
const ms = Math.round(performance.now() - started);
const result = out?.messages[0]?.content?.[0]?.image_url?.url ?? null;
const webp = result ? Buffer.from(result.slice(result.indexOf(",") + 1), "base64") : null;

console.log(
  JSON.stringify({
    ms,
    changed: Boolean(result),
    mime: result ? result.slice(5, result.indexOf(";")) : null,
    in_bytes: bytes.length,
    out_bytes: webp?.length ?? null,
    out_width: webp ? probeWidth(webp) : null,
  }),
);
