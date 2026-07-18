# 중복 설치 Skill 탭 설계

## 목표

전체 로컬 인벤토리에서 같은 이름으로 여러 위치에 설치된 `SKILL.md`를 찾아, 별도 탭에서 이름별 그룹으로 탐색할 수 있게 한다.

## 중복 판단

- `recordType === "skill"`인 `SKILL.md` 정의만 집계한다.
- `skills.md` 문서는 제외한다.
- 이름은 Unicode NFKC 정규화, 앞뒤 공백 제거, locale 소문자 변환 후 비교한다.
- 정규화한 이름이 같고 서로 다른 record가 2개 이상이면 중복 그룹이다.
- 기존 Skill 탭의 검색·필터 상태와 무관하게 현재 전체 snapshot을 기준으로 계산한다.

## 화면 구조

기존 `Skill 파일`, `링크 상태` 보기 메뉴에 `중복 설치` 버튼을 추가한다. 기존과 같은 일반 `aria-pressed` 버튼이며, badge에는 중복 이름 그룹 수를 표시한다.

중복 탭은 이름별 그룹 목록을 렌더링한다. 각 그룹은 다음 정보를 포함한다.

- 대표 skill 이름
- 설치 개수
- 각 설치의 에이전트
- 각 설치의 성격
- 설정 루트 절대경로
- `SKILL.md` 절대경로

그룹은 대표 이름 오름차순, 그룹 내부 설치는 절대경로 오름차순으로 정렬한다. 설치 항목은 실제 `<button>`으로 제공하며 선택하면 기존 읽기 전용 `SkillDetail` dialog를 연다.

중복 그룹이 하나도 없으면 `중복 설치된 skill이 없습니다.`라는 전용 빈 상태를 표시한다. pagination, 가상 스크롤, 무한 로딩은 추가하지 않는다.

## 컴포넌트와 데이터 흐름

### `duplicate-skills.ts`

순수 함수 `groupDuplicateSkills(records)`를 제공한다. 입력 배열을 변경하지 않고 `DuplicateSkillGroup[]`을 반환한다.

```ts
interface DuplicateSkillGroup {
  key: string;
  name: string;
  installs: SkillRecord[];
}
```

### `DuplicateSkillsPanel.tsx`

그룹 배열을 받아 이름별 설치 정보를 표시한다. 설치 선택 시 `(skill, trigger)`를 부모에 전달해 기존 상세 패널과 focus 복원 흐름을 재사용한다.

### `SkillDashboard.tsx`

보기 상태를 `"skills" | "duplicates" | "links"`로 확장한다. snapshot이 바뀔 때마다 전체 `current.skills`에서 중복 그룹을 O(n)으로 계산한다. API와 scanner는 변경하지 않는다.

## 접근성 및 반응형

- 보기 버튼은 기존 방식대로 `aria-pressed` 상태를 제공한다.
- 중복 그룹에는 실제 heading과 설치 개수 문구를 둔다.
- 각 설치는 전체 이름을 가진 button으로 상세 dialog를 연다.
- 설정 루트와 파일 경로는 CSS 줄바꿈으로 모바일에서도 생략하지 않는다.
- 상세 dialog의 초기 focus, focus trap, Escape 닫기, trigger focus 복원을 그대로 유지한다.

## 오류와 빈 상태

중복 계산은 메모리의 snapshot만 사용하므로 별도 네트워크 오류가 없다. 인벤토리 재검색이 실패하면 기존 snapshot과 그 중복 그룹을 유지한다. 중복이 없을 때만 전용 빈 상태를 표시한다.

## 검증

- 이름의 대소문자·Unicode 정규화가 같은 record를 한 그룹으로 묶는다.
- `skills.md` 문서와 단일 설치는 제외한다.
- 그룹 이름과 내부 경로가 안정적으로 정렬된다.
- 입력 배열과 record를 변경하지 않는다.
- 탭 badge에 그룹 수가 표시된다.
- 탭 전환 시 모든 경로와 설정 루트가 표시된다.
- 설치 버튼으로 상세 dialog가 열리고 닫힌 뒤 trigger focus가 복원된다.
- 중복이 없을 때 빈 상태가 표시된다.
- 전체 Vitest, Astro check, production build, 실제 브라우저 smoke를 통과한다.

## 비범위

- 중복 파일 삭제·이동
- symlink 수정
- 파일 내용 hash 기반 중복 판정
- 기존 Skill 탭 검색·필터와 중복 집계 연동
- API 또는 scanner 응답 구조 변경
