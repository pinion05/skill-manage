# Skill 디렉터리 단일 소유권 설계

## 목표

공식 문서가 같은 물리 디렉터리를 여러 에이전트의 호환 경로로 나열하더라도 Skill Atlas에서는 해당 디렉터리를 한 소유자에게만 귀속한다. `~/.agents/skills`와 프로젝트의 `.agents/skills`만 별도 `공유 디렉터리` 소유자로 표시한다. 공식 경로 검색 범위는 유지하면서 공식 소스 탭, Skill 상세, 통계에서 호환 소비자 반복을 제거한다.

## 사용자 결정

- 전역 경로와 프로젝트 경로에 같은 소유권 규칙을 적용한다.
- `~/.claude/skills`와 `**/.claude/skills`는 Claude Code만 소유한다.
- `~/.agents/skills`와 `**/.agents/skills`는 공유 디렉터리다.
- 호환 에이전트 정보는 기본 화면과 상세 응답에서 숨긴다.
- 전용 소유 경로가 없는 에이전트는 공식 소스 목록에서 제외한다.
- 호환 경로 자체는 검색에서 제거하지 않는다.

## 핵심 모델

현재 registry는 한 경로에 `agents[]`와 `kinds[]`를 붙여 “누가 이 경로를 읽는가”와 “누가 이 경로를 소유하는가”를 섞는다. 이를 다음 두 계층으로 분리한다.

1. **scan relation** — 공식 문서상 어떤 client가 어떤 경로를 읽는지 나타내는 내부 정보다. 경로 union을 생성하는 데만 사용한다.
2. **source ownership** — 화면·API·상세·집계에서 사용하는 단일 소유자다.

```ts
export interface OfficialSourceOwner {
  id: string;
  name: string;
  type: "agent" | "shared";
}

export interface SkillSourceSighting {
  rootPath: string;
  path: string;
  scope: OfficialSourceScope;
  owner: OfficialSourceOwner;
}

export interface OfficialSourceRoot {
  id: string;
  path: string;
  canonicalPath?: string;
  scope: OfficialSourceScope;
  owner: OfficialSourceOwner;
  exists: boolean;
  skillCount: number;
}

export interface OfficialSharedSource {
  id: "shared";
  name: "공유 디렉터리";
  globalPaths: string[];
  projectPaths: string[];
}

export interface OfficialSourceSummary {
  shared: OfficialSharedSource;
  agents: OfficialAgentSource[];
  roots: OfficialSourceRoot[];
}
```

공개 응답에서 `OfficialSourceKind`, `agents[]`, `kinds[]`는 제거한다. 호환 관계는 scan 후보를 만드는 registry 내부에만 남는다.

## 소유권 규칙

### 공유 소유권

다음 cross-agent namespace는 `공유 디렉터리`가 소유한다.

- `~/.agents/skills`
- `**/.agents/skills`
- `~/.config/agents/skills` 또는 `$XDG_CONFIG_HOME/agents/skills`
- `~/.config/agent/skills`

Roo 전용 mode 경로인 `.agents/skills-*`는 일반 공유 경로가 아니라 Roo Code 소유로 유지한다.

### 에이전트 소유권

vendor namespace는 scope와 호환 소비자 수와 관계없이 해당 vendor의 소유다.

- `.claude/skills` → Claude Code
- `.codex/skills`, `$CODEX_HOME/skills`, `/etc/codex/skills` → Codex CLI
- `.cursor/skills` → Cursor
- `.gemini/skills` → Gemini CLI
- `.gemini/antigravity/skills`, `.agent/skills` → Antigravity
- `.pi/skills`, `$PI_CODING_AGENT_DIR/skills` → Pi
- `.qwen/skills` → Qwen Code
- `.opencode/skills`, `.config/opencode/skills` → OpenCode
- `.roo/skills*`, `.agents/skills-*` → Roo Code
- `.kilo/skills` → Kilo Code
- `.kiro/skills` → Kiro
- `.cline/skills`, `.clinerules/skills` → Cline
- `.openclaw/skills`, 문서 표시용 `<workspace>/skills` → OpenClaw
- `.copilot/skills`, `.github/skills` → GitHub Copilot CLI
- `.config/amp/skills` → Amp
- `.factory/skills` → Factory Droid
- `.kimi-code/skills` → Kimi Code
- `.mux/skills` → Mux
- `.crush/skills`, XDG crush root → Crush
- `.goose/skills`, `.goose/config/skills` → Goose
- `.warp/skills` → Warp
- `.grok/skills` → Grok Build
- `.jcode/skills` → Jcode
- `.mimocode/skills`, `.mimocode/skill`, `.config/mimocode/skills` → MiMo Code
- `.zcode/skills` → ZCode
- `$HERMES_HOME/skills`, Hermes profile skills → Hermes Agent

