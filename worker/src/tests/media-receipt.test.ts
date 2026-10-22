import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setupIntegration, api } from './harness';

setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts' });
let php: ChildProcess | undefined;
let directory = '';
let origin = '';
let serial = 0;
const jpeg = readFileSync(path.resolve('../scripts/seed-demo/logo.jpg'));
const call = async (name: string, body: unknown) => {
  const r = await api(`/__test/${name}`, { method: 'POST', body });
  expect(r.status, r.text).toBe(200); return r.json;
};
beforeAll(async () => {
  mkdirSync('.vitest-state', { recursive: true });
  directory = mkdtempSync(path.resolve('.vitest-state/php-'));
  copyFileSync('../media-gateway/upload.php', path.join(directory,'upload.php'));
  writeFileSync(path.join(directory,'config.php'), `<?php
    const GATEWAY_SECRET='test-gateway-secret-0123456789abcdef';
    const MEDIA_ROOT=__DIR__;
    const ALLOWED_MIMES=['image/jpeg','image/png','image/webp'];
    const MAX_UPLOAD_BYTES=8388608;
    const ALLOWED_ORIGINS=['http://localhost:3000'];`);
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0,'127.0.0.1',resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
  // Native PHP+GD in CI. Local WASM fallback is explicit, not a skipped test.
  const command: string[] = process.env.GATEWAY_TEST_PHP ? JSON.parse(process.env.GATEWAY_TEST_PHP) : ['php'];
  php = spawn(command[0]!,[...command.slice(1),'-S',`127.0.0.1:${port}`,'-t',directory],{ detached:true,stdio:'ignore' });
  let spawnError: Error | undefined;
  php.on('error',(error) => { spawnError=error; });
  for (let n=0;n<200;n++) {
    if (spawnError) throw spawnError;
    if (php.exitCode!==null) throw new Error('Test PHP server exited before readiness');
    try { const r=await fetch(origin+'/upload.php'); await r.body?.cancel(); return; } catch { /* owned startup */ }
    await new Promise((resolve) => setTimeout(resolve,100));
  }
  throw new Error('Test PHP server did not start');
},30000);
afterAll(async () => {
  if (php?.pid) {
    try { process.kill(-php.pid,'SIGKILL'); } catch { /* already exited */ }
    if (php.exitCode===null && php.signalCode===null) await new Promise((resolve) => php!.once('exit',resolve));
  }
  if (directory) rmSync(directory,{recursive:true,force:true});
});
async function vendor() {
  const r=await api('/api/auth/register',{method:'POST',body:{role:'vendor',name:'Receipt Vendor',email:`receipt-${++serial}@test.ng`,password:'Passw0rd123',business_name:`Receipt Shop ${serial}`,category_slug:'fashion',whatsapp_number:'08031111111'}});
  expect(r.status,r.text).toBe(200);
  return { cookie:r.cookie!, businessId:r.json.user.business_id };
}
async function upload(v: { cookie: string }, bytes=jpeg) {
  const r=await api('/api/vendor/media/token',{method:'POST',cookie:v.cookie,body:{kind:'catalogue'}});
  expect(r.status,r.text).toBe(200);
  const key=r.json.pathPrefix+randomUUID()+'.jpg';
  const form=new FormData(); form.append('token',r.json.token); form.append('key',key); form.append('file',new File([bytes],'photo.jpg',{type:'image/jpeg'}));
  const response=await fetch(origin+'/upload.php',{method:'POST',body:form,headers:{Origin:'http://localhost:3000'}});
  const json=await response.json() as any;
  return { status:response.status, json, token:r.json.token, key };
}
const finish=(v:{cookie:string},u:{token:string;json:any},extra={})=>api('/api/vendor/media/finalize',{method:'POST',cookie:v.cookie,body:{token:u.token,receipt:u.json.receipt,...extra}});

describe('actual PHP upload → signed receipt → real Worker/D1 finalize',()=>{
  it('registers server-normalized bytes/checksum and ignores forged browser metadata',async()=>{
    const v=await vendor();const u=await upload(v);
    expect(u.status,JSON.stringify(u.json)).toBe(200);
    const stored=await fetch(origin+'/'+u.key); const bytes=Buffer.from(await stored.arrayBuffer());
    const result=await finish(v,u,{size:1,mime:'application/x-php',storage_key:'elsewhere.php',width:99999});
    expect(result.status,result.text).toBe(200);
    const library=await api('/api/vendor/media',{cookie:v.cookie});
    const row=library.json.media.find((m:any)=>m.id===result.json.media.id);
    expect(row.size_bytes).toBe(bytes.length);expect(row.mime_type).toBe('image/jpeg');expect(row.storage_key).toBe(u.key);
    const receipt=JSON.parse(Buffer.from(u.json.receipt.split('.')[0],'base64url').toString());
    expect(receipt.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(receipt.width).toBeGreaterThan(0);expect(receipt.height).toBeGreaterThan(0);
  });
  it('rejects forged receipts without consuming the legitimate token',async()=>{
    const v=await vendor();const u=await upload(v);
    const forged=u.json.receipt.slice(0,-1)+(u.json.receipt.endsWith('a')?'b':'a');
    expect((await finish(v,u,{receipt:forged})).status).toBe(403);
    expect((await finish(v,u)).status).toBe(200);
  });
  it('binds receipts to both the upload session and the authenticated business',async()=>{
    const v=await vendor();const other=await vendor();const first=await upload(v);const second=await upload(v);
    expect((await finish(v,first,{receipt:second.json.receipt})).status).toBe(400);
    expect((await finish(other,first)).status).toBe(403);
    expect((await finish(v,first)).status).toBe(200);
    expect((await finish(v,second)).status).toBe(200);
  });
  it('rejects image headers that do not decode, before writing a file',async()=>{
    const v=await vendor();const u=await upload(v,Buffer.from([0xff,0xd8,0xff,0x00]));
    expect(u.status).toBe(415);expect(u.json.receipt).toBeUndefined();
    expect((await fetch(origin+'/'+u.key)).status).toBe(404);
  });
  it('commits one registration for concurrent finalization',async()=>{
    const v=await vendor();const u=await upload(v);
    const results=await Promise.all([finish(v,u),finish(v,u)]);
    expect(results.map((r)=>r.status).sort()).toEqual([200,400]);
    expect((await api('/api/vendor/media',{cookie:v.cookie})).json.media).toHaveLength(1);
  });
  it('rolls back token consumption if media insertion fails, allowing a safe retry',async()=>{
    const v=await vendor();const u=await upload(v);
    await call('media-fault',{enabled:true});
    try {expect((await finish(v,u)).status).toBe(500);} finally {await call('media-fault',{enabled:false});}
    expect((await finish(v,u)).status).toBe(200);
    expect((await api('/api/vendor/media',{cookie:v.cookie})).json.media).toHaveLength(1);
  });
  it('serializes storage accounting for competing signed files without burning the losing token',async()=>{
    const v=await vendor();const a=await upload(v);const b=await upload(v);
    expect(a.status).toBe(200);expect(b.status).toBe(200);
    await call('media-fill',{businessId:v.businessId,remaining:a.json.size_bytes});
    try {
      const results=await Promise.all([finish(v,a),finish(v,b)]);
      expect(results.map((r)=>r.status).sort()).toEqual([200,403]);
      await call('media-limit-reset',{});
      expect((await finish(v,results[0].status===403?a:b)).status).toBe(200);
    } finally {await call('media-limit-reset',{});}
  });
});
