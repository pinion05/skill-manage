# Agent and Project Skill Views Design

## 목표

기존 원장·중복·링크·공식 소스 보기를 유지하면서 Skill을 설치 맥락별로 읽는 두 개의 보기를 추가한다.

- **에이전트 탭:** 모든 프로젝트 경로를 제외한 `SKILL.md`만 공유 소유자와 에이전트 소유자별로 집계한다.
- **프로젝트 탭:** 프로젝트 디렉터리를 대분류로 삼고, 각 프로젝트에서 물리적으로 같은 Skill을 한 번만 표시하면서 연결된 에이전트와 alias 경로를 함께 보여준다.

`skills.md` 문서는 두 새 탭의 집계에서 제외한다. 기존 `Skill 파일` 원장에는 계속 남는다.

## 선택한 접근

기존 `InventorySnapshot`에서 순수 projection 함수를 사용해 두 보기를 만든다. 서버가 별도 집계 payload를 만들거나 탭마다 재검색하지 않는다.

이 방식을 선택한 이유:

- 현재 snapshot의 device/inode dedupe와 `sourceSightings`를 그대로 신뢰할 수 있다.
- official/full mode cache, content allowlist, scanner 보안 경계를 변경하지 않는다.
- 집계 규칙을 작은 순수 함수로 분리해 fixture만으로 정확히 검증할 수 있다.
- UI 전용 정렬·표현 정보 때문에 API schema가 불필요하게 커지지 않는다.

검토했지만 선택하지 않은 방식:

1. 서버에서 집계 결과까지 직렬화: payload와 API 결합도가 증가한다.
2. 탭별 별도 scan: 느리고 동일 파일에 대한 snapshot 일관성을 깨뜨린다.

## 데이터 규칙

### 에이전트 집계

대상은 `recordType === "skill"`인 record뿐이다.

1. `sourceSightings`가 있으면 `scope !== "project"`인 sighting만 사용한다.
2. 같은 record에 프로젝트 sighting과 전역/admin sighting이 함께 있으면 프로젝트 sighting만 무시하고 전역 설치로 집계한다.
3. 전역/admin sighting이 하나도 없으면 에이전트 탭에서 제외한다.
4. 같은 물리 record가 한 소유자의 여러 전역 alias에 있으면 해당 소유자 그룹에서 한 번만 표시하고 alias 경로를 합친다.
5. 같은 물리 record가 서로 다른 전역 소유자 namespace에 있으면 각 소유자 그룹에 한 번씩 표시한다. 이는 각 namespace에 실제 설치되어 있다는 의미다.
6. `공유 디렉터리` 그룹을 첫 번째로 두고 나머지 에이전트 그룹을 이름순으로 정렬한다.

full mode에서 공식 sighting이 없는 record는 `kind !== "project/source-local"`일 때만 포함하고 기존 `record.agent`를 fallback 소유자 label로 사용한다. 따라서 프로젝트 Skill은 fallback으로 전역 집계에 섞이지 않는다.

에이전트 탭 badge는 소유자 그룹별 중복이 아니라, 전역/admin membership이 있는 물리 Skill record 수를 센다.

### 프로젝트 집계

대상은 `recordType === "skill"`인 record뿐이다.

1. `scope === "project"`인 sighting을 프로젝트 membership으로 사용한다.
2. project dir은 source root에서 agent namespace suffix를 제거해 구한다.
   - `/Users/me/dev/app/.claude/skills` → `/Users/me/dev/app`
   - `/Users/me/dev/app/.agents/skills` → `/Users/me/dev/app`
   - `/Users/me/dev/app/.roo/skills-debug` → `/Users/me/dev/app`
   - `/Users/me/workspace/skills` → `/Users/me/workspace`
3. 같은 물리 Skill이 같은 프로젝트의 여러 에이전트 경로에 있으면 Skill을 한 번만 표시한다. entry 안에서 owner badge와 alias 경로를 각각 합친다.
4. 같은 물리 Skill이 서로 다른 프로젝트에 연결되면 각 프로젝트에 한 번씩 표시한다.
5. 프로젝트는 절대경로 이름순, 내부 Skill은 정규화된 이름과 path 순으로 정렬한다.

full mode에서 공식 sighting이 없는 `project/source-local` record는 `skillsRoot`/`configRoot`의 agent marker를 제거해 project dir을 추론하고 `record.agent`를 fallback owner로 표시한다.

프로젝트 탭 badge는 `(project dir, physical Skill)` membership 수를 센다. 각 프로젝트 heading에는 고유 Skill 수와 연결 에이전트 수를 함께 표시한다.

## 프로젝트 root 추론 경계

projection은 macOS absolute path를 `/` 기준으로 정규화한다. 마지막 agent marker segment(`.claude`, `.agents`, `.cursor`, `.codex`, `.pi`, `.github`, `.agent` 등) 앞까지를 project dir로 사용한다. marker가 없는 공식 workspace `skills` root는 `skills`의 부모를 사용한다.

