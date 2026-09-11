import {build} from '../node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
const {key,id}=JSON.parse(fs.readFileSync('public/key.json'));
fs.mkdirSync('dist',{recursive:true});
await build({entryPoints:['src/panel.jsx','src/background.js'],bundle:true,outdir:'dist',format:'esm',minify:true,jsx:'automatic'});
fs.copyFileSync('src/style.css','dist/style.css');
fs.writeFileSync('dist/panel.html',`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atea Coach Pilot</title><link rel="stylesheet" href="style.css"><div id="root"></div><script type="module" src="panel.js"></script></html>`);
fs.writeFileSync('dist/manifest.json',JSON.stringify({manifest_version:3,name:'Atea Coach Pilot',version:'0.5.2',description:'Lokal studieassistent för Apple Sales Coach. Oberoende pilot.',key,minimum_chrome_version:'116',permissions:['activeTab','scripting','sidePanel','nativeMessaging','storage'],host_permissions:['https://salescoach.apple.com/*','https://api.github.com/*'],optional_host_permissions:['https://*/*'],background:{service_worker:'background.js',type:'module'},action:{default_title:'Öppna Coach Pilot'},side_panel:{default_path:'panel.html'}},null,2));
console.log('Extension byggd: dist/ · ID: '+id);
