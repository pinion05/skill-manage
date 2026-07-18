# 공식 Skill 소스 기본 검색 설계

## 목표

Skill Atlas의 기본 검색 범위를 전체 파일시스템이 아니라 각 코딩 에이전트의 **공식 문서 또는 공식 저장소에서 확인한 Skill 디렉터리**로 제한한다. 사용자는 필요할 때만 별도의 `전체 파일시스템` 모드로 전환한다. 사용자 전역 경로와 홈 디렉터리 아래 모든 프로젝트의 공식 경로를 함께 찾되, 세션·대화·캐시 경로를 Skill 경로로 추측하지 않는다.

## 결정 사항

- 기본 모드는 `official`이다.
- `full`은 사용자가 명시적으로 선택하는 별도 모드다.
- 두 모드의 snapshot과 진행 중 scan Promise는 서로 독립적이다.
- 공식 Skill 경로가 확인된 에이전트만 공식 소스 화면에 표시한다.
- 같은 물리 파일이 여러 공식 alias나 symlink를 통해 보이면 Skill record는 한 번만 표시하고 모든 sighting을 보존한다.
- 같은 이름이지만 물리 파일이 다르면 기존 중복 설치 기능에서 서로 다른 설치로 유지한다.
- 한 가지 공통 경로 우선순위를 런타임 의미로 적용하지 않는다. 에이전트별 precedence가 서로 다르기 때문이다.

## 공식성 기준

공식 제품 문서 또는 제품 소유 조직의 공식 저장소가 `SKILL.md`와 정확한 사용자·프로젝트 경로를 함께 명시해야 registry에 포함한다. Agent Skills 명세는 패키지 형식만 정의하며 설치 경로를 의무화하지 않으므로 `.agents/skills`를 모든 에이전트의 보편적 경로로 추정하지 않는다.

다음은 registry에 포함할 확인된 제품군이다.

