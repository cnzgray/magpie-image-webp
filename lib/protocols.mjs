// 从请求体里收集内联图片。
//
// 覆盖四种协议：
// - chat / responses：`data:image/...;base64,...` 字符串
// - anthropic：`{ type: "image", source: { type: "base64", media_type, data } }`
// - gemini：`{ inlineData: { mimeType, data } }`，也接受 snake_case 的 inline_data
// 非内联引用（anthropic 的 url、gemini 的 fileData）原样保留。
const DATA_URL = /^data:image\/([^;,]+);base64,(.*)$/is;

const SKIP_MIME = new Set(["webp", "svg+xml"]);

function subtype(mime) {
  if (typeof mime !== "string" || !mime.toLowerCase().startsWith("image/")) return "";
  return mime.slice(6).toLowerCase();
}

export function collectImages(body) {
  const jobs = [];
  if (!body || typeof body !== "object") return jobs;

  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    const source = value.source;
    if (source && typeof source === "object" && source.type === "base64" && typeof source.data === "string") {
      const mime = subtype(source.media_type);
      if (mime && !SKIP_MIME.has(mime) && !source.data.startsWith("data:")) {
        jobs.push({ kind: "anthropic", source, mime, bytes: Buffer.from(source.data, "base64") });
      }
    }

    for (const field of ["inlineData", "inline_data"]) {
      const inline = value[field];
      if (!inline || typeof inline !== "object" || typeof inline.data !== "string") continue;
      const mimeField =
        typeof inline.mimeType === "string" ? "mimeType" : typeof inline.mime_type === "string" ? "mime_type" : "";
      const mime = mimeField ? subtype(inline[mimeField]) : "";
      if (!mime || SKIP_MIME.has(mime)) continue;
      jobs.push({ kind: "gemini", container: inline, mimeField, mime, bytes: Buffer.from(inline.data, "base64") });
    }

    for (const key of Object.keys(value)) {
      const v = value[key];
      if (typeof v === "string") {
        // 图片容器自身的数据字段不是 data URL 协议，避免把 anthropic/gemini 结构改坏。
        if (key === "data" && (value.media_type || value.mimeType || value.mime_type)) continue;
        if (!v.startsWith("data:image/")) continue;
        const m = DATA_URL.exec(v);
        if (!m || SKIP_MIME.has(m[1].toLowerCase())) continue;
        jobs.push({ kind: "data-url", target: value, key, mime: m[1].toLowerCase(), bytes: Buffer.from(m[2], "base64") });
      } else if (v && typeof v === "object") {
        walk(v);
      }
    }
  };

  walk(body);
  return jobs;
}

// 把编码后的 WebP base64 写回原结构，同时更新声明的 MIME。
export function applyImage(job, base64) {
  switch (job.kind) {
    case "data-url":
      job.target[job.key] = `data:image/webp;base64,${base64}`;
      return;
    case "anthropic":
      job.source.data = base64;
      job.source.media_type = "image/webp";
      return;
    case "gemini":
      job.container.data = base64;
      job.container[job.mimeField] = "image/webp";
      return;
  }
}
