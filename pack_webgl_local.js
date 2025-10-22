// pack_webgl_local.js (修正版 for file://)

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

// === ファイル読み込み ===
const loader = fs.readFileSync(`${base}/UnityLoader.js`, "utf8");
const data = toBase64(`${base}/10MinutesTillDawnWebGL.data.unityweb`);
const code = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.code.unityweb`);
const framework = toBase64(`${base}/10MinutesTillDawnWebGL.wasm.framework.unityweb`);
const json = encodeJSON(`${base}/10MinutesTillDawnWebGL.json`);

let html = fs.readFileSync(htmlTemplate, "utf8");

// UnityLoader.js を直接埋め込み
html = html.replace(/<script.*?UnityLoader\.js.*?<\/script>/, `<script>${loader}</script>`);

// JSONファイルも data URI に差し替え
html = html.replace(
  /"Build\/10MinutesTillDawnWebGL\.json"/,
  `"data:application/json;base64,${json}"`
);

// === fetch / XMLHttpRequest を完全フック ===
html = html.replace(
  "</body>",
  `
<script>
(() => {
  const files = {
    "Build/10MinutesTillDawnWebGL.data.unityweb": "data:application/octet-stream;base64,${data}",
    "Build/10MinutesTillDawnWebGL.wasm.code.unityweb": "data:application/wasm;base64,${code}",
    "Build/10MinutesTillDawnWebGL.wasm.framework.unityweb": "data:application/octet-stream;base64,${framework}"
  };

  // fetch フック
  const origFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (files[url]) {
      const res = await fetch(files[url]); // data URI を直接fetch
      return res;
    }
    return origFetch(url, ...args);
  };

  // XMLHttpRequest フック (古いUnity対応)
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._localUrl = url;
    origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (files[this._localUrl]) {
      fetch(files[this._localUrl])
        .then(r => r.arrayBuffer())
        .then(buf => {
          this.response = buf;
          this.readyState = 4;
          this.status = 200;
          this.onload && this.onload({ target: this });
          this.onreadystatechange && this.onreadystatechange();
        });
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
</script>
</body>`
);

// 出力
fs.writeFileSync(output, html);
console.log("✅ file:// 完全対応 single HTML を生成しました →", output);