| 제품 | 사용자·전역 경로 요약 | 프로젝트·workspace 경로 요약 | 근거 |
|---|---|---|---|
| OpenCode | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | `.opencode/skills`, `.claude/skills`, `.agents/skills` | https://opencode.ai/docs/skills/ |
| Claude Code | `$CLAUDE_CONFIG_DIR/skills`, 기본 `~/.claude/skills` | `.claude/skills` | https://code.claude.com/docs/en/skills |
| Codex CLI | `~/.agents/skills`, `$CODEX_HOME/skills`, `/etc/codex/skills` | `.agents/skills` | https://developers.openai.com/codex/skills |
| Sakana Fugu | Codex 경로를 상속하며 별도 Fugu Skill store 없음 | Codex `.agents/skills` | https://github.com/SakanaAI/fugu/blob/main/docs/commands_details.md |
| Hermes Agent | `$HERMES_HOME/skills`, 기본 `~/.hermes/skills`, `~/.hermes/profiles/*/skills` | 자동 프로젝트 경로 없음 | https://hermes-agent.nousresearch.com/docs/user-guide/features/skills |
| Gemini CLI | `~/.gemini/skills`, `~/.agents/skills` | `.gemini/skills`, `.agents/skills` | https://geminicli.com/docs/cli/skills/ |
| Antigravity | `~/.gemini/antigravity/skills` | `.agent/skills` | https://antigravity.google/docs/skills |
| Pi | `$PI_CODING_AGENT_DIR/skills`, 기본 `~/.pi/agent/skills`, `~/.agents/skills` | `.pi/skills`, `.agents/skills` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md |
| Qwen Code | `~/.qwen/skills` | `.qwen/skills` | https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/ |
| Cursor | `~/.cursor/skills`, `~/.agents/skills`, Claude/Codex compatibility roots | `.cursor/skills`, `.agents/skills`, Claude/Codex compatibility roots | https://cursor.com/docs/skills |
| Roo Code | `~/.roo/skills*`, `~/.agents/skills*` | `.roo/skills*`, `.agents/skills*` | https://docs.roocode.com/features/skills |
| Kilo Code | `~/.kilo/skills` | `.kilo/skills`, `.agents/skills`, 조건부 `.claude/skills` | https://kilo.ai/docs/customize/skills |
| Zed | `~/.agents/skills` | `.agents/skills` | https://zed.dev/docs/ai/skills |
| Kiro | `~/.kiro/skills` | `.kiro/skills` | https://kiro.dev/docs/skills/ |
| Cline | `~/.cline/skills` | `.cline/skills`, `.clinerules/skills`, `.claude/skills` | https://docs.cline.bot/customization/skills |
| OpenClaw | `~/.agents/skills`, `~/.openclaw/skills` | `<workspace>/skills`, `<workspace>/.agents/skills` | https://docs.openclaw.ai/tools/skills |
| GitHub Copilot CLI | `~/.copilot/skills`, `~/.agents/skills` | `.github/skills`, `.claude/skills`, `.agents/skills` | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills |
| Amp | `~/.config/agents/skills`, `~/.agents/skills`, `~/.config/amp/skills`, `~/.claude/skills` | `.agents/skills`, `.claude/skills` | https://ampcode.com/manual/agent-skills.md |
| Factory Droid | `~/.factory/skills` | `.factory/skills`, `.agent/skills` | https://docs.factory.ai/cli/configuration/skills |
| Kimi Code | `$KIMI_CODE_HOME/skills`, 기본 `~/.kimi-code/skills`, `~/.agents/skills` | `.kimi-code/skills`, `.agents/skills` | https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html |
| Mux | `~/.mux/skills`, `~/.agents/skills`, 조건부 `~/.claude/skills` | `.mux/skills`, `.agents/skills`, 조건부 `.claude/skills` | https://mux.coder.com/agents/agent-skills |
| Crush | `$CRUSH_SKILLS_DIR`, XDG agents/crush roots | `.agents/skills`, `.crush/skills`, `.claude/skills`, `.cursor/skills` | https://github.com/charmbracelet/crush/commit/0e3d47273fe9a8bc749a6e928b8e7d9f102c1956 |
| Goose | `~/.config/agent/skills`, `~/.goose/config/skills` | `.agents/skills`, `.claude/skills`, `.goose/skills` | https://github.com/block/goose/pull/6139 |
| Warp | `~/.warp/skills`와 문서화된 호환 roots | `.warp/skills`와 문서화된 호환 roots | https://docs.warp.dev/agent-platform/capabilities/skills/ |
| Grok Build | `~/.grok/skills`, `~/.agents/skills` | `.grok/skills` | https://docs.x.ai/build/features/skills-plugins-marketplaces |
| Jcode | `~/.jcode/skills`, `~/.claude/skills`, `~/.agents/skills` | `.jcode/skills`, `.claude/skills`, `.agents/skills` | https://github.com/1jehuang/jcode/commit/5d482cac1256673e257baf7b154b6d1d2e3ee43e |
| MiMo Code | `~/.config/mimocode/skills`와 문서화된 호환 roots | `.mimocode/skills`, `.mimocode/skill`과 문서화된 호환 roots | https://mimo.xiaomi.com/mimocode/skills |
| ZCode | `~/.zcode/skills` | 정확한 프로젝트 경로는 미확인되어 등록하지 않음 | https://zcode.z.ai/en/docs/skill |

CodeBuddy, WorkBuddy, Devin Desktop, Junie, TRAE의 안정적 디스크 경로, Codebuff, Command Code, GJC runtime, OpenCodeReview standalone, Synthetic/Octofriend, ZCode 프로젝트 경로처럼 정확한 공식 root가 확인되지 않은 항목은 추측해서 등록하지 않는다.

## 데이터 모델

