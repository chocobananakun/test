// pack_single_unity_webgl.js
import fs from "fs";

const BUILD_DIR = "./Build";
const HTML_FILE = "./index.html";
const OUTPUT = "./Single_Unity.html";

// ファイルをbase64化
function base64(path) {
  return fs.readFileSync(path).toString("base64");
}

// JSONファイルもbase64で埋め込む
const json = fs.readFileSync(`${BUILD_DIR}/10MinutesTillDawnWebGL.json`, "utf8");

// 各アセットをbase64に
const data = base64(`${BUILD_DIR}/10MinutesTillDawnWebGL.data.unityweb`);
const wasm = base64(`${BUILD_DIR}/10MinutesTillDawnWebGL.wasm.code.unityweb`);
const framework = base64(`${BUILD_DIR}/10MinutesTillDawnWebGL.wasm.framework.unityweb`);

let html = fs.readFileSync(HTML_FILE, "utf8");

// main.js や loader.js を読み込む部分を削除して自前のJSを埋め込み
html = html.replace(/<script.*?Build\/.*?<\/script>/gs, "");

// 下にUnityロード処理を追加
html = html.replace("</body>", `
<script>
(async () => {
  const config = ${json};

  // base64埋め込みデータ
  const files = {
    "Build/10MinutesTillDawnWebGL.data.unityweb": "data:application/octet-stream;base64,${data}",
    "Build/10MinutesTillDawnWebGL.wasm.code.unityweb": "data:application/wasm;base64,${wasm}",
    "Build/10MinutesTillDawnWebGL.wasm.framework.unityweb": "data:application/octet-stream;base64,${framework}"
  };

  // fetchフック
  const origFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (files[url]) {
      const res = await origFetch(files[url]);
      return res;
    }
    return origFetch(url, ...args);
  };

  // UnityのメインJSを生成
  const unityScript = document.createElement('script');
  unityScript.src = files["Build/10MinutesTillDawnWebGL.wasm.framework.unityweb"] ? "Build/10MinutesTillDawnWebGL.framework.js" : "";
  document.body.appendChild(unityScript);

  // Unity Instance 起動
  const container = document.querySelector("#unity-container") || document.body;
  const canvas = document.querySelector("#unity-canvas") || document.createElement("canvas");
  if (!canvas.parentNode) container.appendChild(canvas);
  await createUnityInstance(canvas, config, (progress) => {
    console.log("Loading...", progress);
  });
})();
</script>
</body>`);

fs.writeFileSync(OUTPUT, html);
console.log("✅ Single file Unity WebGL built:", OUTPUT);
