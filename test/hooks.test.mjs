import { describe, expect, test } from "bun:test";
import { onRequest } from "../image-webp.hooks.mjs";
import { probeWidth } from "../lib/backends.mjs";
import { makePng } from "./png.mjs";

const BIG = makePng(2000, 300, 7);
const SMALL = makePng(64, 64, 3);

function dataUrl(buf, mime = "image/png") {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function payload(url) {
  return {
    model: "deepseek-v4.1-flash",
    messages: [{ role: "user", content: [{ type: "image_url", image_url: { url } }] }],
  };
}

const ctx = (options = {}, extra = {}) => ({ agent: "dsh", options, ...extra });

describe("agent and size gating", () => {
  test("other agents pass through untouched", async () => {
    const url = dataUrl(BIG);
    const body = payload(url);
    expect(await onRequest(body, ctx({}, { agent: "claude-code" }))).toBeUndefined();
    expect(body.messages[0].content[0].image_url.url).toBe(url);
  });

  test("empty agents list applies to every agent", async () => {
    const out = await onRequest(payload(dataUrl(SMALL)), ctx({ agents: [], min: 0 }));
    expect(out).toBeDefined();
    expect(out.messages[0].content[0].image_url.url).toStartWith("data:image/webp;base64,");
  });

  test("images below min stay as they are", async () => {
    const url = dataUrl(SMALL);
    expect(await onRequest(payload(url), ctx())).toBeUndefined();
  });

  test("requests without images return undefined", async () => {
    expect(await onRequest({ model: "x", messages: [{ role: "user", content: "hi" }] }, ctx())).toBeUndefined();
    expect(await onRequest(null, ctx())).toBeUndefined();
  });

  test("existing webp and svg data urls are skipped", async () => {
    const body = {
      messages: [
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/webp;base64,AAAA" } }] },
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/svg+xml;base64,PHN2Zz4=" } }] },
      ],
    };
    expect(await onRequest(body, ctx({ min: 0 }))).toBeUndefined();
  });
});

describe("webp conversion", () => {
  test("converts and downsamples to the configured width", async () => {
    const body = payload(dataUrl(BIG));
    const out = await onRequest(body, ctx());
    expect(out).toBeDefined();
    const url = out.messages[0].content[0].image_url.url;
    expect(url).toStartWith("data:image/webp;base64,");
    const webp = Buffer.from(url.split(",")[1], "base64");
    expect(webp.length).toBeLessThan(BIG.length);
    expect(probeWidth(webp)).toBe(1600);
  });

  test("max caps how many images are replaced", async () => {
    const urls = [dataUrl(BIG), dataUrl(makePng(1200, 200, 11)), dataUrl(makePng(1200, 200, 13))];
    const body = {
      messages: [{ role: "user", content: urls.map((url) => ({ type: "image_url", image_url: { url } })) }],
    };
    const out = await onRequest(body, ctx({ max: 2 }));
    const result = out.messages[0].content.map((c) => c.image_url.url);
    expect(result.filter((u) => u.startsWith("data:image/webp;")).length).toBe(2);
    expect(result[2]).toBe(urls[2]);
  });

  test("corrupt image data fails open without throwing", async () => {
    const url = "data:image/png;base64," + Buffer.alloc(200_000, 0x41).toString("base64");
    const body = payload(url);
    expect(await onRequest(body, ctx())).toBeUndefined();
    expect(body.messages[0].content[0].image_url.url).toBe(url);
  });

  test("quality option reaches the encoder", async () => {
    const url = dataUrl(BIG);
    const low = await onRequest(payload(url), ctx({ quality: 20 }));
    const high = await onRequest(payload(url), ctx({ quality: 90 }));
    const size = (out) => Buffer.from(out.messages[0].content[0].image_url.url.split(",")[1], "base64").length;
    expect(size(low)).toBeLessThan(size(high));
  });
});

describe("cache", () => {
  test("the second identical request is served from cache", async () => {
    const url = dataUrl(makePng(2000, 300, 77));
    const started = performance.now();
    const first = await onRequest(payload(url), ctx());
    const cold = performance.now() - started;
    const cachedStarted = performance.now();
    const second = await onRequest(payload(url), ctx());
    const cached = performance.now() - cachedStarted;
    const firstUrl = first.messages[0].content[0].image_url.url;
    const secondUrl = second.messages[0].content[0].image_url.url;
    expect(secondUrl).toBe(firstUrl);
    expect(cached).toBeLessThan(cold / 3);
  });
});
