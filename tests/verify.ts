/**
 * tests/verify.ts — the two suites BUILD_PLAN 20 says must never go red: the WhatsApp
 * deep-link builder (a mangled link is an invisible lost sale) and the field-registry
 * validation + authorization rules. Pure functions, so `npm run verify` needs no
 * database and no browser. Vitest/Playwright arrive at M2/M6; this file is the
 * executable core of both.
 */
import assert from "node:assert/strict";
import {
  buildWaLink, normalizeWhatsapp, renderTemplate, lintTemplate, resolveNumber, DEFAULT_TEMPLATES, MESSAGE_LIMIT,
} from "@/core/whatsapp";
import { validateValues, projectValues, messageLines, type FieldDef } from "@/core/fields";
import { ensureUniqueSlug, isValidSlug, sanitizeHtml, htmlToText, formatMoney, parseMoney, truncate } from "@/lib/util";

type Case = { name: string; run: () => void | Promise<void> };
const cases: Case[] = [];
const test = (name: string, run: () => void | Promise<void>) => cases.push({ name, run });

/* ---------------------------- E.164 (the number a vendor types by hand) ---------------------------- */
test("e164: every format a vendor actually types resolves to one number", () => {
  for (const raw of ["0803 123 4567", "+234 803 123 4567", "234-803-123-4567", "002348031234567", "2348031234567", "+2348031234567", "  +234 (0)803 123 4567  "]) {
    const r = normalizeWhatsapp(raw);
    assert.ok(r.ok, `"${raw}" rejected: ${"reason" in r ? r.reason : ""}`);
    assert.equal((r as { e164: string }).e164, "+2348031234567", `wrong normalisation for "${raw}"`);
  }
});

test("e164: junk is refused with actionable copy, never coerced", () => {
  for (const bad of ["", "   ", "not-a-number", "+234", "12345", "080312a4567!!"]) {
    const r = normalizeWhatsapp(bad);
    assert.equal(r.ok, false, `accepted garbage: "${bad}"`);
    assert.ok("reason" in r && r.reason.length > 10, "rejection must explain itself");
  }
});

test("e164: non-Nigerian numbers still work (the platform is not NG-only)", () => {
  const r = normalizeWhatsapp("+44 7700 900123", "234");
  assert.ok(r.ok);
  assert.equal((r as { e164: string }).e164, "+447700900123");
});

/* ---------------------------- deep link ---------------------------- */
test("buildWaLink: & ? = # in the message cannot truncate it", () => {
  const { url } = buildWaLink("+2348031234567", "Buy A & B? price=₦4,500 #tag");
  assert.equal(new URL(url).searchParams.get("text"), "Buy A & B? price=₦4,500 #tag");
  assert.ok(!url.includes("&price="), "& leaked into the query string - encodeURI was used instead of encodeURIComponent");
  assert.ok(url.startsWith("https://wa.me/2348031234567?text="));
});

test("buildWaLink: newlines survive as %0A so the message reads like a message", () => {
  const { url, text } = buildWaLink("+2348031234567", "line one\nline two");
  assert.equal(text, "line one\nline two");
  assert.match(url, /line%20one%0Aline%20two/);
});

test("buildWaLink: emoji and accents are encoded, not mangled", () => {
  const { url } = buildWaLink("+2348031234567", "Adire àwòrán 👜");
  assert.equal(new URL(url).searchParams.get("text"), "Adire àwòrán 👜");
});

test("buildWaLink: over-long messages are clamped, never dropped", () => {
  const { url, text, truncated } = buildWaLink("+2348031234567", "x".repeat(MESSAGE_LIMIT * 3));
  assert.equal(truncated, true);
  assert.ok(text.length <= MESSAGE_LIMIT + 2, `clamp failed (${text.length})`);
  assert.equal(new URL(url).searchParams.get("text"), text);
});

test("buildWaLink: an invalid number throws instead of producing a dead link", () => {
  assert.throws(() => buildWaLink("080", "hi"));
});