```ts
export type ScanMode = "official" | "full";
export type OfficialSourceScope = "user" | "project" | "admin";
export type OfficialSourceKind = "native" | "shared" | "compatibility";

export interface SkillSourceSighting {
  rootPath: string;
  path: string;
  scope: OfficialSourceScope;
  kinds: OfficialSourceKind[];
  agents: string[];
}

export interface OfficialAgentSource {
  id: string;
  name: string;
  documentationUrl: string;
  globalPaths: string[];
  projectPaths: string[];
}

export interface OfficialSourceRoot {
  id: string;
  path: string;
  canonicalPath?: string;
  scope: OfficialSourceScope;
  kinds: OfficialSourceKind[];
  agents: string[];
  exists: boolean;
  skillCount: number;
}

export interface OfficialSourceSummary {
  agents: OfficialAgentSource[];
  roots: OfficialSourceRoot[];
}
```

`InventorySnapshot`은 `scanMode`와 `officialSources`를 갖는다. `SkillRecord`은 `sourceSightings`를 갖는다. `full` record도 경로가 registry와 일치하면 공식 sighting을 가질 수 있다.

## 공식 root 발견

### 사용자·전역 경로

registry의 고정 경로를 `$HOME` 및 환경변수로 확장한다. 환경변수는 `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HERMES_HOME`, `PI_CODING_AGENT_DIR`, `KIMI_CODE_HOME`, `CRUSH_SKILLS_DIR`, `XDG_CONFIG_HOME`을 반영한다. `/etc/codex/skills`는 `admin` scope로 유지한다.

Hermes profile과 Roo mode처럼 이름이 동적인 공식 경로는 제한된 glob 패턴으로 홈 traversal 중 발견한다. 임의 glob이나 사용자 입력 glob은 실행하지 않는다.

### 프로젝트 경로

홈 디렉터리를 한 번 순회하며 registry에 등록된 고유 suffix만 찾는다. 예를 들어 `.claude/skills`, `.agents/skills`, `.factory/skills`는 어느 깊이에 있어도 프로젝트 root로 수집한다. OpenClaw의 일반 `<workspace>/skills`처럼 lexical path만으로 어느 제품 workspace인지 판별할 수 없는 패턴은 공식 소스 원장에 문서 경로로 표시하되 자동 수집하지 않는다. 임의 Git 저장소를 OpenClaw workspace라고 추측하지 않으며, 해당 workspace의 `.agents/skills`는 고유 suffix로 계속 발견한다.

다음은 traversal에서 제외한다.

- `.git`, `node_modules`, `.venv`, `venv`, `vendor`, `dist`, `build`, `target`, `.next`, `.astro`, `.cache`, `.Trash`
- `Library/Caches`, `Library/Application Support`, npm/bun cache
- `.codex/.tmp`, `.codex/vendor_imports`, `.omx/backups`, ZCode plugin cache/marketplace, VS Code extension cache
- Claude `projects`, Codex/Pi `sessions`, Hermes session/state 영역, Qwen `tmp`, OpenCode application data

순회에는 제한된 동시성, 최대 directory budget, symlink 비추적, 접근 오류 샘플 상한을 둔다. 공식 root 자체가 symlink이면 root 해석 단계에서만 target을 검증한다.

## 물리 identity와 alias

1. registry 순서대로 lexical root sighting을 만든다.
2. 존재하는 root는 `realpath`, `stat`으로 실제 디렉터리 identity를 확인한다.
3. 동일한 `(st_dev, st_ino)` root는 한 번만 scan한다.
4. Skill 파일은 열린 handle의 `(st_dev, st_ino)`를 물리 identity로 사용한다.
5. 같은 identity의 record를 하나로 합치고 모든 lexical root·파일 sighting을 `sourceSightings`에 보존한다.
6. 같은 이름이더라도 identity가 다르면 합치지 않는다.
7. 동일 내용 hash는 복사본일 수 있으므로 merge 기준으로 사용하지 않는다.
8. 깨진 symlink는 Skill이 아니라 link diagnostic으로 유지한다.

