// 普通脚本：magpie 的页面在 sandbox="allow-scripts" 的 iframe 里，ES module 会被拒绝加载。
const DEFAULTS = globalThis.IMAGE_WEBP_DEFAULTS;

const el = (id) => document.getElementById(id);
const field = {
  agents: el("agent-chips"),
  agentInput: el("agent-input"),
  width: el("width"),
  quality: el("quality"),
  qualityOut: el("quality-out"),
  max: el("max"),
  min: el("min"),
  cache: el("cache"),
  timeout: el("timeout"),
  save: el("save"),
  reset: el("reset"),
  status: el("status"),
};

const LIMITS = {
  width: [64, 8192],
  quality: [1, 100],
  max: [1, 32],
  cacheMB: [0, 4096],
  gatewayTimeoutMs: [100, 30000],
};
const MIN_BYTES_MAX = 1 << 30;

let agents = [];
let saved = null;
let busy = false;
let savedAt = 0;

function clamp(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalize(options) {
  const o = { ...DEFAULTS, ...(options ?? {}) };
  return {
    agents: Array.isArray(o.agents) ? [...new Set(o.agents.map(String).map((s) => s.trim()).filter(Boolean))] : [],
    width: clamp(o.width, LIMITS.width, DEFAULTS.width),
    quality: clamp(o.quality, LIMITS.quality, DEFAULTS.quality),
    max: clamp(o.max, LIMITS.max, DEFAULTS.max),
    min: clamp(o.min, [0, MIN_BYTES_MAX], DEFAULTS.min),
    cacheMB: clamp(o.cacheMB, LIMITS.cacheMB, DEFAULTS.cacheMB),
    gatewayTimeoutMs: clamp(o.gatewayTimeoutMs, LIMITS.gatewayTimeoutMs, DEFAULTS.gatewayTimeoutMs),
  };
}

function kilobytes(bytes) {
  const n = bytes / 1024;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

function collect() {
  return normalize({
    agents,
    width: field.width.value,
    quality: field.quality.value,
    max: field.max.value,
    min: Math.round(Number(field.min.value || 0) * 1024),
    cacheMB: field.cache.value,
    gatewayTimeoutMs: field.timeout.value,
  });
}

function setStatus(state, text) {
  field.status.dataset.state = state;
  field.status.textContent = text;
}

function fill(options) {
  agents = [...options.agents];
  renderAgents();
  field.width.value = options.width;
  field.quality.value = options.quality;
  field.qualityOut.textContent = options.quality;
  field.max.value = options.max;
  field.min.value = kilobytes(options.min);
  field.cache.value = options.cacheMB;
  field.timeout.value = options.gatewayTimeoutMs;
}

function updateDirty() {
  const dirty = JSON.stringify(collect()) !== JSON.stringify(saved);
  field.save.disabled = busy || !dirty;
  if (busy) return;
  setStatus(dirty ? "dirty" : "saved", dirty ? "有未保存的修改" : savedAt ? "已保存" : "");
}

function renderAgents() {
  field.agents.replaceChildren(
    ...agents.map((agent) => {
      const item = document.createElement("li");
      item.className = "chip";
      const name = document.createElement("span");
      name.textContent = agent;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `移除 ${agent}`);
      remove.addEventListener("click", () => {
        agents = agents.filter((value) => value !== agent);
        renderAgents();
        updateDirty();
        field.agentInput.focus();
      });
      item.append(name, remove);
      return item;
    }),
  );
}

function commitAgent() {
  const parts = field.agentInput.value.split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return;
  for (const part of parts) if (!agents.includes(part)) agents.push(part);
  field.agentInput.value = "";
  renderAgents();
  updateDirty();
}

async function save() {
  if (busy) return;
  const next = normalize(collect());
  busy = true;
  field.save.disabled = true;
  setStatus("saving", "保存中…");
  try {
    const wait = Math.max(0, 1000 - (Date.now() - savedAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    saved = normalize((await magpie.options.set(next)) ?? next);
    savedAt = Date.now();
    fill(saved);
    setStatus("saved", "已保存");
  } catch {
    setStatus("error", "保存失败，请重试");
  } finally {
    busy = false;
    field.save.disabled = JSON.stringify(collect()) === JSON.stringify(saved);
  }
}

function clampOnChange(input, limit, fallback) {
  input.addEventListener("input", updateDirty);
  input.addEventListener("change", () => {
    input.value = String(clamp(input.value, limit, fallback));
    updateDirty();
  });
}

clampOnChange(field.width, LIMITS.width, DEFAULTS.width);
clampOnChange(field.max, LIMITS.max, DEFAULTS.max);
clampOnChange(field.cache, LIMITS.cacheMB, DEFAULTS.cacheMB);
clampOnChange(field.timeout, LIMITS.gatewayTimeoutMs, DEFAULTS.gatewayTimeoutMs);

field.min.addEventListener("input", updateDirty);
field.min.addEventListener("change", () => {
  const n = Number(field.min.value);
  field.min.value = Number.isFinite(n) && n > 0 ? String(Math.min(n, MIN_BYTES_MAX / 1024)) : "0";
  updateDirty();
});

field.quality.addEventListener("input", () => {
  field.qualityOut.textContent = field.quality.value;
  updateDirty();
});

field.agentInput.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    commitAgent();
  } else if (event.key === "Backspace" && !field.agentInput.value && agents.length) {
    agents.pop();
    renderAgents();
    updateDirty();
  }
});
field.agentInput.addEventListener("blur", commitAgent);

field.reset.addEventListener("click", () => {
  fill(normalize(DEFAULTS));
  updateDirty();
});

field.save.addEventListener("click", save);

async function init() {
  try {
    await magpie.ready;
    saved = normalize(await magpie.options.get());
    fill(saved);
    field.save.disabled = true;
    setStatus("", "");
  } catch {
    setStatus("error", "读取设置失败，请重新打开页面");
  }
}

init();
