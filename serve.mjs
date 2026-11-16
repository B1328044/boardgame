// 本機靜態伺服器：只監聽 127.0.0.1，只提供首頁與兩種模式的遊戲檔案。
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const assets=new Set(['index.html',...['enterprise','personal'].flatMap(m=>[`${m}/index.html`,`${m}/styles.css`,`${m}/game.js`]),
  ...['host.html','join.html','host.js','join.js','common.js','sound.js','core.js','online.css','index.html','vendor/peerjs-1.5.2.min.js','vendor/qrcode-generator-1.4.4.js'].map(f=>`online/${f}`)]);
const port=4173;

createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  let path;
  try{path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/,'')}catch{res.writeHead(400);res.end();return}
  if(path===''||path.endsWith('/'))path+='index.html';
  if(['enterprise','personal','online'].includes(path)){res.writeHead(301,{Location:`/${path}/`});res.end();return}
  if(path==='online/index.html')path='online/host.html';
  if(!assets.has(path)){res.writeHead(404);res.end();return}
  try{
    const body=await readFile(new URL(path,import.meta.url));
    res.writeHead(200,{'Content-Type':types[path.slice(path.lastIndexOf('.'))],'Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500);res.end()}
}).listen(port,'127.0.0.1',()=>console.log(`財經棋局：http://127.0.0.1:${port}/`));
