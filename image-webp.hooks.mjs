// Magpie 网关 hook：把请求里的内联图片转成 WebP，并按宽度降采样。
// 支持 chat / responses 的 data URL，以及 Anthropic / Gemini 的内联图片字段。
// 默认只处理 agent=dsh；agents: [] 表示所有 agent。任何异常都 fail-open。
import { getBackend } from "./lib/backends.mjs";
import { createLru, imageKey } from "./lib/cache.mjs";
import { resolveOptions } from "./lib/options.mjs";
import { applyImage, collectImages } from "./lib/protocols.mjs";

let cache = null;
let cacheBudget = -1;

function getCache(budget) {
  if (!cache || cacheBudget !== budget) {
    cache = createLru({ maxBytes: budget });
    cacheBudget = budget;
  }
  return cache;
}

export async function onRequest(body, ctx) {
  try {
    const options = resolveOptions(ctx?.options);
    if (options.agents.length && !options.agents.includes(ctx?.agent)) return undefined;

    const jobs = collectImages(body).filter((j) => j.bytes.length >= options.min);
    if (!jobs.length) return undefined;

    const backend = await getBackend();
    if (!backend) {
      console.warn("[image-webp] no encoder: install dependencies, sharp, or put cwebp on PATH");
      return undefined;
    }

    const replaced = [];
    const cache = options.cacheMB > 0 ? getCache(options.cacheMB * 1024 * 1024) : null;
    for (const job of jobs.slice(0, options.max)) {
      if (ctx?.signal?.aborted) break;
      const key = cache ? imageKey(job.bytes, options) : null;
      const cached = cache?.get(key);
      if (cached) {
        replaced.push({ job, data: cached.toString("base64") });
        console.log(`[image-webp] cache hit ${job.kind} ${job.mime} ${job.bytes.length} bytes`);
        continue;
      }
      try {
        const out = await backend.compress(job.bytes, {
          mime: job.mime,
          width: options.width,
          quality: options.quality,
          signal: ctx?.signal,
        });
        if (!out?.length || out.length >= job.bytes.length) continue;
        cache?.set(key, out);
        replaced.push({ job, data: out.toString("base64") });
        console.log(
          `[image-webp] agent=${ctx?.agent ?? ""} ${job.kind} ${job.mime} ${job.bytes.length} -> ${out.length} bytes (${backend.name})`,
        );
      } catch (e) {
        console.log(`[image-webp] skip: ${e}`);
      }
    }

    if (!replaced.length) return undefined;
    // 全部成功后再落盘，避免半改状态随异常返回。
    for (const { job, data } of replaced) applyImage(job, data);
    return body;
  } catch (e) {
    console.log(`[image-webp] fail-open: ${e}`);
    return undefined;
  }
}
