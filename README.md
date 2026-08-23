# Gemini Notebook ZIP Helper

Gemini Notebook(구 NotebookLM, https://notebook.google.com/ )은 zip을 소스로 받지 않는다.
이 크롬 익스텐션은 zip을 브라우저 안에서 풀고, 앱이 "파일 업로드"를 위해 여는
`<input type="file">`에 내용물을 대신 채워 넣어 소스로 등록시킨다.

## 테스트 현황

| 사이트 | 상태 |
|---|---|
| `notebook.google.com` (Gemini Notebook) | ✅ 동작 확인 |
| `gemini.google.com` (Gemini 앱 내 노트북 뷰) | ⚠️ 미테스트 — 같은 훅 방식이라 동작할 것으로 예상되나 검증 전 |

## 빌드

```
npm install
npm run build      # dist/ 생성
npm run watch      # 개발 중 자동 재빌드
```

## 설치

1. `chrome://extensions` → 개발자 모드 ON
2. "압축해제된 확장 프로그램을 로드합니다" → `dist/` 폴더 선택

## 사용

1. 노트북 페이지 우하단 **📦 ZIP 소스 추가** 버튼 → zip 선택 → "준비 완료" 토스트
2. 앱의 **소스 추가 → 파일 업로드** 클릭
3. OS 파일 선택창 대신 zip 내용물이 업로드에 들어간다

모드:
- **파일별 업로드**: 파일 하나가 소스 하나. 코드/설정 등 텍스트는 `.txt`로 변환(경로는 `dir__file.py.txt` 식으로 파일명에 보존), pdf/md/오디오/이미지는 그대로.
- **하나로 합쳐 업로드**: 텍스트 파일 전체를 하나의 `.md`로 묶음 (소스 개수 제한 대비). 바이너리는 개별 추가.

`.git`, `node_modules`, `dist`, `build`, `__MACOSX` 등은 건너뛴다.

## 동작 원리

- `content.js` (격리 월드): 캡슐 UI, JSZip으로 압축 해제, `postMessage`로 메인 월드에 파일 전달
- `main.js` (MAIN 월드): `HTMLInputElement.prototype.click` / `showPicker`를 감싸, 대기 파일이
  있으면 파일 선택창 대신 그 파일들을 input에 채우고 `change` 이벤트를 발생

앱이 파일 선택을 `showOpenFilePicker` 등 다른 API로 열도록 바뀌면 훅이 걸리지 않는다.
