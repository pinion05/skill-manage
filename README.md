# Skill Atlas

Astro SSR와 Solid.js로 만든 macOS 로컬 코딩 에이전트 skill 인벤토리입니다. 공식 문서로 확인한 Skill 디렉터리를 기본 범위로 사용해 `SKILL.md`, `skills.md`, skill 심볼릭 링크를 읽고 검색·필터·상세 보기로 제공합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://127.0.0.1:4321>을 엽니다. 기본 공식 경로 검색은 홈 아래 프로젝트를 한 번 조사하며, 명시적으로 선택하는 전체 파일시스템 검색은 파일 수에 따라 약 1분 이상 걸릴 수 있습니다. 이후 조회는 검색 mode별 프로세스 메모리 cache를 사용합니다.

production build:

```bash
npm run build
npm start
```

`dev`, `preview`, `start`는 localhost에만 바인딩됩니다.

## 제공 기능

- 공식 문서·공식 저장소에서 확인된 사용자·프로젝트 Skill 디렉터리를 기본 검색
- 필요할 때만 별도로 실행하는 전체 파일시스템 검색 mode
- 현재 파일시스템을 직접 검색하며 `/tmp` 보고서에 의존하지 않음
- skill 이름·설명·에이전트·절대경로 검색
- 파일 유형·경로 성격·설정 루트 필터
- 이름·수정일·경로 정렬과 검색·필터 결과 전체 원장 표시
- 이름 기준 중복 설치 탭과 모든 설정 루트·경로 표시
- 안전하게 렌더링한 Markdown 상세 보기
- `.agents/skills`는 공유로, vendor 경로는 해당 agent 하나에만 귀속하는 공식 소스 원장
- 같은 물리 파일의 공식 alias는 한 번만 표시하고 모든 source sighting 보존
- 프로젝트 경로와 `skills.md` 문서를 제외해 공유·에이전트별 `SKILL.md`만 보여주는 에이전트 탭
- project dir별로 물리 Skill을 한 번만 표시하고 연결 에이전트·alias를 합치는 프로젝트 탭
- 정상·깨진 심볼릭 링크 구분
- 권한 오류 집계
- 현재 선택한 검색 mode만 갱신하는 수동 재검색
- 데스크톱·모바일 반응형 화면

에이전트 탭은 project sighting을 집계에서 제외하되 같은 파일의 전역·관리자 sighting은 유지합니다. 프로젝트 탭은 agent namespace 앞의 project dir로 대분류하고 같은 물리 Skill의 여러 agent alias를 한 entry에 표시합니다. 두 탭의 Agent owner 그룹과 Project dir 그룹은 처음에는 접혀 있으며 각 그룹을 독립적으로 펼치거나 접을 수 있습니다. 전체 파일시스템 mode에서 공식 sighting이 없는 항목만 기존 `project/source-local` 분류와 경로 규칙으로 보완합니다.

## 검색 범위

### 공식 디렉터리 — 기본값

공식 제품 문서 또는 제품 소유 조직의 저장소에서 정확한 `SKILL.md` root가 확인된 에이전트만 registry에 포함합니다. 사용자 전역 root와 `$HOME` 아래 모든 프로젝트에서 `.agents/skills`, `.claude/skills`, `.pi/skills`, `.factory/skills` 등 각 제품이 실제로 문서화한 suffix를 찾습니다. Agent Skills 명세가 경로를 강제한다고 가정하거나, 세션 저장 위치에서 Skill 경로를 추측하지 않습니다.

다음 환경변수 기반 공식 root도 반영합니다.

- `CLAUDE_CONFIG_DIR`
- `CODEX_HOME`
- `HERMES_HOME`
- `PI_CODING_AGENT_DIR`
- `KIMI_CODE_HOME`
- `CRUSH_SKILLS_DIR`
- `XDG_CONFIG_HOME`

`공식 소스` 탭에서 포함된 에이전트, first-party 문서 링크, 전역·프로젝트 경로 패턴, 현재 머신의 발견 상태를 확인할 수 있습니다. 정확한 경로가 확인되지 않은 제품은 후보 경로를 만들어 표시하지 않습니다. OpenClaw `<workspace>/skills`처럼 경로만으로 어느 제품 workspace인지 구분할 수 없는 일반 패턴은 문서에는 표시하지만 임의 Git 저장소를 추측해 자동 수집하지 않습니다.

검색 호환성과 디렉터리 소유권은 분리합니다. `~/.agents/skills`와 프로젝트 `.agents/skills`는 한 번만 `공유 디렉터리`로 표시하고, `.claude/skills`, `.codex/skills`, `.cursor/skills` 같은 vendor namespace는 호환 client 수와 관계없이 각각 Claude Code, Codex CLI, Cursor 하나에만 표시합니다. 호환 client 관계는 검색 path union을 유지하는 내부 정보이며 화면·상세·집계에는 노출하지 않습니다. 전용 소유 경로가 없는 Zed와 Sakana Fugu는 공식 소스 agent 행에서 제외되지만 이들이 사용하는 공유·Codex 경로 검색은 유지됩니다.

프로젝트 discovery는 `.git`, `node_modules`, 가상환경, build 산출물, cache와 Claude/Codex/Pi/Qwen/OpenCode의 세션·대화·상태 영역을 제외합니다. 공식 root가 symlink이면 target identity를 검증하고, 같은 실제 root나 파일을 가리키는 여러 alias는 한 번만 읽습니다.

### 전체 파일시스템 — 명시적 선택

기존 broad scan을 별도 mode로 유지합니다. 검색 루트는 다음과 같습니다.

- `$HOME`
- `/Applications`
- `/Library`
- `/usr/local`
- `/opt/homebrew`

`.git`, `Library/Caches`, `.npm/_cacache`, `.bun/install/cache`, `.cache`, `.Trash`는 제외합니다. 존재하지 않는 root는 건너뛰고 macOS 보호 영역의 권한 오류는 전체 검색을 중단하지 않고 집계합니다. 공식 mode와 전체 mode의 snapshot·재검색 cache는 서로 섞이지 않습니다.

## 읽기 전용 경계

이 PoC는 파일이나 링크를 생성·수정·삭제하지 않습니다. 모든 요청의 `Host`를 loopback 주소로 제한하고 POST는 동일 Origin만 허용합니다. 상세 API는 현재 인벤토리에서 발견한 ID만 허용하며, 심볼릭 링크를 따르지 않는 non-blocking 단일 파일 핸들로 상한 읽기하며 스캔 시점 device/inode identity도 검증합니다. 1MiB를 넘는 파일과 `SKILL.md`/`skills.md` 이외의 파일을 거부합니다. Markdown의 원시 HTML은 텍스트로, 이미지는 네트워크 요청 없는 대체 문구로 표시한 뒤 서버에서 정화합니다.

## 검증

```bash
npm run test
npm run check
npm run build
# 또는 모두 실행
npm run verify
```

- Vitest: 분류, 파일 검색, 링크 상태, 캐시, Markdown 보안, 필터, Solid UI
- Astro check: TypeScript·Astro 진단
- Astro build: Node standalone production build
