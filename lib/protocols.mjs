// 从请求体里收集内联 data URL 图片。
//
// 覆盖 chat 与 responses 两种协议：两者的图片都是 `data:image/...;base64,...`
// 字符串，位置不同，但都藏在 JSON 里。anthropic 的 `source.data` 和 gemini 的
// `inlineData.data` 不是 data URL，属于下一个里程碑。
const DATA_URL = /^data:image\/([^;,]+);base64,(.*)$/is;

const SKIP_MIME = new Set(["webp", "svg+xml"]);

export function collectDataUrlImages(body) {
  const jobs = [];
  if (!body || typeof body !== "object") return jobs;

  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (typeof v === "string") {
        if (!v.startsWith("data:image/")) continue;
        const m = DATA_URL.exec(v);
        if (!m || SKIP_MIME.has(m[1].toLowerCase())) continue;
        jobs.push({
          target: value,
          key,
          mime: m[1].toLowerCase(),
          bytes: Buffer.from(m[2], "base64"),
        });
      } else if (v && typeof v === "object") {
        walk(v);
      }
    }
  };

  walk(body);
  return jobs;
}
