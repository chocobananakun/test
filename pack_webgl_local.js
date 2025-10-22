// pack_webgl_local.js
// Unity WebGLを1ファイル化（file://対応版）

import fs from "fs";

const base = "./Build";
const htmlTemplate = "./index.html";
const output = "./10min_single.html";

function toBase64(path) {
  return fs.readFileSync(path).toString("base64");
}
function encodeJSON(path) {
  return Buffer.from(fs.readFileSync(path, "utf8")).toString("base64");
}

const loader = fs.readFileSync(`${base}/UnityLoader.js`, "utf8");
const data = toBase64(`${base}/10MinutesTillDawnWebGL.data.unityweb`);
const code = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.code.unityweb`);
const framework = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.framework.unityweb`);
const json = encodeJSON(`${base}/10MinutesTillDawnWebGL.json`);

let html = fs.readFileSync(htmlTemplate, "utf8");

html = html.replace(/<script.*?UnityLoader\.js.*?<\/script>/, `<script>${loader}</script>`);
html = html.replace(/"Build\\/10MinutesTillDawnWebGL\\.json"/, `"data:application/json;base64,${json}"`);

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

  // fetchを上書き（file://でも動く）
  const origFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (files[url]) {
      const bin = Uint8Array.from(atob(files[url]), c => c.charCodeAt(0));
      return new Response(bin);
    }
    return origFetch(url, ...args);
  };

  // XMLHttpRequest対応（UnityLoader古い版）
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._localUrl = url;
    origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (files[this._localUrl]) {
      const bin = Uint8Array.from(atob(files[this._localUrl]), c => c.charCodeAt(0));
      this.response = bin.buffer;
      this.onload && this.onload({ target: this });
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
</script>
</body>`
);

fs.writeFileSync(output, html);
console.log("✅ file:// 対応 single HTML を生成しました →", output);