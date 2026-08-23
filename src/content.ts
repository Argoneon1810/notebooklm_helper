import JSZip from "jszip";

/**
 * NotebookLM ZIP Helper
 *
 * NotebookLM은 zip을 소스로 받지 않는다. 이 스크립트는 zip을 브라우저 안에서 풀고,
 * 내용물을 NotebookLM의 "소스 추가" 다이얼로그에 있는 <input type="file">에
 * DataTransfer로 주입한다. 그러면 NotebookLM이 자기 업로드 경로로 정상 등록한다.
 */

// NotebookLM이 파일 업로드로 받아주는 확장자 (그대로 올림)
const NATIVE_EXT = new Set([
  "pdf", "txt", "md", "markdown",
  "mp3", "wav", "m4a", "ogg", "aac", "flac",
  "png", "jpg", "jpeg", "webp",
]);

// 텍스트로 간주해 .txt 로 변환해서 올릴 확장자
const TEXT_EXT = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "swift",
  "c", "cc", "cpp", "h", "hpp", "cs", "php", "sh", "bash", "zsh", "ps1", "bat",
  "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "xml", "html", "htm", "css", "scss", "less",
  "sql", "graphql", "proto", "csv", "tsv", "log", "rst", "tex", "org", "adoc",
  "gitignore", "dockerfile", "makefile", "lock",
]);

const IGNORE_PATH = /(^|\/)(\.git|node_modules|__pycache__|\.DS_Store|__MACOSX|dist|build)(\/|$)/;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

type Mode = "individual" | "merged";

function ext(name: string): string {
  const base = name.split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  return (i >= 0 ? base.slice(i + 1) : base).toLowerCase();
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

interface Extracted {
  path: string;
  file: File;
  isText: boolean;
  text?: string;
}

async function extractZip(zipFile: File): Promise<Extracted[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const out: Extracted[] = [];
  const dec = new TextDecoder("utf-8", { fatal: false });

  for (const entry of Object.values(zip.files)) {
    if (entry.dir || IGNORE_PATH.test(entry.name)) continue;
    const bytes = new Uint8Array(await entry.async("arraybuffer"));
    const e = ext(entry.name);
    const flat = entry.name.replace(/\//g, "__"); // 경로 정보를 파일명에 보존

    if (NATIVE_EXT.has(e)) {
      const isText = e === "txt" || e === "md" || e === "markdown";
      out.push({
        path: entry.name,
        isText,
        text: isText ? dec.decode(bytes) : undefined,
        file: new File([bytes], flat, { type: isText ? "text/plain" : "" }),
      });
    } else if ((TEXT_EXT.has(e) || looksLikeText(bytes)) && bytes.length <= MAX_TEXT_BYTES) {
      const text = dec.decode(bytes);
      out.push({
        path: entry.name,
        isText: true,
        text,
        file: new File([text], `${flat}.txt`, { type: "text/plain" }),
      });
    }
    // 그 외(바이너리 등)는 건너뜀
  }
  return out;
}

function buildMerged(items: Extracted[], zipName: string): File {
  const parts: string[] = [`# ${zipName}\n`, `파일 ${items.length}개\n`];
  for (const it of items) {
    if (!it.isText) continue;
    parts.push(`\n\n---\n\n## ${it.path}\n\n\`\`\`\n${it.text ?? ""}\n\`\`\`\n`);
  }
  const name = zipName.replace(/\.zip$/i, "") + ".md";
  return new File([parts.join("")], name, { type: "text/markdown" });
}

/** Angular CDK 오버레이 컨테이너. 있으면 캡슐을 그 안에 둬야 모달 위에서 클릭된다. */
function capsuleHost(): HTMLElement {
  return document.querySelector<HTMLElement>(".cdk-overlay-container") ?? document.body;
}

function sendToPage(files: File[]) {
  window.postMessage({ type: "GN_ZIP_FILES", files }, "*");
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window || ev.data?.type !== "GN_ZIP_CONSUMED") return;
  const names: string[] = ev.data.names ?? [];
  const list = names.slice(0, 5).map((n) => "• " + n).join("\n") + (names.length > 5 ? "\n…" : "");
  toast(`${ev.data.count}개 파일을 업로드에 넘겼습니다.\n${list}`, 8000);
});