canonical display path는 registry 열거 순서의 첫 sighting을 기준으로 안정적으로 선택한다. 이 순서는 인벤토리 표시 순서일 뿐 Claude, Gemini, Roo, Codex 등의 런타임 precedence를 뜻하지 않는다.

## API와 cache

- `GET /api/inventory?mode=official|full`
- `POST /api/inventory/refresh?mode=official|full`
- `GET /api/skills/content?id=...&mode=official|full`

`mode` 생략 시 `official`이다. 다른 값은 filesystem scan 전에 `400`으로 거부한다. store는 mode별 `snapshot`과 `inFlight`를 별도 Map으로 관리한다. 상세 본문은 요청한 mode의 현재 snapshot ID allowlist에서만 읽는다.

## 화면

### 시각 방향

- **Visual thesis:** 기존 청사진·감사 원장 분위기를 유지하고 공식 출처를 별도 카드가 아닌 규칙선 기반 provenance ledger로 표현한다.
- **Content plan:** 상단 검색 범위 → 통계 → Skill/중복/링크/공식 소스 보기 → 상세 provenance.
- **Interaction thesis:** mode 전환 시 상단 scan rail, tab underline, 상세 panel focus transition만 사용한다. 장식성 모션은 추가하지 않는다.

상단 재검색 control에 `공식 디렉터리`와 `전체 파일시스템` 범위 버튼을 둔다. 현재 mode의 snapshot만 화면에 표시하고 재검색도 현재 mode에만 적용한다. `공식 소스` 탭은 공식 agent 이름, 문서 링크, 등록 경로 패턴, 발견 root, native/shared/compatibility, Skill 수를 연속된 audit row로 표시한다.

Skill 상세에는 `공식 소스 경로` 영역을 추가하여 canonical path 외의 alias, scope, 경로 성격, 연결된 에이전트를 표시한다. 상세 focus trap, Escape 닫기, trigger focus 복원은 유지한다.

## 오류 처리와 보안

- 기존 `O_NOFOLLOW`, `O_NONBLOCK`, regular-file, device/inode, bounded read 방어를 유지한다.
- 공식 root 하나의 권한·race 오류가 전체 scan을 중단하지 않는다.
- raw OS 오류 문자열은 API에 노출하지 않는다.
- symlink cycle은 directory identity 방문 집합으로 차단한다.
- full mode의 기존 검색 범위와 링크 진단은 유지한다.
- 애플리케이션은 계속 loopback Host와 same-origin POST만 허용하며 쓰기 작업을 하지 않는다.

## 검증

- registry가 확인된 agent와 공식 경로·환경변수만 확장한다.
- 미확인 agent/path가 registry에 없다.
- 홈 아래 여러 프로젝트의 공식 suffix를 발견한다.
- dependency, cache, session/state 경로는 발견하지 않는다.
- root 및 Skill symlink alias를 물리 identity로 한 번만 표시하고 sighting을 보존한다.
- mode별 cache와 in-flight Promise가 분리된다.
- 잘못된 API mode는 `400`이다.
- 기본 UI 요청은 `official`, mode 전환 요청은 `full`이다.
- 공식 소스 탭과 상세 alias가 keyboard·mobile에서 모두 읽힌다.
- 기존 Skill 필터, 중복 설치, 링크 상태, Markdown 보안 테스트가 회귀하지 않는다.
- 전체 Vitest, Astro check, production build, 실제 브라우저 smoke를 통과한다.

## 비범위

- Agent별 실제 winner를 계산하는 precedence simulator
- Skill 설치·이동·삭제·symlink 수정
- Hermes/OpenClaw/Pi 등의 임의 사용자 설정 파일에 선언된 추가 directory 파싱
- plugin/extension cache의 버전별 내부 경로 추측
- 공식 경로가 확인되지 않은 제품의 후보 경로 표시
