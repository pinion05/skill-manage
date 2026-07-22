# agents.md

AI 에이전트(및 사람)가 이 저장소에서 작업할 때 알아둘 운영 지식. 코드 구조보다는 **배포·CI·토큰**처럼 비자명(non-obvious)인 부분을 중심으로 정리한다.

## 프로젝트 한 줄

`skill-manage`(= Skill Atlas) — Astro SSR + Solid.js로 만든 **로컬 코딩 에이전트 스킬 인벤토리 웹앱**. `npx skill-manage`로 실행하면 localhost에서 스킬(`SKILL.md`/`skills.md`/심볼릭링크)을 스캔·검색·분류한다. **읽기 전용** 설계(파일 생성·수정·삭제 안 함).

## 개발

```bash
npm install
npm run dev        # http://127.0.0.1:4321
npm run build
npm start          # production build (HOST=127.0.0.1)
npm run verify     # = test + check + build (배포 게이트)
npm test           # vitest
```

- Node **22.12 이상**. 개발 환경은 Node 24 / npm 11.6.2.
- 모든 게시/패키징은 `prepack` 훅이 `npm run verify`를 자동 실행한다 → `npm publish`/`npm pack`은 항상 test+check+build를 선행.

## npm 게시

- 패키지: `skill-manage`, 계정 `npmc_5`, public.
- 계정에 **2FA**가 켜져 있어 `npm publish`는 인터랙티브 터미널에서 OTP 프롬프트로, 또는 `npm publish --otp=<코드>`로 게시.
- 같은 버전 재게시 불가 → 버전을 올려야 함.

## 자동 배포 (`.github/workflows/npm-publish.yml`)

main에 push하면:
1. checkout → Node 24 → `npm install`
2. `npm run verify`(test+check+build) **항상 실행**
3. `package.json` 버전 vs npm 최신 버전 비교
   - 같으면 → 게시 **건너뜀**
   - 새 버전이면 → `npm publish --access public`(`NPM_TOKEN` 사용)
4. 게시했으면 → **GitHub Release `v<버전>`** 자동 생성(`--generate-notes` 자동 노트, `GITHUB_TOKEN` 사용). 태그는 트리거 커밋을 가리킴.

**새 버전 릴리스:**
```bash
npm version patch      # 0.1.0 → 0.1.1
git push origin main   # CI가 자동 게시
```

### ⚠️ CI 주의사항 ( past 삽질 기록 — 함부로 "수정" 금지)

- **`npm ci`가 아니라 `npm install`을 쓴다.** macOS에서 생성한 `package-lock.json`에 Linux용 `@img/sharp` / `@emnapi/runtime` optional-dep 항목이 없어서, Linux 러너에선 `npm ci`가 `Missing: @emnapi/runtime@1.11.2` 에러로 실패한다. `npm install`은 플랫폼에 맞춰 해석·설치하므로 통과. 크로스 플랫폼 lockfile을 다시 제대로 만들기 전까진 `npm ci`로 되돌리지 말 것.
- CI **Node 24** (로컬 npm 11.6.2와 정렬). Node 22/npm10은 같은 lockfile을 불일치로 판단해 `npm ci`가 실패.
- 첫 main push는 "0.1.0 already on npm — skipping publish"로 게시를 건너뛰며 CI가 green인지만 확인.

## NPM_TOKEN (갱신 주의)

- `NPM_TOKEN`은 GitHub repo secret. 값은 **Granular Access Token**("skill-manage CI", Read and write, 모든 패키지, **90일 만료**).
- **만료일 ≈ 2026-10-20.** 그 전에 재발급하지 않으면 게시가 인증 에러로 실패한다.
- 갱신: npmjs.com → Access Tokens에서 Granular 토큰 재생성 후
  ```bash
  gh secret set NPM_TOKEN --repo pinion05/skill-manage   # 값 붙여넣기
  ```

### npm 토큰 폼을 cmux로 자동화하는 법 (기술 노트)

npm "New Granular Access Token" 폼은 GitHub **Primer `<details-menu>` SelectMenu** 드롭다운을 쓴다. 핵심: 항목들은 `<details>`가 **닫혀 있으면 렌더링 자체가 안 돼서** 클릭이 안 통하고, eval `.click()`은 React에 안 먹힌다. 작동하는 패턴:

1. **`<summary>`를 네이티브 클릭**으로 열어야만 메뉴가 활성화된다. 단 React 리렌더가 eval로 붙인 id를 날리므로, **구조적 CSS 선택자**(nth-of-type 경로)를 eval에서 계산해 쓴다:
   ```js
   // 예: form#create-gat > div:nth-of-type(2) > div:nth-of-type(2) > details > summary
   function sel(el){ /* 부모까지 올라가 tag + nth-of-type 경로 생성 */ }
   ```
2. 항목은 cmux의 `find role`가 **매번 새로 계산한 선택자**를 주므로 그걸로 클릭:
   ```bash
   cmux browser find role menuitemcheckbox --name "Read and write" --surface <S> --json
   # → selector 필드를 cmux browser click 에 전달
   ```
3. 라디오(`#packagesAll` 등)는 vis=true면 직접 클릭. Generate 후 토큰은 **1회 표시** → 즉시 캡처(`$(cmux browser eval ... | grep npm_)`)해 **값 출력 없이** `gh secret set`으로 파이프.

## 메모리 / 컨텍스트

이 파일의 내용 중 배포·CI·토큰 갱신 관련 핵심은 사용자 전역 memory(`skill-manage-publish-ci.md`)에도 있다. 둘 중 하나를 고치면 다른 쪽도 맞출 것.