fallback record에서도 marker를 찾지 못하면 `configRoot`의 부모를 사용한다. 빈 문자열이나 filesystem root가 나오면 project dir을 만들지 않고 해당 fallback entry를 제외한다. 이는 임의의 홈 전체를 한 프로젝트로 오분류하는 것을 방지한다.

## UI 구조

탭 순서:

1. Skill 파일
2. 에이전트
3. 프로젝트
4. 중복 설치
5. 링크 상태
6. 공식 소스

기본 탭은 기존과 동일하게 `Skill 파일`이다.

### 에이전트 패널

- 공유 그룹을 강조해 첫 번째로 표시한다.
- 각 소유자 그룹은 native `<details>`이며 기본은 접힌 상태다.
- `<summary>`에 소유자 이름, Skill 수, 펼침 상태 표식을 표시한다.
- 펼치면 Skill 이름, 설명, alias 수·경로가 나타나며 기존 상세 dialog를 연다.
- 그룹 안의 Skill은 한 번만 렌더링한다.

### 프로젝트 패널

- 각 project dir은 독립적인 native `<details>`이며 기본은 접힌 상태다.
- `<summary>`에 dir heading, `<code>` absolute path, Skill·agent 수, 펼침 상태 표식을 표시한다.
- 펼치면 Skill 이름과 설명을 한 번만 표시하고 연결 owner badge와 owner별 alias 경로를 함께 보여준다.
- Skill 선택은 기존 상세 dialog와 focus restoration 흐름을 재사용한다.

native `<summary>`를 toggle control로 사용해 Enter/Space와 접근성 tree를 브라우저 기본 동작에 맡긴다. 그룹별 open 상태는 서로 독립적이며 탭 전환이나 snapshot 교체 뒤에는 다시 기본 접힘 상태로 시작한다. 별도의 전체 펼치기/접기 control과 open-state persistence는 추가하지 않는다.

두 패널 모두 빈 상태 문구를 제공하고, 긴 절대경로를 wrap하며, 390px viewport에서 수평 overflow가 없어야 한다. 별도 pagination이나 편집 기능은 추가하지 않는다.

## 구성 요소 경계

- `src/lib/dashboard/skill-views.ts`
  - snapshot record를 agent/project group으로 바꾸는 순수 함수
  - project dir 추론, identity dedupe, deterministic sort 담당
- `src/components/dashboard/AgentSkillsPanel.tsx`
  - agent group 표현만 담당
- `src/components/dashboard/ProjectSkillsPanel.tsx`
  - project group과 연결 owner/alias 표현만 담당
- `src/components/dashboard/SkillDashboard.tsx`
  - memo, tab badge, panel 선택, 기존 detail callback 연결만 담당

패널은 scan 또는 분류 규칙을 직접 구현하지 않는다.

## 오류와 경계 조건

- malformed/상대 path는 projection에서 안전하게 제외하거나 fallback group으로만 처리한다.
- owner/path 중복은 Set 기반 key로 제거한다.
- 설명이 없으면 기존 원장과 동일하게 빈 설명을 허용한다.
- snapshot refresh 또는 mode 전환 시 projection은 새 snapshot에서 자동 재계산된다.
- mode 전환 시 기존 query와 detail 선택 초기화 동작은 유지한다.

## 테스트와 완료 조건

### 순수 집계 테스트

- project-only record가 에이전트 집계에 포함되지 않는다.
- global+project record는 에이전트 집계에 한 번 포함된다.
- 공유 소유자가 첫 그룹이다.
- `skills.md` record가 두 집계에서 제외된다.
- 같은 프로젝트의 여러 owner alias가 한 Skill entry와 여러 owner badge로 합쳐진다.
- 서로 다른 프로젝트 membership은 각각 남는다.
- full-mode fallback이 project/global을 섞지 않는다.
- project dir 추론이 `.claude`, `.agents`, wildcard-style root, plain workspace `skills`에서 정확하다.

### UI 테스트

- 새 탭 badge와 접근 가능한 pressed state가 정확하다.
- Agent 패널에 project-only Skill이 없다.
- Agent owner와 Project dir group은 기본으로 접혀 있고 summary toggle로 독립적으로 펼치고 다시 접을 수 있다.
- Project 패널이 펼친 dir 아래 Skill 한 건과 여러 연결 agent를 표시한다.
- Skill row에서 기존 detail dialog가 열리고 Escape 후 trigger focus가 복원된다.
- 빈 상태를 표시한다.

### 통합 검증

- 전체 Vitest suite, Astro check, production build가 통과한다.
- 실제 official/full snapshot에서 에이전트 집계에 project-only record가 없다.
- project membership에서 동일 `(project dir, device, inode)`가 중복되지 않는다.
- desktop과 390px browser QA에서 수평 overflow가 없다.
