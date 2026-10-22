// TEST ENTRYPOINT ONLY. Production index.ts never imports this module.
import worker from '../../index';
import { AppError } from '../../lib/errors';
import { flushPaymentActivations, flushPaymentSettlements, paymentFollowupHealth, recoverHostedPayment, saveHostedCheckout } from '../../lib/payments';
import { rewardReferrer, reverseReferralReward } from '../../lib/referral';
import { ALERT_RULES, shouldAlert, markAlertSent } from '../../lib/errorlog';
import { runHourlyJobs } from '../../jobs/cron';
import { serveSitemap } from '../../lib/sitemap';
import type { Env } from '../../config';
import { enqueueMail, dispatchMail, openMail, outboxHealth, replayMail } from '../../lib/outbox';
import { acquireLease, releaseLease } from '../../lib/lease';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/__test/')) return worker.fetch(request, env, ctx);
    if (request.headers.get('x-internal-secret') !== env.INTERNAL_SECRET) return new Response(null, { status: 403 });
    const body = await request.json() as any;
    const json = (value: unknown) => Response.json(value);
    switch (url.pathname) {
      case '/__test/enqueue': return json({ id: await enqueueMail(env, body.message, body.options) });
      case '/__test/row': return json(await env.DB.prepare('SELECT * FROM email_outbox WHERE id=?').bind(body.id).first());
      case '/__test/open': {
        const row = await env.DB.prepare('SELECT payload FROM email_outbox WHERE id=?').bind(body.id).first<{ payload: string }>();
        return json(await openMail(env, row!.payload, body.id));
      }
      case '/__test/patch': {
        const allowed = new Set(['available_at','locked_until','lock_token','status','attempts','expires_at','payload']);
        const entries = Object.entries(body.patch).filter(([key]) => allowed.has(key));
        await env.DB.prepare(`UPDATE email_outbox SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).bind(...entries.map(([, value]) => value as any), body.id).run();
        return json({ ok: true });
      }
      case '/__test/user-patch': {
        await env.DB.prepare('UPDATE users SET email=COALESCE(?,email),deleted_at=? WHERE id=?').bind(body.email ?? null, body.deleted_at ?? null, body.id).run();
        return json({ ok: true });
      }
      case '/__test/dispatch': {
        const calls: { key: string | null; to: unknown }[] = [];
        const result = await dispatchMail({ ...env, RESEND_API_KEY: 'synthetic-provider' }, { id: body.id, limit: body.limit,
          fetcher: (async (_url, init) => {
            calls.push({ key: new Headers(init?.headers).get('Idempotency-Key'), to: JSON.parse(init?.body as string).to });
            if (body.networkError) throw new Error('PRIVATE PROVIDER BODY');
            if (body.delay) await new Promise((resolve) => setTimeout(resolve, body.delay));
            return new Response(body.responseBody ?? 'PRIVATE PROVIDER BODY', { status: body.status ?? 200 });
          }) as typeof fetch,
        });
        return json({ ...result, calls });
      }
      case '/__test/replay': return json({ ok: await replayMail(env, body.id) });
      case '/__test/followup-health': return json(await paymentFollowupHealth(env));
      case '/__test/health': return json(await outboxHealth(env));
      case '/__test/hosted-recover': { try { return json(await recoverHostedPayment({...env,PAYSTACK_MOCK:'0'},body.businessId,body.id,async()=>{
        if(body.unavailable) throw new Error('synthetic provider unavailable');
        return {success:body.success===true,terminalFailure:body.terminal===true,amountKobo:body.amount,email:null};
      })); } catch (e) { return Response.json({error:'synthetic recovery error'},{status:e instanceof AppError ? e.status : 500}); } }
      case '/__test/hosted-save': { try {
        await saveHostedCheckout(env,body.id,{url:body.url,mock:false,paystackReference:body.reference ?? null});
        return json({ok:true});
      } catch (e) { return Response.json({error:'synthetic checkout error'},{status:e instanceof AppError ? e.status : 500}); } }
      case '/__test/hosted-age': {
        await env.DB.prepare('UPDATE payment_checkouts SET created_at=? WHERE payment_id=?').bind(new Date(Date.now()-2*86400_000).toISOString(),body.id).run();
        return json({ok:true});
      }
      case '/__test/payment-state': {
        const payment = await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(body.id).first<any>();
        const activation = await env.DB.prepare('SELECT * FROM payment_activations WHERE payment_id=?').bind(body.id).first();
        const subscription = await env.DB.prepare('SELECT * FROM subscriptions WHERE business_id=? ORDER BY id DESC LIMIT 1').bind(payment.business_id).first();
        const addons = await env.DB.prepare('SELECT COUNT(*) AS n FROM vendor_addons WHERE payment_id=?').bind(body.id).first();
        const notices = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE event_key=?').bind(`payment.approved:${body.id}`).first();
        const mail = (await env.DB.prepare('SELECT id,status,payload FROM email_outbox WHERE user_id=(SELECT owner_user_id FROM businesses WHERE id=?)').bind(payment.business_id).all()).results;
        const addons_active = await env.DB.prepare("SELECT COUNT(*) AS n FROM vendor_addons WHERE payment_id=? AND status='active'").bind(body.id).first();
        const credit = await env.DB.prepare('SELECT * FROM payment_credit_holds WHERE payment_id=?').bind(body.id).first();
        const settlement = await env.DB.prepare('SELECT * FROM payment_settlements WHERE payment_id=?').bind(body.id).first();
        return json({ payment, activation, subscription, addons, notices, mail, credit, settlement, addons_active });
      }
      case '/__test/media-fault': {
        if (body.enabled) await env.DB.exec("CREATE TRIGGER synthetic_media_failure BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT,'synthetic media insert failure'); END;");
        else await env.DB.exec('DROP TRIGGER IF EXISTS synthetic_media_failure');
        return json({ ok: true });
      }
      case '/__test/media-fill': {
        await env.DB.prepare("UPDATE plans SET quota=json_set(quota,'$.max_storage_mb',1) WHERE slug='free'").run();
        await env.DB.prepare("INSERT INTO media(business_id,driver,storage_key,mime_type,extension,kind,size_bytes,visibility,status) VALUES(?,'d1','synthetic-fill','image/jpeg','jpg','image',?,'private','uploaded')").bind(body.businessId,1048576-body.remaining).run();
        return json({ ok: true });
      }
      case '/__test/media-limit-reset': {
        await env.DB.prepare("UPDATE plans SET quota=json_set(quota,'$.max_storage_mb',50) WHERE slug='free'").run();
        return json({ ok: true });
      }
      case '/__test/credit-set': {
        await env.DB.prepare('UPDATE users SET referral_credit_kobo=? WHERE id=?').bind(body.amount, body.userId).run();
        return json({ ok: true });
      }
      case '/__test/credit-info': {
        const user = await env.DB.prepare('SELECT referral_credit_kobo FROM users WHERE id=?').bind(body.userId).first();
        const payments = (await env.DB.prepare('SELECT * FROM payments WHERE business_id=? ORDER BY id').bind(body.businessId).all()).results;
        return json({ user, payments });
      }
      case '/__test/credit-fault': {
        if (!body.enabled) await env.DB.exec('DROP TRIGGER IF EXISTS synthetic_credit_failure');
        else if (body.mode === 'hold') await env.DB.exec("CREATE TRIGGER synthetic_credit_failure BEFORE INSERT ON payment_credit_holds BEGIN SELECT RAISE(ABORT,'synthetic credit failure'); END;");
        else await env.DB.exec("CREATE TRIGGER synthetic_credit_failure BEFORE INSERT ON notifications WHEN NEW.type IN ('payment.refunded','payment.rejected') BEGIN SELECT RAISE(ABORT,'synthetic settlement failure'); END;");
        return json({ ok: true });
      }
      case '/__test/payment-terminal': {
        await env.DB.prepare("UPDATE payments SET status='failed' WHERE id=? AND status='pending'").bind(body.id).run();
        return json({ ok: true });
      }
      case '/__test/payment-age': {
        await env.DB.prepare("UPDATE payments SET created_at=datetime('now','-3 days') WHERE id=?").bind(body.id).run();
        return json({ ok: true });
      }
      case '/__test/business-status': {
        if (!['pending_approval','suspended'].includes(body.status)) return new Response(null,{status:400});
        await env.DB.prepare('UPDATE businesses SET status=? WHERE id=?').bind(body.status,body.businessId).run();
        return json({ ok: true });
      }
      case '/__test/business-owner': {
        await env.DB.prepare('UPDATE businesses SET owner_user_id=? WHERE id=?').bind(body.userId, body.businessId).run();
        return json({ ok: true });
      }
      case '/__test/settlement-flush': return json({ processed: await flushPaymentSettlements({ ...env, MAIL_ENDPOINT: 'http://127.0.0.1:1' }, body.id) });
      case '/__test/followup-age': {
        await env.DB.prepare('UPDATE payment_activations SET created_at=? WHERE payment_id=?').bind(new Date(Date.now()-1_200_000).toISOString(), body.id).run();
        return json({ ok: true });
      }
      case '/__test/followup-alert': {
        const rule = ALERT_RULES.find((r) => r.key === 'payment_followup_backlog')!;
        const due = await shouldAlert(env, rule);
        if (body.mark) await markAlertSent(env, rule.key);
        return json({ due });
      }
      case '/__test/referral-notice-fault': {
        if (body.enabled) await env.DB.exec("CREATE TRIGGER synthetic_referral_failure BEFORE INSERT ON notifications WHEN NEW.type LIKE 'referral.%' BEGIN SELECT RAISE(ABORT,'synthetic referral receipt failure'); END;");
        else await env.DB.exec('DROP TRIGGER IF EXISTS synthetic_referral_failure');
        return json({ ok: true });
      }
      case '/__test/referral-notices': return json((await env.DB.prepare("SELECT type,data FROM notifications WHERE user_id=? AND type LIKE 'referral.%'").bind(body.userId).all()).results);
      case '/__test/plan-price': {
        await env.DB.prepare("UPDATE plans SET price=? WHERE slug='starter'").bind(body.price).run();
        return json({ ok: true });
      }
      case '/__test/payment-fault': {
        if (body.enabled) await env.DB.exec(`CREATE TRIGGER synthetic_receipt_failure BEFORE INSERT ON notifications WHEN NEW.type='payment.approved' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END;`);
        else await env.DB.exec('DROP TRIGGER IF EXISTS synthetic_receipt_failure');
        return json({ ok: true });
      }
      case '/__test/payment-commit-only': {
        await env.DB.prepare("UPDATE payments SET status='approved',verified_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(), body.id).run();
        return json({ ok: true });
      }
      case '/__test/payment-flush': return json({ processed: await flushPaymentActivations({ ...env, MAIL_ENDPOINT: body.unconfigured ? '' : 'http://127.0.0.1:1', RESEND_API_KEY: '' }, body.id) });
      case '/__test/payment-submitted': {
        await env.DB.prepare("UPDATE payments SET status='submitted' WHERE id=? AND status='pending'").bind(body.id).run();
        return json({ ok: true });
      }
      case '/__test/referral': {
        if (body.reverse) await reverseReferralReward(env, body.businessId, body.price);
        else await rewardReferrer(env, body.businessId, body.price);
        return json(await env.DB.prepare('SELECT referral_credit_kobo FROM users WHERE id=?').bind(body.userId).first());
      }
      case '/__test/referral-refund': {
        await env.DB.prepare("UPDATE payments SET status='refunded' WHERE id=?").bind(body.id).run();
        return json({ ok: true });
      }
      case '/__test/hourly': {
        const db = body.fail ? new Proxy(env.DB, { get(target, key) {
          if (key === 'prepare') return (sql: string) => { if (sql.includes("UPDATE listings SET status = 'published'")) throw new Error('Sensitive test failure'); return target.prepare(sql); };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        } }) : env.DB;
        try { return json(await runHourlyJobs({ ...env, DB: db })); }
        catch { return json({ failed: true }); }
      }
      case '/__test/sitemap-seed': {
        const biz = await env.DB.prepare(`INSERT INTO businesses (owner_user_id,name,slug,status) VALUES ((SELECT id FROM users LIMIT 1),'Sitemap Store','sitemap-store','active')`).run();
        const businessId = biz.meta.last_row_id;
        await env.DB.prepare(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x<1005)
          INSERT INTO listings (business_id,item_type_id,name,slug,status) SELECT ?,(SELECT id FROM item_types WHERE slug='product'),'Page Item '||x,'page-item-'||x,'published' FROM seq`).bind(businessId).run();
        return json({ businessId });
      }
      case '/__test/sitemap': {
        const response = await serveSitemap(env, body.part, body.fail ? async () => { throw new Error('Synthetic inventory outage'); } : undefined);
        return json({ status: response.status, headers: Object.fromEntries(response.headers), xml: await response.text() });
      }
      case '/__test/snapshot-age': {
        await env.DB.prepare('UPDATE public_snapshots SET updated_at=0').run();
        const name = `sitemap:${new URL(env.APP_URL).origin}:${body.part.kind}:${body.part.page}`;
        await caches.default.delete(new Request(`https://sitemap-cache.cybershop.invalid/${encodeURIComponent(name)}`));
        return json({ ok: true });
      }
      case '/__test/business-delete': {
        await env.DB.prepare('UPDATE businesses SET deleted_at=? WHERE id=?').bind(new Date().toISOString(), body.id).run();
        return json({ ok: true });
      }
      case '/__test/lease': return json({ owner: await acquireLease(env, body.name, body.ttl) });
      case '/__test/release': return json({ ok: await releaseLease(env, body.name, body.owner) });
      case '/__test/lease-expire': {
        await env.DB.prepare('UPDATE job_leases SET expires_at=0 WHERE name=?').bind(body.name).run();
        return json({ ok: true });
      }
      default: return new Response(null, { status: 404 });
    }
  },
};
