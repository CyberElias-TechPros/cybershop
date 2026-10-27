import { describe,it,expect } from 'vitest';
import { api,setupIntegration } from './harness';
setupIntegration({main:'src/tests/fixtures/operations-worker.ts'});
let serial=0;
async function vendor() {
  const r=await api('/api/auth/register',{method:'POST',body:{role:'vendor',name:'Recovery Vendor',email:`hosted-${++serial}@test.ng`,password:'Passw0rd123',business_name:`Hosted Shop ${serial}`,category_slug:'fashion',whatsapp_number:'08031111111'}});
  expect(r.status,r.text).toBe(200); return {cookie:r.cookie!,businessId:r.json.user.business_id,userId:r.json.user.id};
}
const call=async(name:string,body:unknown)=>api(`/__test/${name}`,{method:'POST',body});
async function pending(v:Awaited<ReturnType<typeof vendor>>) {
  await call('credit-set',{userId:v.userId,amount:300_000});
  const r=await api('/api/vendor/payment-intent',{method:'POST',cookie:v.cookie,body:{plan_slug:'starter',method:'paystack'}});
  expect(r.status,r.text).toBe(200); return r.json.payment;
}
const recover=(v:Awaited<ReturnType<typeof vendor>>,id:number)=>api(`/api/vendor/payments/${id}/recover`,{method:'POST',cookie:v.cookie,body:{}});
const verify=(v:Awaited<ReturnType<typeof vendor>>,p:any,extra={})=>call('hosted-recover',{id:p.id,businessId:v.businessId,amount:p.amount,...extra});
describe('safe hosted payment recovery on real D1',()=>{
  it('resumes the same saved mock checkout without creating/approving another payment',async()=>{
    const v=await vendor();const p=await pending(v);const r=await recover(v,p.id);
    expect(r.status,r.text).toBe(200);expect(r.json.status).toBe('pending');expect(r.json.checkout_url).toContain('/paystack/mock?ref='+p.reference);
    const info=(await call('credit-info',v)).json;expect(info.payments).toHaveLength(1);expect(info.user.referral_credit_kobo).toBe(0);
    expect((await api(`/api/vendor/payments/${p.id}/recover`,{method:'POST',body:{}})).status).toBe(401);
    expect((await recover(await vendor(),p.id)).status).toBe(404);
  });
  it('concurrent authoritative success checks grant one entitlement/receipt',async()=>{
    const v=await vendor();const p=await pending(v);
    const responses=await Promise.all([verify(v,p,{success:true}),verify(v,p,{success:true})]);
    expect(responses.every((r)=>r.status===200 && r.json.status==='approved')).toBe(true);
    const state=(await call('payment-state',{id:p.id})).json;expect(state.notices.n).toBe(1);expect(state.activation.payment_id).toBe(p.id);
    expect((await recover(v,p.id)).json.checkout_url).toBeNull();
  });
  it('leaves the intent and credit hold intact when verification is unavailable',async()=>{
    const v=await vendor();const p=await pending(v);expect((await verify(v,p,{unavailable:true})).status).toBe(503);
    const state=(await call('payment-state',{id:p.id})).json;expect(state.payment.status).toBe('pending');expect(state.credit.returned_at).toBeNull();
    expect((await call('credit-info',v)).json.user.referral_credit_kobo).toBe(0);
  });
  it('does not release credit or offer a link for an authoritative amount mismatch',async()=>{
    const v=await vendor();const p=await pending(v);const r=await verify(v,p,{success:true,amount:p.amount+1});
    expect(r.json.status).toBe('pending');expect(r.json.needs_review).toBe(true);expect(r.json.checkout_url).toBeNull();
    expect((await call('payment-state',{id:p.id})).json.credit.returned_at).toBeNull();
  });
  it('returns held credit once only after an authoritative terminal result',async()=>{
    const v=await vendor();const p=await pending(v);await Promise.all([verify(v,p,{terminal:true}),verify(v,p,{terminal:true})]);
    expect((await call('credit-info',v)).json.user.referral_credit_kobo).toBe(300_000);
    expect((await call('payment-state',{id:p.id})).json.payment.status).toBe('failed');
  });
  it('never initializes a replacement for missing or over-age saved links',async()=>{
    const v=await vendor();const p=await pending(v);await call('hosted-age',{id:p.id});
    const r=await recover(v,p.id);expect(r.json.checkout_url).toBeNull();expect(r.json.message).toContain('contact support');
    expect((await call('credit-info',v)).json.payments).toHaveLength(1);
  });
  it('refuses unsafe saved checkout URLs before they can reach a browser',async()=>{
    const v=await vendor();const p=await pending(v);
    for(const url of ['https://checkout.paystack.com.evil.test/x','javascript:alert(1)','https://user@checkout.paystack.com/x','https://checkout.paystack.com/#intent'])
      expect((await call('hosted-save',{id:p.id,url})).status).toBe(502);
    expect((await recover(v,p.id)).json.checkout_url).toContain('/paystack/mock');
  });
});
