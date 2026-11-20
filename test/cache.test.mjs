import { describe, expect, test } from "bun:test";
import { createLru, imageKey } from "../lib/cache.mjs";

const buf = (n, fill) => Buffer.alloc(n, fill);

describe("imageKey", () => {
  test("is a sha256 prefix plus the compression parameters", () => {
    expect(imageKey(buf(8, 1), { width: 1600, quality: 85 })).toMatch(/^[0-9a-f]{16}:1600:85$/);
  });

  test("changes with content, width and quality", () => {
    const a = imageKey(buf(8, 1), { width: 1600, quality: 85 });
    expect(imageKey(buf(8, 2), { width: 1600, quality: 85 })).not.toBe(a);
    expect(imageKey(buf(8, 1), { width: 1200, quality: 85 })).not.toBe(a);
    expect(imageKey(buf(8, 1), { width: 1600, quality: 90 })).not.toBe(a);
  });
});

describe("lru cache", () => {
  test("evicts the least recently used entry when bytes overflow", () => {
    const cache = createLru({ maxBytes: 10, maxEntries: 10 });
    const a = buf(4, 1);
    const b = buf(4, 2);
    const c = buf(4, 3);
    cache.set("a", a);
    cache.set("b", b);
    expect(cache.get("a")).toBe(a);
    cache.set("c", c);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe(a);
    expect(cache.get("c")).toBe(c);
  });

  test("bounds the entry count", () => {
    const cache = createLru({ maxBytes: 100, maxEntries: 2 });
    cache.set("a", buf(1, 1));
    cache.set("b", buf(1, 2));
    cache.set("c", buf(1, 3));
    expect(cache.get("a")).toBeNull();
    expect(cache.get("c")).not.toBeNull();
    expect(cache.size).toBe(2);
  });

  test("does not cache when the byte budget is zero", () => {
    const cache = createLru({ maxBytes: 0 });
    cache.set("a", buf(1, 1));
    expect(cache.get("a")).toBeNull();
    expect(cache.size).toBe(0);
  });

  test("replacing a key keeps the byte accounting correct", () => {
    const cache = createLru({ maxBytes: 100 });
    cache.set("a", buf(4, 1));
    cache.set("a", buf(6, 2));
    expect(cache.bytes).toBe(6);
    expect(cache.get("a").length).toBe(6);
  });
});
