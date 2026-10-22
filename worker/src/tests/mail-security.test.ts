import { describe, expect, it } from 'vitest';
import { escapeMailHtml, mailHtml } from '../lib/mail';
import { sealMail, openMail } from '../lib/outbox';
import { productionEnv } from './fixtures/env';

const message = { to: 'synthetic@test.ng', subject: 'Reset', text: 'private-token' };
describe('mail template and encryption boundaries', () => {
  it('escapes user-controlled text and CTA attributes without stripping readable content', () => {
    const html = mailHtml('<img src=x onerror=alert(1)>', escapeMailHtml('Name <script> & "x"'), { label: '<Confirm>', url: 'https://shop.test/verify?a="x"&b=1' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Name &lt;script&gt; &amp; &quot;x&quot;');
    expect(html).toContain('href="https://shop.test/verify?a=&quot;x&quot;&amp;b=1"');
    expect(html).toContain('&lt;Confirm&gt;</a>');
  });
  it('requires a separate key on hosted environments', async () => {
    await expect(sealMail(productionEnv({ MAIL_OUTBOX_KEY: undefined }), message, 'intent')).rejects.toThrow('encryption key');
    await expect(sealMail(productionEnv({ APP_ENV: 'staging', MAIL_OUTBOX_KEY: undefined }), message, 'intent')).rejects.toThrow('encryption key');
  });
  it('keeps queued ciphertext independent of session-secret rotation', async () => {
    const env = productionEnv();
    const sealed = await sealMail(env, message, 'intent');
    expect(await openMail({ ...env, AUTH_SECRET: 'rotated-session-key'.repeat(4) }, sealed, 'intent')).toEqual(message);
    await expect(openMail({ ...env, MAIL_OUTBOX_KEY: 'rotated-outbox-key'.repeat(4) }, sealed, 'intent')).rejects.toThrow();
  });
  it('allows the documented local-only auth-key fallback', async () => {
    const env = productionEnv({ APP_ENV: 'development', APP_URL: 'http://localhost:3000', SESSION_SECURE: '0', MAIL_OUTBOX_KEY: undefined });
    const sealed = await sealMail(env, message, 'local-intent');
    expect(await openMail(env, sealed, 'local-intent')).toEqual(message);
  });
});
