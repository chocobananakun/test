// pack_single_fixed.js
import fs from "fs";

const BUILD = "./Build";
const HTML = "./index.html";
const OUTPUT = "./single_fixed.html";

function base64(path) {
  return fs.readFileSync(path).toString("base64");
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

// --- ファイル読み込み ---
const json = readText(`${BUILD}/10MinutesTillDawnWebGL.json`);
const frameworkJS = readText(`${BUILD}/10MinutesTillDawnWebGL.framework.js`);
const mainJS = readText(`${BUILD}/10MinutesTillDawnWebGL.loader.js`) || readText(`${BUILD}/10MinutesTillDawnWebGL.loader.js`);
const data = base64(`${BUILD}/10MinutesTillDawnWebGL.data.unityweb`);
const wasm = base64(`${BUILD}/10MinutesTillDawnWebGL.wasm.code.unityweb`);
const framework = base64(`${BUILD}/10MinutesTillDawnWebGL.wasm.framework.unityweb`);

let html = readText(HTML);

// --- 外部スクリプト読み込みを削除 ---
html = html.replace(/<script.*?Build\/.*?<\/script>/gs, "");

// --- Unityランタイムスクリプト埋め込み ---
html = html.replace(
  "</body>",
  `
<script>
${frameworkJS}
</script>

<script>
${mainJS}

// --- Base64埋め込みと fetch フック ---
(() => {
  const files = {
    "Build/10MinutesTillDawnWebGL.data.unityweb": "data:application/octet-stream;base64,${data}",
    "Build/10MinutesTillDawnWebGL.wasm.code.unityweb": "data:application/wasm;base64,${wasm}",
    "Build/10MinutesTillDawnWebGL.wasm.framework.unityweb": "data:application/octet-stream;base64,${framework}",
  };

  const origFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (files[url]) {
      const res = await origFetch(files[url]);
      return res;
    }
    return origFetch(url, ...args);
  };
})();
</script>
</body>`
);

// --- 出力 ---
fs.writeFileSync(OUTPUT, html);
console.log("✅ file:// 完全対応 single HTML 生成:", OUTPUT);
