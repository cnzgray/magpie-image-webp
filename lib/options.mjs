// 选项归一化。默认值与 package.json 的 magpie.options 一致。
export const DEFAULTS = Object.freeze({
  agents: ["dsh"],
  width: 1600,
  quality: 85,
  max: 4,
  min: 131072,
  cacheMB: 64,
  gatewayTimeoutMs: 5000,
});

function int(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function resolveOptions(options) {
  const o = { ...DEFAULTS, ...(options && typeof options === "object" ? options : {}) };
  return {
    // 空数组表示所有 agent。
    agents: Array.isArray(o.agents) ? o.agents.map(String) : DEFAULTS.agents,
    width: int(o.width, 64, 8192, DEFAULTS.width),
    quality: int(o.quality, 1, 100, DEFAULTS.quality),
    max: int(o.max, 1, 32, DEFAULTS.max),
    min: int(o.min, 0, 1 << 30, DEFAULTS.min),
    // 0 关闭缓存；按压缩结果的字节数计。
    cacheMB: int(o.cacheMB, 0, 4096, DEFAULTS.cacheMB),
    // 由 magpie 读取并限制本 hook 的执行时间，100–30000。
    gatewayTimeoutMs: int(o.gatewayTimeoutMs, 100, 30000, DEFAULTS.gatewayTimeoutMs),
  };
}
