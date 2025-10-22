// Node.js v18+
// 使い方: node pack_webgl_local.js
// 結果: 10min_single.html が生成され、file://でも動作可能

import fs from "fs";

// === 基本設定 ===
const base = "./Build";
const htmlTemplate = "./index.html";
const output = "./10min_single.html";

// === ユーティリティ ===
function toBase64(path) {
  return fs.readFileSync(path).toString("base64");
}
function encodeJSON(path) {
  return Buffer.from(fs.readFileSync(path, "utf8")).toString("base64");
}

// === 各ファイル ===
const loader = fs.readFileSync(`${base}/UnityLoader.js`, "utf8");
const data = toBase64(`${base}/10MinutesTillDawnWebGL.data.unityweb`);
const code = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.code.unityweb`);
const framework = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.framework.unityweb`);
const json = encodeJSON(`${base}/10MinutesTillDawnWebGL.json`);

// === index.html 読み込み ===
let html = fs.readFileSync(htmlTemplate, "utf8");

// === UnityLoader埋め込み ===
html = html.replace(/<script.*?UnityLoader\.js.*?<\/script>/, `<script>${loader}</script>`);

// === JSONファイル埋め込み ===
html = html.replace(
  /"Build\/10MinutesTillDawnWebGL\.json"/,
  `"data:application/json;base64,${json}"`
);

// === fetchを上書き（Base64データを直接返す） ===
html = html.replace(
  "</body>",
  `
<script>
(() => {
  const files = {
    "Build/10MinutesTillDawnWebGL.data.unityweb": "${data}",
    "Build/10MinutesTillDawnWebGL.wasm.code.unityweb": "${code}",
    "Build/10MinutesTillDawnWebGL.wasm.framework.unityweb": "${framework}"
  };

  // fetchフック
  const originalFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (files[url]) {
      const base64 = files[url];
      const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      return new Response(binary);
    }
    return originalFetch(url, ...args);
  };

  // XMLHttpRequest対応（古いUnity用）
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._localUrl = url;
    origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (files[this._localUrl]) {
      const b64 = files[this._localUrl];
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      this.onload && this.onload({
        target: { response: bin.buffer, responseText: bin }
      });
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
</script>
</body>`
);

// === 出力 ===
fs.writeFileSync(output, html);
console.log("✅ file:// 対応 single HTML を生成しました →", output);