// 把個人版的規則引擎、Bot 與房間邏輯合併成大螢幕（房主）用的 core.js。
// 修改 personal/data.js、engine.js、bot.js 或 online/room.mjs 後，執行 node online/build.mjs。
import {readFileSync,writeFileSync} from 'node:fs';

// 企業版另外合併成 ent-core.js（兩個版本的函式同名，所以分成兩個檔案、各自的頁面只載入一個）。
const bundles=[
  ['core.js',['../personal/data.js','../personal/engine.js','../personal/bot.js','./room.mjs']],
  ['ent-core.js',['../enterprise/data.js','../enterprise/engine.js','../enterprise/bot.js','./ent-room.mjs'],'Room,newCode']
];
// 企業版只對外公開 Room 與 newCode，其餘包在函式裡，避免和 common.js 的小工具同名衝突。
for(const [out,files,expose] of bundles){
  const pieces=files.map(file=>readFileSync(new URL(file,import.meta.url),'utf8')
    .replace(/^import \{[^}]*\} from '[^']+';\r?\n/gm,'')
    .replace(/^export (const|function|class) /gm,'$1 '));
  const body=pieces.join('\n\n'),code=expose?`const {${expose}}=(()=>{\n${body}\nreturn {${expose}};\n})();`:body;
  writeFileSync(new URL(out,import.meta.url),`// 由 ${files.join('、')} 產生，請勿直接修改；改完原始檔後執行 node online/build.mjs。\n'use strict';\n${code}`);
  console.log(`Built online/${out}.`);
}
