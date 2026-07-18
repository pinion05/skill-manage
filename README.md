# Skill Atlas

Astro SSR와 Solid.js로 만든 macOS 로컬 코딩 에이전트 skill 인벤토리입니다. 현재 파일시스템의 `SKILL.md`, `skills.md`, skill 심볼릭 링크를 읽어 검색·필터·상세 보기로 제공합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://127.0.0.1:4321>을 엽니다. 최초 검색은 파일 수에 따라 약 1분 걸릴 수 있으며, 이후 조회는 프로세스 메모리 캐시를 사용합니다.

production build:

```bash
npm run build
npm start
```

`dev`, `preview`, `start`는 localhost에만 바인딩됩니다.

## 제공 기능

- 현재 파일시스템을 직접 검색하며 `/tmp` 보고서에 의존하지 않음
- skill 이름·설명·에이전트·절대경로 검색
- 파일 유형·경로 성격·설정 루트 필터
- 이름·수정일·경로 정렬과 검색·필터 결과 전체 원장 표시
- 이름 기준 중복 설치 탭과 모든 설정 루트·경로 표시
- 안전하게 렌더링한 Markdown 상세 보기
- 정상·깨진 심볼릭 링크 구분
- 권한 오류 집계
- 버튼을 통한 수동 전체 재검색
- 데스크톱·모바일 반응형 화면

## 검색 범위

기본 검색 루트:

- `$HOME`
- `/Applications`
- `/Library`
- `/usr/local`
- `/opt/homebrew`

제외 경로:

- `.git`
- `Library/Caches`
- `.npm/_cacache`
- `.bun/install/cache`
- `.cache`
- `.Trash`

존재하지 않는 기본 루트는 자동으로 건너뜁니다. macOS 보호 영역의 권한 오류는 전체 검색을 중단하지 않고 화면에 개수만 표시합니다.

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