/* ---------------------------- templates (plan.md 62) ---------------------------- */
const ctx = {
  businessName: "Amara Fashion",
  itemName: "Ankara Maxi Dress",
  price: "85000",
  currency: "NGN",
  quantity: 2,
  variant: "Colour: Rust / Size L",
  sku: "AMD-001",
  itemUrl: "https://cybershop.test/business/amara-fashion/product/ankara-maxi-dress",
  fieldLines: ["Material: 100% cotton Ankara", "Warranty: free fitting adjustment"],
  offerLine: "Early-cut price before October (10% off)",
};

test("template: retail enquiry carries name, price, quantity, option, sku, link and custom fields", () => {
  const out = renderTemplate(DEFAULT_TEMPLATES.purchase_enquiry!, ctx);
  for (const needle of ["Amara Fashion", "Ankara Maxi Dress", "₦85,000", "Quantity: 2", "Rust", "AMD-001", "cybershop.test/business", "100% cotton Ankara"]) {
    assert.ok(out.includes(needle), `missing "${needle}" in:\n${out}`);
  }
  assert.ok(!out.includes("{{"), "an unrendered variable reached the buyer");
});

test("template: an empty variable collapses its whole line; a filled one stays", () => {
  const out = renderTemplate("Hello {{business_name}}\n{{totally_unknown}}\nItem: {{item_name}}\n{{sku}}", ctx);
  assert.equal(out, "Hello Amara Fashion\nItem: Ankara Maxi Dress\nSKU: AMD-001");
  const noSku = renderTemplate("Hello {{business_name}}\n{{totally_unknown}}\nItem: {{item_name}}\n{{sku}}", { ...ctx, sku: null });
  assert.equal(noSku, "Hello Amara Fashion\nItem: Ankara Maxi Dress");
});

test("template: a missing price hides the line instead of printing null", () => {
  const out = renderTemplate(DEFAULT_TEMPLATES.purchase_enquiry!, { ...ctx, price: null });
  assert.ok(!/null|undefined/.test(out), out);
});

test("template: cart lines compose into one enquiry (plan.md 30)", () => {
  const out = renderTemplate(DEFAULT_TEMPLATES.cart!, {
    businessName: "Tech Hub",
    cartLines: [{ name: "HP Laptop", qty: 1, price: "₦450,000" }, { name: "Mouse", qty: 2, price: "₦8,000" }],
    totalLine: "₦466,000",
  });
  assert.match(out, /1\. HP Laptop × 1/);
  assert.match(out, /2\. Mouse × 2 \(₦8,000\)/);
  assert.match(out, /Estimated total: ₦466,000/);
});

test("template lint: admin typos are caught at save time", () => {
  assert.deepEqual(lintTemplate("Hi {{business_name}} {{pice}}"), ["pice"]);
  assert.deepEqual(lintTemplate("Hi {{business_name}} {{field:brand}}"), []);
});

/* ---------------------------- routing (plan.md 63) ---------------------------- */
const numbers = [
  { id: "n1", e164: "+2348031234567", label: "Sales", isDefault: true, isActive: true },
  { id: "n2", e164: "+2348035550011", label: "Admissions", isDefault: false, isActive: true },
  { id: "n3", e164: "+2348035550022", label: "Old", isDefault: false, isActive: false },
];

test("routing: per-item number beats a rule, rule beats default", () => {
  const rules = [{ matchType: "catalogue_type" as const, matchRef: "course", whatsappNumberId: "n2", priority: 10 }];
  assert.equal(resolveNumber({ id: "i1", catalogueTypeId: "course" }, numbers, rules)!.id, "n2");
  assert.equal(resolveNumber({ id: "i1", catalogueTypeId: "course", whatsappNumberId: "n3" }, numbers, rules)!.id, "n2",
    "an inactive per-item number must fall through, never be used");
  assert.equal(resolveNumber({ id: "i1", catalogueTypeId: "product" }, numbers, rules)!.id, "n1");
});

test("routing: a plan downgrade disables a number without stranding the buyer", () => {
  const downgraded = numbers.map((n) => ({ ...n, isActive: n.id === "n1" }));
  const r = resolveNumber({ id: "i1", catalogueTypeId: "course" }, downgraded,
    [{ matchType: "catalogue_type", matchRef: "course", whatsappNumberId: "n2", priority: 1 }]);
  assert.equal(r!.id, "n1");
});

