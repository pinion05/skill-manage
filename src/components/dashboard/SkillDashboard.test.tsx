// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventorySnapshot } from "../../lib/inventory/types";
import { SkillDashboard } from "./SkillDashboard";

function inventory(name = "alpha"): InventorySnapshot {
  return {
    scanMode: "official",
    officialSources: { agents: [], roots: [] },
    generatedAt: "2026-07-18T01:00:00.000Z",
    durationMs: 42,
    searchRoots: ["/Users/me"],
    skills: [
      {
        id: "skill-alpha",
        name,
        description: "브라우저를 제어하는 테스트 스킬",
        path: "/Users/me/.codex/skills/alpha/SKILL.md",
        fileName: "SKILL.md",
        recordType: "skill",
        skillsRoot: "/Users/me/.codex/skills",
        configRoot: "/Users/me/.codex",
        agent: "OpenAI Codex",
        kind: "user/global-config",
        modifiedAt: "2026-07-18T00:00:00.000Z",
        size: 128,
        device: 1,
        inode: 2,
        sourceSightings: [],
      },
    ],
    links: [
      {
        id: "broken-link",
        path: "/Users/me/.qwen/skills/missing",
        target: "/Users/me/.agents/skills/missing",
        configRoot: "/Users/me/.qwen",
        agent: "Qwen Code",
        status: "broken",
        containsSkill: false,
      },
    ],
    roots: [
      {
        configRoot: "/Users/me/.codex",
        agent: "OpenAI Codex",
        skillCount: 1,
        documentCount: 0,
        healthyLinks: 0,
        brokenLinks: 0,
      },
      {
        configRoot: "/Users/me/.qwen",
        agent: "Qwen Code",
        skillCount: 0,
        documentCount: 0,
        healthyLinks: 0,
        brokenLinks: 1,
      },
    ],
    errors: {
      count: 1,
      samples: [{ path: "/Users/me/Library/Protected", code: "EACCES", message: "접근 권한이 없습니다." }],
    },
    stats: {
      matchedFiles: 1,
      skillDefinitions: 1,
      documents: 0,
      uniqueNames: 1,
      configRoots: 1,
      healthyLinks: 0,
      brokenLinks: 1,
      errorCount: 1,
    },
  };
}

