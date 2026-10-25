import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import http from 'http';
import {createApp} from '../server/index.js';import {loadConfig} from '../server/config.js';import {wavEncode} from '../dsp.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),res=[],ok=(n,c,x='')=>res.push((c?'PASS ':'FAIL ')+n+(x?' '+x:''));
// fake ACE-Step server implementing the documented API (NOT a real model)
const wav=Buffer.from(wavEncode([Float32Array.from({length:22050*3},(_,i)=>0.3*Math.sin(2*Math.PI*220*i/22050))],22050));const tasks=new Map();
const ace=http.createServer((q,r)=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>{const J=(o,c=200)=>{r.writeHead(c,{'content-type':'application/json'});r.end(JSON.stringify({data:o,code:c,error:null}))};
 if(q.url==='/health')return J({status:'ok'});if(q.url.startsWith('/v1/audio')){r.writeHead(200,{'content-type':'audio/wav'});return r.end(wav)}
 const body=b?JSON.parse(b):{};if(q.url==='/release_task'){tasks.set('t1',0);global.lastBody=body;return J({task_id:'t1',status:'queued',queue_position:1})}
 if(q.url==='/query_result'){const n=(tasks.get('t1')||0)+1;tasks.set('t1',n);if(n<2)return J([{task_id:'t1',status:0,result:'[]'}]);return J([{task_id:'t1',status:1,result:JSON.stringify([{file:'/v1/audio?path=x.wav',status:1,metas:{bpm:98}}])}])}J({},404)})});
await new Promise(r=>ace.listen(0,'127.0.0.1',r));
const cfg={...loadConfig({}),accessToken:'tok-e2e',musicProvider:'acestep',pollMs:200,acestep:{url:'http://127.0.0.1:'+ace.address().port,key:'',format:'wav',timeoutMs:5000}};
const srv=http.createServer(createApp(cfg));await new Promise(r=>srv.listen(0,'127.0.0.1',r));const URL_='http://127.0.0.1:'+srv.address().port;
const b=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args,'--autoplay-policy=no-user-gesture-required'],headless:'shell',defaultViewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}});
const p=await b.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('dialog',d=>d.accept());
const click=id=>p.evaluate(i=>document.getElementById(i).click(),id),status=()=>p.evaluate(()=>document.getElementById('status').textContent);
await p.goto(URL_+'/',{waitUntil:'load'});await sleep(1200);await click('nav-beat');await sleep(300);
const st=await p.evaluate(()=>({form:getComputedStyle(document.getElementById('aiform')).display,stat:document.getElementById('aistatus').textContent,caps:document.querySelectorAll('#capslist .take').length}));
ok('AI card shows connected state and the honest registry',st.form==='block'&&/Real-model test: not run/.test(st.stat)&&st.caps>=15,JSON.stringify(st).slice(0,160));
await click('aigen');ok('generation blocked without consent',/consent/i.test(await status()),await status());
await p.evaluate(()=>{const e=document.getElementById('aiprompt');e.value='Dark Afro RnB, 98 BPM, plucked guitar, warm 808';document.getElementById('aibpm').value='98';document.getElementById('aikey').value='A minor';document.getElementById('aiconsent').checked=true;localStorage.bms_token='tok-e2e'});
await click('aigen');let t=Date.now();while(Date.now()-t<30000&&(await p.evaluate(()=>document.getElementById('aiplay').style.display))!=='block')await sleep(300);
ok('job completes and audio appears',(await p.evaluate(()=>document.getElementById('aiplay').style.display))==='block',await p.evaluate(()=>document.getElementById('aistat').textContent));
ok('server forwarded the request fields to the music server',global.lastBody&&global.lastBody.bpm===98&&global.lastBody.key_scale==='A minor'&&global.lastBody.lyrics==='[Instrumental]',JSON.stringify(global.lastBody));
await click('aiuse');await sleep(1500);const bt=await p.evaluate(()=>({n:window.__bms.beat&&window.__bms.beat.name,dur:window.__bms.beat&&window.__bms.beat.audio.duration,bpm:document.getElementById('bpm').value}));
ok('AI audio becomes the studio beat',bt.n&&bt.n.startsWith('AI:')&&bt.dur>2.5&&bt.bpm==='98',JSON.stringify(bt));
// wrong token path
await p.evaluate(()=>{localStorage.bms_token='wrong'});const code=await p.evaluate(async()=>(await fetch('/api/music/generate',{method:'POST',headers:{authorization:'Bearer wrong','content-type':'application/json'},body:'{}'})).status);ok('wrong token is refused',code===401,String(code));
// Auto Produce on top of the AI beat with a fake-mic take, then engineering report link
await click('nav-booth');await p.evaluate(()=>{document.getElementById('cin').value='0'});
const real=errs.filter(e=>!/401/.test(e));ok('no page errors (the deliberate 401 is ignored)',real.length===0,real.join('|'));
console.log(res.join('\n'));await b.close();srv.close();ace.close();process.exit(0);