test("routing: no active number yields null so the UI can say so honestly", () => {
  assert.equal(resolveNumber({ id: "i1" }, numbers.map((n) => ({ ...n, isActive: false })), []), null);
});

/* ---------------------------- field registry (the engine) ---------------------------- */
const def = (over: Partial<FieldDef>): FieldDef => ({
  id: `fd-${over.key ?? "x"}`, key: "x", label: "Label", type: "text", helpText: null, isRequired: false,
  isPublic: true, isFilterable: false, isSearchable: false, placeholder: null,
  config: {}, validation: {}, ...over,
});

test("fields: required blocks a save with a per-field message", () => {
  const { errors } = validateValues([def({ key: "title", label: "Course title", isRequired: true })], { title: "  " });
  assert.equal(errors?.title, "Course title is required");
});

test("fields: unknown keys are REJECTED (no EAV side-channel for price/is_featured)", () => {
  const { errors } = validateValues([def({ key: "brand" })], { brand: "Acme", is_featured: true, price: "1" });
  assert.ok(errors?.is_featured && errors?.price, "smuggled keys must not pass");
});

test("fields: select is checked against the option list", () => {
  const d = def({ key: "size", label: "Size", type: "select", options: [{ value: "m", label: "M" }, { value: "l", label: "L" }] });
  assert.equal(validateValues([d], { size: "xxl" }).errors?.size, "Size: choose one of the listed options");
  assert.equal(validateValues([d], { size: "l" }).errors, null);
});

test("fields: numbers honour bounds and refuse words", () => {
  const d = def({ key: "beds", label: "Bedrooms", type: "number", validation: { min: 0, max: 50 } });
  assert.ok(validateValues([d], { beds: "99" }).errors?.beds);
  assert.ok(validateValues([d], { beds: "two" }).errors?.beds);
  assert.equal(validateValues([d], { beds: "3" }).errors, null);
});

test("fields: currency is non-negative and tolerates thousands separators", () => {
  const d = def({ key: "deposit", label: "Deposit", type: "currency" });
  assert.ok(validateValues([d], { deposit: "-5" }).errors?.deposit);
  const good = validateValues([d], { deposit: "1,250.50" });
  assert.equal(good.errors, null);
  assert.equal(good.values.deposit.value, 1250.5);
});

test("fields: dates must be ISO and honour an upper bound", () => {
  const d = def({ key: "start", label: "Start date", type: "date", validation: { before: "2026-12-31" } });
  assert.ok(validateValues([d], { start: "5/6/2026" }).errors?.start);
  assert.ok(validateValues([d], { start: "2027-05-01" }).errors?.start);
  assert.equal(validateValues([d], { start: "2026-10-05" }).errors, null);
});

test("fields: multiselect refuses unlisted values and enforces a max", () => {
  const d = def({
    key: "features", label: "Features", type: "multiselect",
    options: [{ value: "parking", label: "Parking" }, { value: "pool", label: "Pool" }], validation: { max: 1 },
  });
  assert.ok(validateValues([d], { features: ["parking", "pool"] }).errors?.features);
  assert.ok(validateValues([d], { features: ["gym"] }).errors?.features);
  assert.equal(validateValues([d], { features: ["pool"] }).errors, null);
});

test("fields: url fields cannot smuggle javascript:", () => {
  const d = def({ key: "site", label: "Website", type: "url" });
  assert.ok(validateValues([d], { site: "javascript:alert(1)" }).errors?.site);
  assert.equal(validateValues([d], { site: "https://acme.test" }).errors, null);
});

test("projections: filterable values land in typed columns, so discovery never scans raw JSON", () => {
  const d1 = def({ key: "beds", label: "Bedrooms", type: "number", isFilterable: true });
  const d2 = def({ key: "size", label: "Size", type: "select", isFilterable: true, options: [{ value: "l", label: "L" }] });
  const v = validateValues([d1, d2], { beds: 4, size: "l" });
  const p = projectValues([d1, d2], v.values);
  assert.equal(p.find((x) => x.key === "beds")!.valueNum, "4");
  const size = p.find((x) => x.key === "size")!;
  assert.equal(size.valueJson, "l");
  assert.equal(size.valueText, "L", "labels, not raw values, feed the search text");
});

