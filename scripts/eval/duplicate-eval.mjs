#!/usr/bin/env node
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir, cpus, totalmem } from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { fingerprintText, estimate } from '../../backend/dist/modules/duplicates/minhash.js';
import { sha256File } from '../../backend/dist/modules/duplicates/duplicate.service.js';
import { TextWorkerPool } from '../../backend/dist/modules/duplicates/text-worker-pool.js';
const percentile = (values, q) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.ceil(values.length*q)-1)];
const machine = { node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() };
function pdfWithPadding(paddingBytes) {
  const line = 'cloud documents course learning materials';
  const stream = `BT /F1 8 Tf 10 740 Td ${Array.from({ length: 12 }, (_, i) => `${i ? '0 -12 Td' : ''} (${line}) Tj`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({length:100},()=> '3 0 R').join(' ')}] /Count 100 >>`, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, `<< /Length ${paddingBytes} >>\nstream\n${' '.repeat(paddingBytes)}\nendstream`];
  let source = '%PDF-1.7\n'; const offsets = [0]; for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(source));source+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(source);source+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
if (process.argv.includes('--benchmark')) {
  const dir = await mkdtemp(path.join(tmpdir(),'duplicate-bench-'));
  try {
    const file = path.join(dir,'50mb.pdf'); await writeFile(file,Buffer.alloc(50*1024*1024,32));
    const hashes=[];for(let i=0;i<10;i++){const start=performance.now();await sha256File(file);hashes.push(performance.now()-start);}
    const text = Array.from({length:20000},(_,i)=>`word${i}`).join(' ');const minhash=[];for(let i=0;i<10;i++){const start=performance.now();fingerprintText(text);minhash.push(performance.now()-start);}
    const require = createRequire(new URL('../../backend/package.json',import.meta.url));
    const { ZipFile } = require('yazl');
    async function office(parts) {const zip=new ZipFile();for(const [name,body] of parts)zip.addBuffer(Buffer.from(body),name,{compress:false});const chunks=[];const reading=(async()=>{for await(const chunk of zip.outputStream)chunks.push(Buffer.from(chunk));})();zip.end();await reading;return Buffer.concat(chunks);}
    const cases = [5,10,20].map(mib=>({name:`PDF ${mib} MiB / 100 text pages`,type:'PDF',bytes:pdfWithPadding(mib*1024*1024-12000)}));
    const docxXml=`<w:document><w:p><w:t>${Array.from({length:1000},(_,i)=>`word${i}`).join(' ')}</w:t></w:p>${' '.repeat(10*1024*1024-10000)}</w:document>`;
    cases.push({name:'DOCX 10 MiB uncompressed XML',type:'DOCX',bytes:await office([['[Content_Types].xml','<Types/>'],['word/document.xml',docxXml]])});
    cases.push({name:'PPTX 100 slides',type:'PPTX',bytes:await office([['[Content_Types].xml','<Types/>'],...Array.from({length:100},(_,i)=>[`ppt/slides/slide${i+1}.xml`,`<a:p><a:t>${Array.from({length:100},(_,n)=>`slide${i}word${n}`).join(' ')}</a:t></a:p>`])])});
    const pool=new TextWorkerPool(); const extractions=[];
    for(const item of cases){const file=path.join(dir,`extract.${item.type.toLowerCase()}`);await writeFile(file,item.bytes);let peak=process.memoryUsage().rss;const base=peak;const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},100);const lag=monitorEventLoopDelay({resolution:10});lag.enable();const start=performance.now();let result;try{result=await pool.analyze(file,item.type,item.bytes.length);}finally{clearInterval(timer);lag.disable();}extractions.push({fixture:item.name,bytes:item.bytes.length,durationMs:performance.now()-start,rssIncreaseBytes:Math.max(0,peak-base),eventLoopP99Ms:lag.percentile(99)/1e6,status:result.status,reason:result.reason});}
    const {tsImport}=await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
    const {createTestContext,registerUser,uploadRequest,CSRF}=await tsImport(fileURLToPath(new URL('../../backend/test/integration/context.ts',import.meta.url)),import.meta.url);
    const {TEST_ENV}=await tsImport(fileURLToPath(new URL('../../backend/test/helpers/config.ts',import.meta.url)),import.meta.url);
    process.env.AWS_ACCESS_KEY_ID=TEST_ENV.AWS_ACCESS_KEY_ID;process.env.AWS_SECRET_ACCESS_KEY=TEST_ENV.AWS_SECRET_ACCESS_KEY;
    const uploadBench=[];
    for(const mode of ['off','warn']){const context=await createTestContext({DUPLICATE_MODE:mode});let user;const timings=[];const ids=[];try{user=await registerUser(context.app);for(let n=0;n<5;n++){const start=performance.now();const response=await uploadRequest(user,{title:`benchmark ${mode} ${n}`,visibility:'PRIVATE',file:cases[1].bytes,filename:'benchmark.pdf'});timings.push(performance.now()-start);if(response.status!==201)throw new Error(`Upload benchmark failed: ${response.status}`);ids.push(response.body.data.id);}}finally{for(const id of ids)await user.agent.delete(`/api/documents/${id}`).set(CSRF);if(user)await context.prisma.user.delete({where:{id:user.id}});await context.close();}uploadBench.push({mode,bytes:cases[1].bytes.length,rounds:5,p95Ms:percentile(timings,.95),medianMs:percentile(timings,.5)});}
    console.log(JSON.stringify({machine,fixtures:'synthetic text PDF with unused padding stream; uncompressed DOCX with XML padding; 100 text PPTX slides',BENCH_A1:{words:20000,rounds:10,minhashMedianMs:percentile(minhash,.5),sha50MiBMedianMs:percentile(hashes,.5)},BENCH_A2:extractions,BENCH_A3:uploadBench},null,2));

  }finally{await rm(dir,{recursive:true,force:true});}
} else if (process.argv[2]) {
  const datasetPath=path.resolve(process.argv[2]);const pairs=JSON.parse(await readFile(datasetPath,'utf8')); const datasetDir=path.dirname(datasetPath);const pool=new TextWorkerPool();const cache=new Map();
  async function analyze(file){if(!cache.has(file)){const size=(await stat(file)).size;cache.set(file,await pool.analyze(file,path.extname(file).slice(1).toUpperCase(),size));}return cache.get(file);}
  const scores=[];for(const pair of pairs){const duplicate=typeof pair.duplicate==='boolean'?pair.duplicate:['SAME','NEAR'].includes(pair.label);if(typeof pair.duplicate!=='boolean'&&!['SAME','NEAR','DIFFERENT'].includes(pair.label))throw new Error('Expected {left,right,duplicate:boolean} or label SAME/NEAR/DIFFERENT');const a=await analyze(path.resolve(datasetDir,pair.left)),b=await analyze(path.resolve(datasetDir,pair.right));scores.push({left:pair.left,right:pair.right,label:pair.label,duplicate,score:a.minhash&&b.minhash?estimate(a.minhash,b.minhash):null});}
  const report=[];for(const threshold of [.4,.5,.6,.7,.8,.9]){let tp=0,fp=0,fn=0,skipped=0;for(const pair of scores){if(pair.score===null){skipped++;continue;}const match=pair.score>=threshold;if(match&&pair.duplicate)tp++;if(match&&!pair.duplicate)fp++;if(!match&&pair.duplicate)fn++;}report.push({threshold,tp,fp,fn,skipped,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null});}
  console.log(JSON.stringify({machine,pairs:pairs.length,scores,report},null,2));
} else console.log('DUP-EVAL: chưa có dữ liệu gắn nhãn. Usage: node scripts/eval/duplicate-eval.mjs dataset.json | --benchmark. Dataset: [{left,right,duplicate:boolean}]. Build backend first.');