경로가 여러 client의 scan relation에 등장해도 owner ID가 다르면 registry 구성 오류로 처리한다. 동일 lexical root에 두 소유자가 조용히 합쳐지는 동작은 허용하지 않는다.

## 에이전트 목록

`OfficialAgentSource.globalPaths`와 `projectPaths`에는 해당 에이전트가 **소유한 경로만** 들어간다. 호환 경로와 공유 경로는 에이전트 행에서 제외한다.

소유 경로가 하나도 없는 항목은 공식 소스 목록에서 제외한다.

- Zed: 확인된 자동 경로가 `.agents/skills`뿐이므로 공유 영역으로만 표현한다.
- Sakana Fugu: 별도 store 없이 Codex 경로를 사용하므로 Codex 소유 영역으로만 표현한다.

scan relation 정의는 유지하므로 두 client 때문에 발견되던 경로가 검색 범위에서 빠지지는 않는다.

## 화면

### 공식 소스 탭

1. 최상단에 `공유 디렉터리` audit row를 한 번 표시한다.
2. 그 아래에 소유 경로가 있는 에이전트만 표시한다.
3. 각 행의 전역·프로젝트 경로는 소유 경로만 나열한다.
4. root와 Skill 개수는 owner ID 기준으로 한 번만 집계한다.
5. `compatibility`, 호환 client 이름, 반복된 공유 root를 표시하지 않는다.

탭 badge는 에이전트 수에 공유 소유자 한 개를 더한 source owner group 수를 표시한다.

### Skill 상세

각 sighting은 다음 두 줄로 단순화한다.

```text
Claude Code · 사용자
/Users/pinion/.claude/skills/example/SKILL.md
```

공유 root는 다음처럼 표시한다.

```text
공유 디렉터리 · 사용자
/Users/pinion/.agents/skills/example/SKILL.md
```

## 데이터 흐름

1. registry가 모든 공식 scan relation의 path union을 만든다.
2. 각 root definition은 단일 `ownerId`를 함께 제공한다.
3. 같은 lexical root를 aggregate할 때 owner 일치를 검증한다.
4. discovery와 full annotation은 root match에서 단일 owner를 받는다.
5. physical file dedupe 후 모든 alias sighting에 해당 root owner를 복사한다.
6. API snapshot과 Solid UI는 호환 소비자 정보 없이 owner만 사용한다.

공식·전체 scan mode, mode별 cache, inode 기반 파일 dedupe, symlink 방어, 상세 allowlist는 변경하지 않는다.

## 오류 처리

- 동일 root에 서로 다른 owner가 선언되면 개발 시 즉시 실패해 잘못된 registry를 숨기지 않는다.
- owner가 없는 scan path는 공식 source로 직렬화하지 않는다.
- filesystem 접근 오류와 검색 한도는 기존 warning 흐름을 유지한다.
- 기존 snapshot과 새 snapshot을 섞지 않도록 응답 shape 변경은 모든 fixture와 UI를 한 번에 갱신한다.

## 검증

- `.claude/skills`의 owner는 scope와 관계없이 Claude Code 하나다.
- `.agents/skills`의 owner는 scope와 관계없이 공유 디렉터리 하나다.
- `.codex`, `.cursor`, `.factory`, `.github` 등 compatibility-only scope도 namespace owner에 귀속된다.
- Cursor 행에 Claude/Codex/shared 경로가 나타나지 않는다.
- Zed와 Fugu 행이 공식 소스 탭에서 제외된다.
- 기존 공식 scan의 물리 Skill ID 집합과 record 수가 소유권 변경 전후 동일하다.
- 하나의 root가 여러 에이전트 행에서 반복되지 않는다.
- 상세 alias 경로는 유지되며 owner 이름만 단일화된다.
- official/full mode, refresh, duplicate tab, link tab, Markdown detail이 회귀하지 않는다.
- 데스크톱과 390px viewport에서 공유·에이전트 경로가 잘리지 않는다.

## 비범위

- 호환 client 목록을 별도 화면에 다시 노출
- 실제 agent runtime precedence 계산
- Skill 설치·이동·삭제
- 검색 경로 축소
- 공식 문서 근거 목록 자체의 확장