test("message lines: private fields are never shown to the vendor", () => {
  const defs = [def({ key: "colour", label: "Colour" }), def({ key: "internal_note", label: "Internal", isPublic: false })];
  const v = validateValues(defs, { colour: "Black", internal_note: "do not send this" });
  assert.deepEqual(messageLines(defs, v.values), ["Colour: Black"]);
});

/* ---------------------------- slugs / xss / money ---------------------------- */
test("slug: accents normalise, reserved words shift, malformed input is refused", () => {
  assert.equal(ensureUniqueSlug("  Àdíré  Tòp!  ", new Set()), "adire-top");
  assert.equal(ensureUniqueSlug("Admin", new Set(["admin"])), "admin-2");
  assert.equal(isValidSlug("admin"), false);
  assert.equal(isValidSlug("a"), false);
  assert.equal(isValidSlug("good-slug-1"), true);
});

test("slug: taken slugs get a deterministic numeric suffix", () => {
  assert.equal(ensureUniqueSlug("Laptop", new Set(["laptop", "laptop-2"])), "laptop-3");
});

test("sanitize: scripts, handlers and javascript: hrefs are stripped; safe markup survives", () => {
  const clean = sanitizeHtml(`<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.test">y</a><b>bold</b></p>`);
  assert.ok(!/script|onclick|javascript:/i.test(clean), clean);
  assert.ok(clean.includes("<b>bold</b>"));
  assert.ok(clean.includes('href="https://ok.test"'));
  assert.equal(htmlToText("<p>a</p><p>b</p>"), "a\nb");
});

test("money: formatting and parsing stay lossless for catalogue prices", () => {
  assert.equal(formatMoney("450000.5", "NGN"), "₦450,000.50", "money always shows 2dp when it has cents");
  assert.equal(formatMoney("450000", "NGN"), "₦450,000");
  assert.equal(parseMoney("₦1,250.50"), "1250.50");
  assert.equal(parseMoney("abc"), null);
  assert.equal(truncate("abcdefghij", 5), "abcd…");
});

/* ---------------------------- authorization (invariant I1/I2) ---------------------------- */
test("roles: no vendor team role can reach a platform permission", async () => {
  const { ROLE_GRANTS } = await import("@/core/auth");
  const platformOnly = ["payments.verify", "payments.reject", "vendors.suspend", "schema.manage", "settings.manage", "audit_logs.view"];
  for (const role of ["owner", "manager", "sales", "catalogue_manager", "support", "accountant"]) {
    for (const p of platformOnly) {
      assert.ok(!(ROLE_GRANTS[role] ?? []).includes(p as never), `${role} must not hold ${p}`);
    }
  }
  assert.ok(ROLE_GRANTS.super_admin!.includes("payments.verify" as never));
  assert.ok(ROLE_GRANTS.finance_admin!.includes("payments.verify" as never));
  assert.ok(!ROLE_GRANTS.finance_admin!.includes("schema.manage" as never), "finance must not edit the catalogue schema");
});

test("tenants: a non-admin session resolves permissions from the role table, never from input", async () => {
  const { userHasPermission } = await import("@/core/auth");
  const base = { userId: "u", email: "e", name: "n", memberships: [] };
  assert.equal(await userHasPermission({ ...base, platformRoles: ["sales"] }, "payments.verify"), false);
  assert.equal(await userHasPermission({ ...base, platformRoles: ["sales"] }, "leads.edit"), true);
  assert.equal(await userHasPermission({ ...base, platformRoles: ["moderator"] }, "catalogue.moderate"), true);
  assert.equal(await userHasPermission({ ...base, platformRoles: ["moderator"] }, "settings.manage"), false);
  assert.equal(await userHasPermission({ ...base, platformRoles: [] }, "catalogue.edit"), false);
  // requireMembership() needs a request scope for cookies(); the 401-vs-403 behaviour is
  // asserted end-to-end (M1 e2e), not here.
});

/* ---------------------------- runner ---------------------------- */
export async function verify(): Promise<number> {
  let pass = 0, fail = 0;
  for (const c of cases) {
    try {
      await c.run();
      pass++;
      console.log(`  ok   ${c.name}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${c.name}`);
      console.log(`       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}
