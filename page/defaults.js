// 与 lib/options.mjs 的 DEFAULTS 保持一致；页面只加载自己目录下的文件，
// 只能复制一份，由 test/page.test.mjs 校验两者相等。
// 必须是普通脚本：magpie 的页面跑在 sandbox="allow-scripts" 的 iframe 里，
// ES module 在不透明 origin 下会被拒绝加载。
globalThis.IMAGE_WEBP_DEFAULTS = Object.freeze({
  agents: ["dsh"],
  width: 1600,
  quality: 85,
  max: 4,
  min: 131072,
  cacheMB: 64,
  gatewayTimeoutMs: 5000,
});
