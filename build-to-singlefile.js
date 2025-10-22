#!/usr/bin/env node
/*
  build-to-singlefile.js
  Usage:
    node build-to-singlefile.js <build_dir> <output.html>
  Example:
    node build-to-singlefile.js ./Build ./index-singlefile.html
*/
const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
  console.error('Usage: node build-to-singlefile.js <build_dir> <output.html>');
  process.exit(2);
}
const buildDir = process.argv[2];
const outFile = process.argv[3];

if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory()) {
  console.error('build_dir not found or not a directory:', buildDir);
  process.exit(2);
}

function collectFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const full = path.join(dir, e);
    const s = fs.statSync(full);
    if (s.isFile()) files.push({ rel: e, full });
    else if (s.isDirectory()) {
      const sub = fs.readdirSync(full);
      for (const f of sub) {
        const ff = path.join(full, f);
        if (fs.statSync(ff).isFile()) files.push({ rel: path.join(e, f).replace(/\\/g,'/'), full: ff });
      }
    }
  }
  return files;
}

const files = collectFiles(buildDir);
if (files.length === 0) {
  console.error('No files found in build_dir:', buildDir);
  process.exit(2);
}

// Try to load index.html if present; otherwise minimal template
let indexHtmlPath = path.join(buildDir, 'index.html');
let templateHtml = null;
if (fs.existsSync(indexHtmlPath)) {
  templateHtml = fs.readFileSync(indexHtmlPath, 'utf8');
} else {
  templateHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Unity WebGL Single File</title></head>
<body>
  <div id="unity-container"></div>
  <!-- UNITY_SCRIPTS -->
</body>
</html>`;
}

// Helper: guess MIME by extension
function getMime(rel) {
  if (rel.endsWith('.wasm') || rel.endsWith('.wasm.unityweb') || rel.endsWith('.unityweb')) return 'application/wasm';
  if (rel.endsWith('.data') || rel.endsWith('.data.unityweb')) return 'application/octet-stream';
  if (rel.endsWith('.js')) return 'application/javascript';
  if (rel.endsWith('.mem')) return 'application/octet-stream';
  if (rel.endsWith('.json')) return 'application/json';
  if (rel.endsWith('.symbols')) return 'text/plain';
  return 'application/octet-stream';
}

// Build embedded map: keys will include plain filename and also "Build/filename" for safety
const embedded = {};
for (const f of files) {
  const buf = fs.readFileSync(f.full);
  const b64 = buf.toString('base64');
  const relPath = f.rel.replace(/^\/*/, '');
  embedded[relPath] = { b64, mime: getMime(relPath) };
  if (!relPath.startsWith('Build/')) {
    const buildKey = path.posix.join('Build', relPath);
    if (!embedded[buildKey]) embedded[buildKey] = { b64, mime: getMime(relPath) };
  }
  const last = relPath.split('/').slice(-1)[0];
  if (!embedded[last]) embedded[last] = { b64, mime: getMime(relPath) };
}

// Inline <script src="..."> if src points to a JS we embedded
let finalHtml = templateHtml;
const scriptTagRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/ig;
finalHtml = finalHtml.replace(scriptTagRegex, (m, src) => {
  const srcClean = src.replace(/^\.\//,'').replace(/^\//,'');
  const key = Object.keys(embedded).find(k => k.endsWith(srcClean) || k === srcClean);
  if (key && embedded[key].mime === 'application/javascript') {
    const js = Buffer.from(embedded[key].b64, 'base64').toString('utf8');
    return `<script>\n${js}\n</script>`;
  }
  return m;
});

// Build runtime override script
const embeddedJson = JSON.stringify(embedded);

const runtimeScript = `
<script>
(function(){
  const embedded = ${embeddedJson};

  function findKeyByUrl(url){
    if (!url) return null;
    try { url = (new URL(url, location.href)).pathname; } catch(e){}
    for (const k in embedded) {
      if (url.endsWith(k)) return k;
      const seg = k.split('/').slice(-1)[0];
      if (url.endsWith(seg)) return k;
      if (url.endsWith('/Build/' + seg) || url.endsWith('Build/' + seg)) return k;
    }
    return null;
  }

  function b64ToUint8Array(b64){
    try {
      const bin = atob(b64);
      const len = bin.length;
      const arr = new Uint8Array(len);
      for (let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
      return arr;
    } catch (e) {
      const CH = 0x8000;
      let binary = '';
      for (let i = 0; i < b64.length; i += CH) {
        const sub = b64.slice(i, i + CH);
        binary += atob(sub);
      }
      const len = binary.length;
      const arr = new Uint8Array(len);
      for (let i=0;i<len;i++) arr[i] = binary.charCodeAt(i);
      return arr;
    }
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    try {
      const url = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
      const key = findKeyByUrl(url);
      if (key) {
        const e = embedded[key];
        const arr = b64ToUint8Array(e.b64);
        const headers = new Headers();
        headers.set('Content-Type', e.mime || 'application/octet-stream');
        headers.set('Content-Encoding', 'gzip');
        const resp = new Response(arr, { status: 200, headers });
        return Promise.resolve(resp);
      }
    } catch (err) {
      console.warn('embedded fetch error', err);
    }
    return origFetch(input, init);
  };

  if (WebAssembly && WebAssembly.instantiateStreaming) {
    const origInstStream = WebAssembly.instantiateStreaming.bind(WebAssembly);
    WebAssembly.instantiateStreaming = async function(responsePromise, importObject){
      try {
        const respMaybe = await responsePromise;
        const url = respMaybe && respMaybe.url ? respMaybe.url : null;
        const key = findKeyByUrl(url);
        if (key) {
          const e = embedded[key];
          const arr = b64ToUint8Array(e.b64);
          return await WebAssembly.instantiate(arr.buffer, importObject);
        }
      } catch (err) {
        console.warn('instantiateStreaming embedded fallback failed', err);
      }
      return origInstStream(responsePromise, importObject);
    };
  }

  (function(){
    const OrigXHR = window.XMLHttpRequest;
    function MyXHR(){
      const xhr = new OrigXHR();
      let _openArgs = null;
      const origOpen = xhr.open.bind(xhr);
      xhr.open = function(method, url, async){
        _openArgs = { method, url, async };
        return origOpen.apply(this, arguments);
      };
      const origSend = xhr.send.bind(xhr);
      xhr.send = function(body){
        try {
          const url = _openArgs && _openArgs.url ? _openArgs.url : null;
          const key = findKeyByUrl(url);
          if (key) {
            const e = embedded[key];
            const arr = b64ToUint8Array(e.b64);
            setTimeout(() => {
              try {
                Object.defineProperty(xhr, 'response', { value: arr.buffer });
                Object.defineProperty(xhr, 'responseText', { value: new TextDecoder().decode(arr) });
                xhr.status = 200;
                if (typeof xhr.onload === 'function') xhr.onload();
                xhr.dispatchEvent(new ProgressEvent('load'));
              } catch (exc) {
                console.warn('XHR simulation error', exc);
              }
            }, 0);
            return;
          }
        } catch (err) {
          console.warn('embedded XHR error', err);
        }
        return origSend(body);
      };
      return xhr;
    }
    // If loader uses XHR and fails, uncomment the next line to force XHR interception:
    // window.XMLHttpRequest = MyXHR;
  })();

  try {
    window.UnityEmbeddedLocateFile = function(file){
      const key = findKeyByUrl(file);
      if (key) {
        const e = embedded[key];
        const arr = b64ToUint8Array(e.b64);
        const blob = new Blob([arr], { type: e.mime || 'application/octet-stream' });
        return URL.createObjectURL(blob);
      }
      return file;
    };
    // Also provide a Module.locateFile shim for loaders that call Module['locateFile']
    window.Module = window.Module || {};
    if (!window.Module.locateFile) {
      window.Module.locateFile = function(path) { return window.UnityEmbeddedLocateFile(path); };
    }
  } catch (e) {}

})();
</script>
`;

// Insert runtimeScript before </head> or before </body>
if (finalHtml.indexOf('</head>') !== -1) {
  finalHtml = finalHtml.replace('</head>', runtimeScript + '\n</head>');
} else if (finalHtml.indexOf('</body>') !== -1) {
  finalHtml = finalHtml.replace('</body>', runtimeScript + '\n</body>');
} else {
  finalHtml = runtimeScript + '\n' + finalHtml;
}

fs.writeFileSync(outFile, finalHtml, 'utf8');
console.log('Single-file HTML written to', outFile);
console.log('Embedded files:');
Object.keys(embedded).forEach(k => console.log(' -', k));