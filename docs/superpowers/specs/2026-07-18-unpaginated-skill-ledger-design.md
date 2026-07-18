# 페이지네이션 없는 Skill 원장 설계

## 목표

검색·필터·정렬 결과를 페이지로 나누지 않고 하나의 연속된 표에 모두 표시한다. 현재 약 2,253개 record도 가상 스크롤이나 무한 로딩 없이 즉시 DOM에 렌더링한다.

## 변경 범위

- `SkillDashboard`는 page 상태와 `paginate` 호출을 제거하고 필터링된 전체 배열을 `SkillTable`에 전달한다.
- `SkillTable`은 전체 배열을 순회하고 이전/다음 버튼과 `현재 / 전체 페이지` UI를 제거한다.
- 더 이상 사용하지 않는 pagination 타입·함수·CSS를 삭제한다.
- 검색, 필터, 정렬, 상세 dialog, 모바일 table semantics, API, scanner는 변경하지 않는다.

## 데이터 흐름

1. snapshot의 전체 skill record를 받는다.
2. `applySkillQuery`가 검색·필터·정렬된 immutable 배열을 만든다.
3. `SkillTable`이 그 배열의 모든 record를 한 표에 렌더링한다.
4. 조건이 바뀌면 전체 결과 배열이 바로 다시 렌더링된다.

## 접근성 및 반응형

기존 `<table>`, 실제 column header, 각 cell의 `headers` 연결을 유지한다. 모바일에서는 기존 label-value 배치를 유지하며 페이지 이동 navigation만 사라진다.

## 검증

- 50개를 초과하는 fixture를 로드해 첫 행과 마지막 행이 동시에 렌더링되는지 확인한다.
- `Skill 목록 페이지` navigation이 존재하지 않는지 확인한다.
- 기존 검색·필터·상세 dialog·모바일 header association 테스트를 유지한다.
- 전체 test, Astro check, production build를 실행한다.

## 명시적 비범위

- 가상 스크롤
- 무한 로딩
- 서버 측 pagination
- scanner/API 변경
