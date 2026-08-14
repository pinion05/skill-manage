// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventorySnapshot } from "../../lib/inventory/types";
import { SkillDashboard } from "./SkillDashboard";

function inventory(name = "alpha"): InventorySnapshot {
  return {
    scanMode: "official",
    officialSources: {
      shared: { id: "shared", name: "공유 디렉터리", globalPaths: [], projectPaths: [] },
      agents: [],
      roots: [],
    },
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
        contentsTokens: 0,
        descriptionTokens: 0,
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

function sourcedInventory(): InventorySnapshot {
  const snapshot = inventory();
  snapshot.officialSources = {
    shared: {
      id: "shared",
      name: "공유 디렉터리",
      globalPaths: ["/Users/me/.agents/skills"],
      projectPaths: ["**/.agents/skills"],
    },
    agents: [
      {
        id: "claude-code",
        name: "Claude Code",
        documentationUrl: "https://code.claude.com/docs/en/skills",
        globalPaths: ["/Users/me/.claude/skills"],
        projectPaths: ["**/.claude/skills"],
      },
      {
        id: "cursor",
        name: "Cursor",
        documentationUrl: "https://cursor.com/docs/skills",
        globalPaths: ["/Users/me/.cursor/skills"],
        projectPaths: ["**/.cursor/skills"],
      },
    ],
    roots: [
      {
        id: "shared-root",
        path: "/Users/me/.agents/skills",
        canonicalPath: "/Users/me/.shared/skills",
        scope: "user",
        owner: { id: "shared", name: "공유 디렉터리", type: "shared" },
        exists: true,
        skillCount: 1,
      },
      {
        id: "claude-root",
        path: "/Users/me/.claude/skills",
        canonicalPath: "/Users/me/.claude/skills",
        scope: "user",
        owner: { id: "claude-code", name: "Claude Code", type: "agent" },
        exists: true,
        skillCount: 1,
      },
    ],
  };
  snapshot.skills[0]!.sourceSightings = [
    {
      rootPath: "/Users/me/.claude/skills",
      path: "/Users/me/.claude/skills/alpha/SKILL.md",
      scope: "user",
      owner: { id: "claude-code", name: "Claude Code", type: "agent" },
    },
  ];
  return snapshot;
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

function skillViewInventory(): InventorySnapshot {
  const snapshot = inventory("global-skill");
  const globalSkill = snapshot.skills[0]!;
  globalSkill.path = "/Users/me/.claude/skills/global-skill/SKILL.md";
  globalSkill.skillsRoot = "/Users/me/.claude/skills";
  globalSkill.configRoot = "/Users/me/.claude";
  globalSkill.agent = "Claude Code";
  globalSkill.sourceSightings = [
    {
      rootPath: "/Users/me/.claude/skills",
      path: "/Users/me/.claude/skills/global-skill/SKILL.md",
      scope: "user",
      owner: { id: "claude-code", name: "Claude Code", type: "agent" },
    },
    {
      rootPath: "/Users/me/dev/app/.copilot/skills",
      path: "/Users/me/dev/app/.copilot/skills/global-skill/SKILL.md",
      scope: "project",
      owner: { id: "github-copilot", name: "GitHub Copilot", type: "agent" },
    },
  ];
  snapshot.skills = [
    globalSkill,
    {
      ...globalSkill,
      id: "skill-project-only",
      name: "project-only",
      description: "프로젝트 전용 스킬",
      path: "/Users/me/dev/app/.claude/skills/project-only/SKILL.md",
      skillsRoot: "/Users/me/dev/app/.claude/skills",
      configRoot: "/Users/me/dev/app/.claude",
      kind: "project/source-local",
      inode: 3,
      sourceSightings: [
        {
          rootPath: "/Users/me/dev/app/.claude/skills",
          path: "/Users/me/dev/app/.claude/skills/project-only/SKILL.md",
          scope: "project",
          owner: { id: "claude-code", name: "Claude Code", type: "agent" },
        },
        {
          rootPath: "/Users/me/dev/app/.cursor/skills",
          path: "/Users/me/dev/app/.cursor/skills/project-only/SKILL.md",
          scope: "project",
          owner: { id: "cursor", name: "Cursor", type: "agent" },
        },
      ],
    },
    {
      ...globalSkill,
      id: "document-only",
      name: "document-only",
      path: "/Users/me/dev/app/skills.md",
      fileName: "skills.md",
      recordType: "document",
      skillsRoot: "/Users/me/dev/app",
      configRoot: "/Users/me/dev/app",
      kind: "project/source-local",
      inode: 4,
      sourceSightings: [],
      contentsTokens: 0,
      descriptionTokens: 0,
    },
  ];
  snapshot.stats.matchedFiles = 3;
  snapshot.stats.skillDefinitions = 2;
  snapshot.stats.documents = 1;
  snapshot.stats.uniqueNames = 3;
  snapshot.roots[0]!.skillCount = 2;
  snapshot.roots[0]!.documentCount = 1;
  return snapshot;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let esCallCount = 0;

/** Set up a mock EventSource that resolves with the given snapshot data. */
function setupInventorySource(
  resolver: (url: string, callIndex: number) => InventorySnapshot,
): void {
  esCallCount = 0;
  class MockEventSource {
    private listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
    private closed = false;
    readonly url: string;

    constructor(url: string) {
      this.url = url;
      const idx = esCallCount++;
      queueMicrotask(() => {
        if (this.closed) return;
        try {
          const data = resolver(url, idx);
          const event = new MessageEvent("done", { data: JSON.stringify(data) });
          (this.listeners["done"] ?? []).forEach((fn) => fn(event));
        } catch (err) {
          const event = new MessageEvent("error", {
            data: JSON.stringify({ error: err instanceof Error ? err.message : "mock error" }),
          });
          (this.listeners["error"] ?? []).forEach((fn) => fn(event));
        }
      });
    }

    addEventListener(type: string, fn: (e: MessageEvent) => void): void {
      (this.listeners[type] ??= []).push(fn);
    }

    close(): void {
      this.closed = true;
    }
  }
  vi.stubGlobal("EventSource", MockEventSource);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  esCallCount = 0;
});

describe("SkillDashboard", () => {
  it("loads the inventory and filters the visible skill list", async () => {
    setupInventorySource(() => inventory());
    render(() => <SkillDashboard />);

    expect(screen.getByText("파일시스템을 읽는 중")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /alpha 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: 'strong[data-stat="skills"]' })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    // AG Grid renders cells inside .ag-cell wrappers; verify the description/source
    // cell renderers populated the row with the expected content.
    expect(document.querySelector(".ag-row .skill-description")).toHaveTextContent(
      "브라우저를 제어하는 테스트 스킬",
    );
    expect(document.querySelector(".ag-row .skill-config-root")).toHaveTextContent("/Users/me/.codex");
    expect(screen.getByText("/Users/me/.codex", { selector: "code.skill-config-root" })).toBeInTheDocument();

    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "없는 스킬" } });
    expect(screen.getByText("조건에 맞는 skill이 없습니다.")).toBeInTheDocument();
  });

  it("uses official mode by default and switches to a separate full snapshot", async () => {
    const official = inventory("official-alpha");
    const full = inventory("full-alpha");
    full.scanMode = "full";
    setupInventorySource((url) =>
      url.includes("mode=full") ? full : official,
    );
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: /official-alpha 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공식 디렉터리" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 파일시스템" }));

    expect(await screen.findByRole("button", { name: /full-alpha 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 파일시스템" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows one shared owner, vendor-owned paths, and owner-only detail aliases", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/skills/content")
        ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
        : jsonResponse({ error: "should use SSE" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setupInventorySource(() => sourcedInventory());
    render(() => <SkillDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "공식 소스 3" }));
    expect(screen.getAllByRole("heading", { name: "공유 디렉터리" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "공유 디렉터리 공식 문서" })).not.toBeInTheDocument();
    expect(screen.getAllByText("/Users/me/.agents/skills")).toHaveLength(2);

    const docsLink = screen.getByRole("link", { name: "Claude Code 공식 문서" });
    expect(docsLink).toHaveAttribute("href", "https://code.claude.com/docs/en/skills");
    expect(docsLink).toHaveAttribute("rel", "noreferrer noopener");
    const claudeRow = screen.getByRole("heading", { name: "Claude Code" }).closest("article")!;
    const cursorRow = screen.getByRole("heading", { name: "Cursor" }).closest("article")!;
    expect(within(claudeRow).getAllByText("/Users/me/.claude/skills")).toHaveLength(2);
    expect(within(cursorRow).getByText("/Users/me/.cursor/skills")).toBeInTheDocument();
    expect(within(cursorRow).queryByText("/Users/me/.claude/skills")).not.toBeInTheDocument();
    expect(screen.queryByText("compatibility")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skill 파일 1" }));
    fireEvent.click(await screen.findByRole("button", { name: /alpha 상세 보기/ }));
    expect(await screen.findByRole("heading", { name: "공식 소스 경로" })).toBeInTheDocument();
    expect(screen.getByText("/Users/me/.claude/skills/alpha/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === "/api/skills/content?id=skill-alpha&mode=official",
        ),
      ).toBe(true),
    );
  });

  it("shows non-project Skills by agent and merges project aliases by directory", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/skills/content")
        ? jsonResponse({
            id: "skill-project-only",
            path: "/Users/me/dev/app/.claude/skills/project-only/SKILL.md",
            markdown: "# Project only",
            html: "<h1>Project only</h1>",
          })
        : jsonResponse({ error: "should use SSE" }),
    ));
    setupInventorySource(() => skillViewInventory());
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: "에이전트 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "프로젝트 2" })).toBeInTheDocument();

    // Agent tab: skills are rendered in a single AG Grid, grouped by agent label column.
    fireEvent.click(screen.getByRole("button", { name: "에이전트 1" }));
    const agentTrigger = await screen.findByRole("button", { name: /global-skill.*상세 보기/ });
    expect(agentTrigger).toBeInTheDocument();
    // Project-only and document-only records are excluded from the agent (non-project) view.
    expect(screen.queryByText("project-only")).not.toBeInTheDocument();
    expect(screen.queryByText("document-only")).not.toBeInTheDocument();

    // Project tab: directory-grouped grid merges aliases by physical inode.
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 2" }));
    const projectTrigger = await screen.findByRole("button", { name: /project-only.*상세 보기/ });
    expect(projectTrigger).toBeInTheDocument();
    expect(screen.getByText("global-skill")).toBeInTheDocument();
    // The project directory leaf is rendered as a group label on every row.
    expect(screen.getAllByText("app").length).toBeGreaterThan(0);

    fireEvent.click(projectTrigger);
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("project-only");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(projectTrigger).toHaveFocus());
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

    setupInventorySource(() => manySkills);
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: "skill-00 상세 보기" })).toBeInTheDocument();
    // AG Grid virtualizes rows; verify the full dataset is loaded via aria-rowcount
    // (61 skill rows + 1 header row) and that no pagination navigation is rendered.
    expect(screen.getByRole("treegrid")).toHaveAttribute("aria-rowcount", "62");
    expect(screen.queryByRole("navigation", { name: "Skill 목록 페이지" })).not.toBeInTheDocument();
  });

  it("shows duplicate installs by normalized name and opens their detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/skills/content")
        ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
        : jsonResponse({ error: "should use SSE" }),
    ));
    setupInventorySource(() => duplicateInventory());
    render(() => <SkillDashboard />);

    const tab = await screen.findByRole("button", { name: "중복 설치 1" });
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "필터에 없는 이름" } });
    expect(screen.getByText("조건에 맞는 skill이 없습니다.")).toBeInTheDocument();
    expect(tab).toHaveAccessibleName("중복 설치 1");
    fireEvent.click(tab);
    // Duplicate grid renders the group label on every install row (async).
    const alphaLabels = await screen.findAllByText("Alpha (2)");
    expect(alphaLabels.length).toBeGreaterThan(0);

    const trigger = await screen.findByRole("button", { name: /alpha.*상세 보기/ });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("alpha");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows an empty state when no skill name is installed twice", async () => {
    setupInventorySource(() => inventory());
    render(() => <SkillDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "중복 설치 0" }));
    expect(screen.getByText("중복 설치된 skill이 없습니다.")).toBeInTheDocument();
  });

  it("updates duplicate groups after a manual filesystem refresh", async () => {
    setupInventorySource((_url, idx) =>
      idx === 0 ? inventory() : duplicateInventory(),
    );
    render(() => <SkillDashboard />);

    expect(await screen.findByRole("button", { name: "중복 설치 0" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "파일시스템 재검색" }));
    expect(await screen.findByRole("button", { name: "중복 설치 1" })).toBeInTheDocument();
    // SSE-based refresh: duplicate count updated from 0 to 1
  });

  it("shows scan-error samples and link aggregates by configuration root", async () => {
    setupInventorySource(() => inventory());
    render(() => <SkillDashboard />);

    await screen.findByRole("button", { name: /alpha 상세 보기/ });
    fireEvent.click(screen.getByText("검색 경고 1개"));
    expect(screen.getByText("/Users/me/Library/Protected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /링크 상태/ }));
    expect(screen.getByText("/Users/me/.qwen", { selector: "code.root-path" })).toBeInTheDocument();
  });

  it("moves focus into the detail and restores it after Escape", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/skills/content")
        ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
        : jsonResponse({ error: "should use SSE" }),
    ));
    setupInventorySource(() => inventory());
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/skills/content")) {
        return jsonResponse({
          id: "skill-alpha",
          path: "/Users/me/.codex/skills/alpha/SKILL.md",
          markdown: "# Alpha",
          html: "<h1>Alpha content</h1>",
        });
      }
      return jsonResponse({ error: "should use SSE" });
    });
    vi.stubGlobal("fetch", fetchMock);
    setupInventorySource((_url, idx) =>
      idx === 0 ? inventory() : inventory("alpha-refreshed"),
    );
    render(() => <SkillDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /alpha 상세 보기/ }));
    expect(await screen.findByRole("heading", { name: "Alpha content" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "파일시스템 재검색" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /alpha-refreshed 상세 보기/ })).toBeInTheDocument();
    });
    // SSE-based refresh verified via UI state change above
    expect(screen.getByText("파일시스템 재검색이 완료되었습니다.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
