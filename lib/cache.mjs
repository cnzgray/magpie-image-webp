// 压缩结果缓存：键是输入图片 sha256 的前 16 个十六进制字符加压缩参数，
// 值是有上限的 LRU，容量按字节计，避免历史图片每轮重压。
import { createHash } from "node:crypto";

const PREFIX_CHARS = 16;

export function imageKey(bytes, { width, quality }) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `${digest.slice(0, PREFIX_CHARS)}:${width}:${quality}`;
}

export function createLru({ maxBytes, maxEntries = 256 }) {
  const entries = new Map();
  let bytes = 0;

  return {
    get size() {
      return entries.size;
    },
    get bytes() {
      return bytes;
    },
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return null;
      // 重新插入到末尾，保持 Map 的插入顺序就是最近使用顺序。
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (maxBytes <= 0) return;
      const previous = entries.get(key);
      if (previous !== undefined) {
        entries.delete(key);
        bytes -= previous.length;
      }
      entries.set(key, value);
      bytes += value.length;
      while ((bytes > maxBytes || entries.size > maxEntries) && entries.size) {
        const [oldKey, oldValue] = entries.entries().next().value;
        entries.delete(oldKey);
        bytes -= oldValue.length;
      }
    },
  };
}