// ---------- UI ----------

function toast(msg: string, ms = 4000) {
  let el = document.getElementById("gn-zip-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "gn-zip-toast";
    Object.assign(el.style, {
      position: "fixed", right: "20px", bottom: "80px", zIndex: "2147483647",
      background: "#202124", color: "#fff", padding: "10px 14px", borderRadius: "8px",
      font: "13px/1.4 system-ui, sans-serif", maxWidth: "360px", whiteSpace: "pre-wrap",
      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout((el as any)._t);
  (el as any)._t = setTimeout(() => (el!.style.display = "none"), ms);
}

function isTargetPage(): boolean {
  const h = location.hostname;
  return h === "notebook.google.com" || h === "notebooklm.google.com" || h === "gemini.google.com";
}

function mountButton() {
  if (!document.body) return;
  const existing = document.getElementById("gn-zip-btn");
  if (!isTargetPage()) { existing?.remove(); return; }
  if (existing) {
    // 모달(top layer)이 열리면 그 안으로 옮겨야 클릭이 된다
    const host = capsuleHost();
    if (existing.parentElement !== host) host.appendChild(existing);
    existing.removeAttribute("inert");
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "gn-zip-btn";
  Object.assign(wrap.style, {
    position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483647",
    display: "flex", gap: "6px", alignItems: "center",
    background: "#fff", color: "#202124", border: "1px solid #dadce0", borderRadius: "24px",
    padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,.2)",
    font: "13px system-ui, sans-serif", colorScheme: "light",
  });

  const select = document.createElement("select");
  for (const [v, label] of [["individual", "파일별 업로드"], ["merged", "하나로 합쳐 업로드"]]) {
    const o = document.createElement("option");
    o.value = v; o.textContent = label; select.appendChild(o);
  }
  Object.assign(select.style, {
    border: "1px solid #dadce0", borderRadius: "12px", background: "#fff", color: "#202124",
    font: "inherit", padding: "4px 6px", colorScheme: "light",
  });

  const btn = document.createElement("button");
  btn.textContent = "📦 ZIP 소스 추가";
  Object.assign(btn.style, {
    border: "none", background: "#1a73e8", color: "#fff", borderRadius: "18px",
    padding: "6px 12px", cursor: "pointer", font: "inherit",
  });

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip,application/zip";
  input.dataset.gnZipHelper = "1";
  input.style.display = "none";

  btn.onclick = () => input.click();
  input.onchange = async () => {
    const zip = input.files?.[0];
    input.value = "";
    if (!zip) return;
    await handleZip(zip, select.value as Mode);
  };

  wrap.style.pointerEvents = "auto";
  wrap.append(select, btn, input);
  capsuleHost().appendChild(wrap);
}

async function handleZip(zip: File, mode: Mode) {
  toast(`압축 푸는 중: ${zip.name}`);
  let items: Extracted[];
  try {
    items = await extractZip(zip);
  } catch (e) {
    toast(`zip 읽기 실패: ${(e as Error).message}`);
    return;
  }
  if (!items.length) {
    toast("올릴 수 있는 파일이 없습니다 (텍스트/pdf/md/오디오/이미지만 지원).");
    return;
  }

  let files: File[];
  if (mode === "merged") {
    const binaries = items.filter((i) => !i.isText).map((i) => i.file);
    files = [buildMerged(items, zip.name), ...binaries];
  } else {
    files = items.map((i) => i.file);
  }

  sendToPage(files);
  toast(`파일 ${files.length}개 준비 완료.
이제 "소스 추가" → "파일 업로드"를 누르세요. 파일 선택창 대신 이 파일들이 올라갑니다.`, 12000);
}

// SPA라 body가 갈아끼워질 수 있으므로 주기적으로 버튼 유지
console.log("[Notebook ZIP Helper] v" + chrome.runtime.getManifest().version, "loaded on", location.href);
try { mountButton(); } catch (e) { console.error("[Notebook ZIP Helper] mount failed", e); }
new MutationObserver(() => mountButton()).observe(document.documentElement, { childList: true, subtree: true });
