// cases.json 的协议用例：像网关一样调用 onRequest，图片由当前生成器提供。
import { describe, expect, test } from "bun:test";
import cases from "../cases.json";
import { onRequest } from "../image-webp.hooks.mjs";
import { makePng } from "./png.mjs";

const png = makePng(64, 64, 5);
const base64 = png.toString("base64");

function fill(value) {
  if (typeof value === "string") {
    if (value === "$base64") return base64;
    return value.replaceAll("$base64", base64);
  }
  if (Array.isArray(value)) return value.map(fill);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
  }
  return value;
}

function at(obj, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), obj);
}

describe("protocol cases", () => {
  for (const c of cases) {
    test(c.name, async () => {
      const body = fill(structuredClone(c.body));
      const before = structuredClone(body);
      const out = await onRequest(body, {
        agent: "dsh",
        options: { min: 0, ...(c.options || {}) },
      });
      const after = out ?? body;

      expect(Boolean(out)).toBe(c.expect_changed);

      for (const image of c.expect_images || []) {
        const value = at(after, image.data);
        if (image.kind === "data_url") {
          expect(value).toStartWith("data:image/webp;base64,");
          const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
          expect(bytes.length).toBeGreaterThan(0);
        } else {
          expect(value).not.toBe(at(before, image.data));
          const bytes = Buffer.from(value, "base64");
          expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
          expect(bytes.toString("latin1", 8, 12)).toBe("WEBP");
          expect(at(after, image.mime)).toBe("image/webp");
        }
      }

      for (const path of c.expect_same || []) {
        expect(at(after, path)).toEqual(at(before, path));
      }
    });
  }
});
