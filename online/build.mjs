// 把個人版的規則引擎、Bot 與房間邏輯合併成大螢幕（房主）用的 core.js。
// 修改 personal/data.js、engine.js、bot.js 或 online/room.mjs 後，執行 node online/build.mjs。
import {readFileSync,writeFileSync} from 'node:fs';

const files=['../personal/data.js','../personal/engine.js','../personal/bot.js','./room.mjs'];
const pieces=files.map(file=>readFileSync(new URL(file,import.meta.url),'utf8')
  .replace(/^import .*? from '[^']+';\r?\n/gm,'')
  .replace(/^export (const|function|class) /gm,'$1 '));
writeFileSync(new URL('core.js',import.meta.url),`// 由 personal/data.js、engine.js、bot.js 與 online/room.mjs 產生，請勿直接修改；改完原始檔後執行 node online/build.mjs。\n'use strict';\n${pieces.join('\n\n')}`);
console.log('Built online/core.js.');
