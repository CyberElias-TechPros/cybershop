import { asc, eq } from "drizzle-orm";
import { businessTypes, catalogueTypes, fieldDefinitions, fieldOptions } from "@/db/schema";
import { getDb } from "@/db/client";
import { Badge, Card, StatusPill } from "@/ui/kit";
import { FIELD_TYPES } from "@/core/fields";
import { AddFieldForm, AddTypeForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminSchema() {
  const db = getDb();
  const [types, allFields, opts, btypes] = await Promise.all([
    db.select().from(catalogueTypes).where(eq(catalogueTypes.isActive, true)).orderBy(asc(catalogueTypes.sortOrder)),
    db.select().from(fieldDefinitions).orderBy(asc(fieldDefinitions.sortOrder)),
    db.select().from(fieldOptions).orderBy(asc(fieldOptions.sortOrder)),
    db.select().from(businessTypes).orderBy(asc(businessTypes.sortOrder)),
  ]);

  const optsBy = new Map<string, string[]>();
  for (const o of opts) optsBy.set(o.fieldDefinitionId, [...(optsBy.get(o.fieldDefinitionId) ?? []), o.label]);
  const fieldsBy = new Map<string, Array<typeof fieldDefinitions.$inferSelect & { optionLabels: string[] }>>();
  for (const f of allFields) {
    const row = { ...f, optionLabels: optsBy.get(f.id) ?? [] };
    fieldsBy.set(f.catalogueTypeId, [...(fieldsBy.get(f.catalogueTypeId) ?? []), row]);
  }

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Categories &amp; fields</h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">
          This is the configuration engine from plan.md 3: a business type says what a vendor offers, a catalogue type shapes the item, and fields are what
          makes a course listing different from a dress. Add a vertical here and every vendor form updates - no deploy.
        </p>
      </header>

      <AddTypeForm />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <h2 className="text-sm font-semibold">Business types</h2>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {btypes.map((t: typeof businessTypes.$inferSelect) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <code className="text-xs text-[var(--color-ink-faint)]">{t.key}</code>
                {t.isActive ? null : <Badge tone="warn">inactive</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="card-pad">
          <h2 className="text-sm font-semibold">Field types available to the builder</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">Registry-backed: each one knows its validation, its filter capability and how it prints in a WhatsApp message.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {FIELD_TYPES.map((f: { type: string; label: string; filterable: boolean; searchable: boolean }) => (
              <li key={f.type}>
                <span className="chip" title={`${f.filterable ? "filterable" : ""} ${f.searchable ? "searchable" : ""}`.trim()}>
                  {f.label}
                  {f.filterable ? <span className="text-[var(--color-ok)]">·F</span> : null}
                  {f.searchable ? <span className="text-[var(--color-ok)]">·S</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {types.map((t: typeof catalogueTypes.$inferSelect) => {
          const list = fieldsBy.get(t.id) ?? [];
          return (
            <Card key={t.id} className="card-pad">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{t.name}</h2>
                <code className="text-xs text-[var(--color-ink-faint)]">{t.key}</code>
                <Badge tone="mute">schema v{t.schemaVersion}</Badge>
                <Badge tone="mute">{list.length} fields</Badge>
                <StatusPill status={t.isActive ? "active" : "unpublished"} />
              </div>
              <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                CTA verb: &quot;{t.ctaVerb}&quot; · JSON-LD: {t.schemaKind} · {JSON.stringify(t.mediaRules)}
              </p>
              <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
                {list.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="font-medium">{f.label}</span>
                    <code className="text-xs text-[var(--color-ink-faint)]">{f.key}</code>
                    <Badge tone="mute">{f.type}</Badge>
                    {f.isRequired ? <Badge tone="warn">required</Badge> : null}
                    {f.isFilterable ? <Badge tone="ok">filter</Badge> : null}
                    {f.isSearchable ? <Badge tone="ok">search</Badge> : null}
                    {!f.isPublic ? <Badge tone="info">internal</Badge> : null}
                    {f.optionLabels.length ? <span className="text-xs text-[var(--color-ink-faint)]">{f.optionLabels.join(" / ")}</span> : null}
                  </li>
                ))}
              </ul>
              <AddFieldForm typeId={t.id} typeKey={t.key} fields={FIELD_TYPES as never} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