function duplicateInventory(): InventorySnapshot {
  const snapshot = inventory("Alpha");
  const first = snapshot.skills[0]!;
  snapshot.skills = [
    first,
    {
      ...first,
      id: "skill-alpha-claude",
      name: "alpha",
      path: "/Users/me/.claude/skills/alpha/SKILL.md",
      skillsRoot: "/Users/me/.claude/skills",
      configRoot: "/Users/me/.claude",
      agent: "Claude Code",
      inode: 3,
    },
  ];
  snapshot.stats.matchedFiles = 2;
  snapshot.stats.skillDefinitions = 2;
  snapshot.roots[0]!.skillCount = 2;
  return snapshot;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillDashboard", () => {
  it("loads the inventory and filters the visible skill list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(inventory())));
    render(() => <SkillDashboard />);

    expect(screen.getByText("파일시스템을 읽는 중")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /alpha 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: 'strong[data-stat="skills"]' })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(document.querySelector("td.skill-description")).toHaveAttribute("headers", "skill-column-description");
    expect(document.querySelector("td.skill-source")).toHaveAttribute("headers", "skill-column-source");
    expect(document.querySelector("td.skill-date")).toHaveAttribute("headers", "skill-column-modified");
    expect(screen.getByText("/Users/me/.codex", { selector: "code.skill-config-root" })).toBeInTheDocument();

    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "없는 스킬" } });
    expect(screen.getByText("조건에 맞는 skill이 없습니다.")).toBeInTheDocument();
  });

  it("renders every filtered skill in one ledger without pagination", async () => {
    const manySkills = inventory();
    const template = manySkills.skills[0]!;
    manySkills.skills = Array.from({ length: 61 }, (_, index) => ({
      ...template,
      id: `skill-${index}`,
      name: `skill-${String(index).padStart(2, "0")}`,
      path: `/Users/me/.codex/skills/skill-${index}/SKILL.md`,
      inode: index + 1,
    }));
    manySkills.stats.matchedFiles = 61;
    manySkills.stats.skillDefinitions = 61;
    manySkills.stats.uniqueNames = 61;
    manySkills.roots[0]!.skillCount = 61;

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(manySkills)));
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: "skill-00 상세 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "skill-60 상세 보기" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /skill-\d+ 상세 보기/ })).toHaveLength(61);
    expect(screen.queryByRole("navigation", { name: "Skill 목록 페이지" })).not.toBeInTheDocument();
  });

  it("shows duplicate installs by normalized name and opens their detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/skills/content")
          ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
          : jsonResponse(duplicateInventory()),
      ),
    );
    render(() => <SkillDashboard />);

    const tab = await screen.findByRole("button", { name: "중복 설치 1" });
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "필터에 없는 이름" } });
    expect(screen.getByText("조건에 맞는 skill이 없습니다.")).toBeInTheDocument();
    expect(tab).toHaveAccessibleName("중복 설치 1");
    fireEvent.click(tab);
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("2곳 설치")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/.codex", { selector: "code.duplicate-config-root" })).toBeInTheDocument();
    expect(screen.getByText("/Users/me/.claude/skills/alpha/SKILL.md")).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "alpha · Claude Code · 사용자 설정 · /Users/me/.claude · /Users/me/.claude/skills/alpha/SKILL.md 상세 보기",
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("alpha");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows an empty state when no skill name is installed twice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(inventory())));
    render(() => <SkillDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "중복 설치 0" }));
    expect(screen.getByText("중복 설치된 skill이 없습니다.")).toBeInTheDocument();
  });

  it("updates duplicate groups after a manual filesystem refresh", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      jsonResponse(init?.method === "POST" ? duplicateInventory() : inventory()),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: "중복 설치 0" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "파일시스템 재검색" }));
    expect(await screen.findByRole("button", { name: "중복 설치 1" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/inventory/refresh", { method: "POST" });
  });

  it("shows scan-error samples and link aggregates by configuration root", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(inventory())));
    render(() => <SkillDashboard />);

    await screen.findByRole("button", { name: /alpha 상세 보기/ });
    fireEvent.click(screen.getByText("검색 경고 1개"));
    expect(screen.getByText("/Users/me/Library/Protected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /링크 상태/ }));
    expect(screen.getByText("/Users/me/.qwen", { selector: "code.root-path" })).toBeInTheDocument();
  });

  it("moves focus into the detail and restores it after Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/skills/content")
          ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
          : jsonResponse(inventory()),
      ),
    );
    render(() => <SkillDashboard />);

    const trigger = await screen.findByRole("button", { name: /alpha 상세 보기/ });
    fireEvent.click(trigger);
    const heading = await screen.findByRole("heading", { name: "alpha" });
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "경로 복사" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "상세 닫기" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("refreshes and opens sanitized skill detail content", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/skills/content")) {
        return jsonResponse({
          id: "skill-alpha",
          path: "/Users/me/.codex/skills/alpha/SKILL.md",
          markdown: "# Alpha",
          html: "<h1>Alpha content</h1>",
        });
      }
      if (init?.method === "POST") return jsonResponse(inventory("alpha-refreshed"));
      return jsonResponse(inventory());
    });
    vi.stubGlobal("fetch", fetchMock);
    render(() => <SkillDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /alpha 상세 보기/ }));
    expect(await screen.findByRole("heading", { name: "Alpha content" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "파일시스템 재검색" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /alpha-refreshed 상세 보기/ })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/inventory/refresh", { method: "POST" });
    expect(screen.getByText("파일시스템 재검색이 완료되었습니다.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
