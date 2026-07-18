import { describe, expect, it } from "vitest";
import { evaluateLocalRequest } from "./request-policy";

describe("evaluateLocalRequest", () => {
  it.each([
    ["127.0.0.1:4321", true],
    ["localhost:4321", true],
    ["[::1]:4321", true],
    ["evil.example:4321", false],
    ["127.0.0.1.evil.example:4321", false],
    ["", false],
  ])("validates Host %s", (host, allowed) => {
    expect(evaluateLocalRequest({ method: "GET", host }).allowed).toBe(allowed);
  });

  it("requires same-origin metadata for mutating requests", () => {
    expect(
      evaluateLocalRequest({
        method: "POST",
        host: "127.0.0.1:4321",
        origin: "http://127.0.0.1:4321",
        protocol: "http:",
        fetchSite: "same-origin",
      }).allowed,
    ).toBe(true);

    expect(
      evaluateLocalRequest({
        method: "POST",
        host: "127.0.0.1:4321",
        origin: "https://attacker.example",
        protocol: "http:",
        fetchSite: "cross-site",
      }),
    ).toMatchObject({ allowed: false, reason: "cross-origin" });

    expect(
      evaluateLocalRequest({
        method: "POST",
        host: "127.0.0.1:4321",
        protocol: "http:",
      }),
    ).toMatchObject({ allowed: false, reason: "missing-origin" });
  });

  it("does not require Origin on safe methods", () => {
    expect(evaluateLocalRequest({ method: "GET", host: "localhost:4321" })).toEqual({ allowed: true });
    expect(evaluateLocalRequest({ method: "HEAD", host: "127.0.0.1" })).toEqual({ allowed: true });
  });
});
