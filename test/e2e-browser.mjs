import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import http from 'http';import fs from 'fs';import path from 'path';import {createRequire} from 'module';
const root='/home/claude/bms',types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript'};
const srv=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.statusCode=404;return r.end()}r.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(8124);
const b=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'],headless:'shell',defaultViewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}});
const p=await b.newPage();const errs=[],res=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});p.on('dialog',d=>d.accept('My preset'));
const ok=(n,c,x='')=>{res.push((c?'PASS ':'FAIL ')+n+(x?' '+x:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=id=>p.evaluate(i=>document.getElementById(i).click(),id);const tab=t=>click('nav-'+t);const status=()=>p.evaluate(()=>document.getElementById('status').textContent);
const waitStatus=async(re,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){const s=await status();if(re.test(s))return s;await sleep(250)}return 'TIMEOUT: '+await status()};
await p.goto('http://localhost:8124/',{waitUntil:'load'});await sleep(1500);
ok('page ready, no errors',await p.evaluate(()=>window.__bmsReady===1)&&errs.length===0,errs.join('|'));
await p.screenshot({path:'/tmp/shot_studio.png'});
// 1 beat maker
await tab('beat');await click('mkbeat');let s=await waitStatus(/Beat ready|Could not/);ok('beat maker',/Beat ready/.test(s),s);
await p.screenshot({path:'/tmp/shot_beat.png'});
// 2 record 3s on Double track
await tab('studio');await p.evaluate(()=>{document.getElementById('rtrack').value='1'});await p.evaluate(()=>{document.getElementById('bpm').value=140;document.getElementById('cin').value='0'});
await click('rec');await sleep(3500);await click('rec');s=await waitStatus(/placed|Nothing|Could not|too short/);ok('record + stop places a clip',/placed on Double/.test(s),s);
const info=await p.evaluate(()=>{const S=window.__bms,t=S.takes[0];let pk=0;if(t)for(const v of t.data)pk=Math.max(pk,Math.abs(v));return{takes:S.takes.length,clips:S.clips.length,track:S.clips[0]&&S.clips[0].track,peak:pk,secs:t?t.data.length/t.sr:0}});
ok('take has real audio',info.takes===1&&info.clips===1&&info.track===1&&info.peak>0.001&&info.secs>2.5,JSON.stringify(info));
await p.screenshot({path:'/tmp/shot_clip.png'});
// 3 play
await click('play');await sleep(1800);const pl=await p.evaluate(()=>({st:window.__bms.ctx.state,t:window.__bms.ctx.currentTime,live:window.__bms.live.length}));ok('playback running',pl.st==='running'&&pl.live>0,JSON.stringify(pl));await click('stop');
// 4 export mix and analyse the real file
await tab('project');await p.evaluate(()=>{document.getElementById('dl').innerHTML=''});await click('expmix');s=await waitStatus(/ready & verified|failed|silent/i,40000);ok('export mix',/ready & verified/.test(s),s);
const ex=await p.evaluate(async()=>{const a=document.querySelector('#dl a');if(!a)return null;const buf=await (await fetch(a.href)).arrayBuffer();const c=new OfflineAudioContext(2,1,44100),d=await c.decodeAudioData(buf);const L=d.getChannelData(0);let pkBeat=0,pkVox=0;for(let i=0;i<L.length;i++){}const sr=d.sampleRate,sec=x=>{let m=0;for(let i=Math.floor(x[0]*sr);i<Math.min(L.length,Math.floor(x[1]*sr));i++)m=Math.max(m,Math.abs(L[i]));return m};return{dur:d.duration,peak:sec([0,d.duration]),name:a.download}});
ok('exported file has audio',ex&&ex.peak>0.01&&ex.dur>2,JSON.stringify(ex));
// 5 mp3 export
await p.evaluate(()=>{const f=document.getElementById('fmt');f.value='192'});await p.evaluate(()=>{document.getElementById('dl').innerHTML=''});await click('expmix');s=await waitStatus(/ready & verified|failed/i,40000);ok('mp3 export',/MP3/.test(s)&&/ready & verified/.test(s),s);
await p.evaluate(()=>{document.getElementById('fmt').value='wav'});
// 6 vocal fx
await tab('fx');await click('auto');s=await waitStatus(/Effects set|silent|Record a vocal/);ok('auto vocal engineer',/Effects set/.test(s)||/silent/.test(s),s);
const rep=await p.evaluate(()=>document.getElementById('report').textContent.length);ok('report shown',rep>50||/silent/.test(s),String(rep));
await click('presapply');ok('preset applies',/applied/.test(await status()),await status());
await p.screenshot({path:'/tmp/shot_fx.png'});
// 7 mp3 import via file input
const lame=new Function(fs.readFileSync('/home/claude/bms/lame.min.js','utf8')+';return lamejs')();const sr=44100,n=sr*3,pcm=new Int16Array(n);for(let i=0;i<n;i++)pcm[i]=Math.round(9000*Math.sin(2*Math.PI*220*i/sr));
const enc=new lame.Mp3Encoder(1,sr,128),parts=[];for(let i=0;i<n;i+=1152){const bb=enc.encodeBuffer(pcm.subarray(i,i+1152));if(bb.length)parts.push(Buffer.from(bb))}parts.push(Buffer.from(enc.flush()));fs.writeFileSync('/tmp/test beat.mp3',Buffer.concat(parts));
await tab('beat');const inp=await p.$('#file');await inp.uploadFile('/tmp/test beat.mp3');s=await waitStatus(/Beat loaded|Could not read/);ok('mp3 import',/Beat loaded/.test(s),s);
// 8 track mixer + mute/solo UI + master + backup
await tab('mixer');const tr=await p.evaluate(()=>document.querySelectorAll('#tracks .take').length);ok('4 tracks shown',tr===4);await p.screenshot({path:'/tmp/shot_mixer.png'});
await tab('master');await click('mixchk');s=await waitStatus(/Mix check done|failed|needs/i,60000);ok('mix assistant',/Mix check done/.test(s),s);
await click('expmast');s=await waitStatus(/Master ready|failed|silence/i,90000);ok('master export',/Master ready/.test(s),s);
await tab('project');await p.evaluate(()=>{document.getElementById('dl').innerHTML=''});await click('bk');s=await waitStatus(/Backup ready|failed|Nothing/);ok('backup',/Backup ready/.test(s),s);
// 9 persistence across reload
await p.reload({waitUntil:'load'});await sleep(2000);const rs=await p.evaluate(()=>({takes:window.__bms.takes.length,clips:window.__bms.clips.length,beat:!!window.__bms.beat}));ok('data survives reload',rs.takes===1&&rs.clips===1&&rs.beat,JSON.stringify(rs));
ok('no console errors overall',errs.length===0,errs.join('|'));
console.log(res.join('\n'));await b.close();srv.close();
