import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dashboard hydration boundary", () => {
  it("renders the data-fetching Solid dashboard only in the browser", async () => {
    const source = await readFile(new URL("./index.astro", import.meta.url), "utf8");
    expect(source).toContain('client:only="solid-js"');
    expect(source).not.toContain("client:load");
  });
});
