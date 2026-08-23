/**
 * MAIN world 스크립트. 페이지의 HTMLInputElement.prototype.click 을 가로채서,
 * 대기 중인 파일이 있으면 OS 파일 선택창 대신 그 파일들을 input 에 채우고 change 를 발생시킨다.
 * 앱(Gemini Notebook / Gemini)은 사용자가 파일을 고른 것과 똑같이 처리한다.
 */
const TAG = "[Notebook ZIP Helper/main]";
let pending: File[] | null = null;

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window || !ev.data || typeof ev.data !== "object") return;
  if (ev.data.type === "GN_ZIP_FILES" && Array.isArray(ev.data.files)) {
    pending = ev.data.files as File[];
    console.log(TAG, "pending files:", pending.length);
  } else if (ev.data.type === "GN_ZIP_CLEAR") {
    pending = null;
  }
});

function feed(input: HTMLInputElement): boolean {
  if (!pending || input.type !== "file") return false;
  const files = pending;
  pending = null;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  // multiple 이 아니면 앱이 첫 파일만 쓸 수 있으니 켜 둔다
  input.multiple = true;
  input.files = dt.files;
  // 앱이 change 핸들러를 붙일 시간을 준 뒤 이벤트 발생
  setTimeout(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    window.postMessage({ type: "GN_ZIP_CONSUMED", count: files.length, names: files.map((f) => f.name) }, "*");
    console.log(TAG, "fed", files.length, "files into", input);
  }, 0);
  return true;
}

const origClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
  if (feed(this)) return;
  return origClick.call(this);
};
const origShowPicker = (HTMLInputElement.prototype as any).showPicker;
if (typeof origShowPicker === "function") {
  (HTMLInputElement.prototype as any).showPicker = function (this: HTMLInputElement) {
    if (feed(this)) return;
    return origShowPicker.call(this);
  };
}
console.log(TAG, "hook installed");
