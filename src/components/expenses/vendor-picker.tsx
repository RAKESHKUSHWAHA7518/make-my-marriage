"use client";
import { useState } from "react";
import type { ExpenseVendorChoice, ExpenseView } from "@/modules/expenses/service";
import { vendorCategoryLabels } from "@/modules/vendors/schema";

export function ExpenseVendorPicker({ vendors, value, onChange, historical, enabled, error }: { vendors: ExpenseVendorChoice[]; value: string; onChange: (value: string) => void; historical?: ExpenseView; enabled: boolean; error?: string }) {
  const [search, setSearch] = useState("");
  const selected = vendors.find(v => v.id === value), retained = !!value && !selected && historical?.vendorId === value;
  const matches = vendors.filter(v => `${v.name} ${vendorCategoryLabels[v.category as keyof typeof vendorCategoryLabels] ?? v.category}`.toLocaleLowerCase("en-IN").includes(search.trim().toLocaleLowerCase("en-IN")));
  const options = selected && !matches.some(v => v.id === selected.id) ? [selected, ...matches] : matches;
  return <section className="expense-vendor-picker" aria-label="Saved vendor association"><div className="expense-vendor-heading"><strong>Vendor <small>(Optional)</small></strong>{value && <button type="button" className="button button-secondary" disabled={!enabled} onClick={() => onChange("")}>Clear vendor</button>}</div>
    {!enabled && <p className="wedding-notice">Vendor linking is temporarily unavailable. You can still record an unlinked expense.</p>}
    {(selected || retained) && <div className="expense-vendor-selected"><strong>{selected?.name ?? historical?.vendor?.name ?? "Unavailable vendor"}</strong><span>{selected ? `${vendorCategoryLabels[selected.category as keyof typeof vendorCategoryLabels] ?? selected.category} · ${selected.source === "MANUAL" ? "Manual" : "Google Places reference"}` : "Vendor unavailable · Existing association retained"}</span></div>}
    <label>Search saved vendors<input type="search" aria-label="Search saved vendors" value={search} onChange={e => setSearch(e.target.value)} placeholder="Private name or category" maxLength={200} disabled={!enabled} /></label>
    <label>Choose a saved vendor<select aria-label="Choose a saved vendor" name="vendorId" value={value} onChange={e => onChange(e.target.value)} disabled={!enabled} aria-invalid={!!error} aria-describedby={error ? "expense-error-vendorId expense-vendor-help" : "expense-vendor-help"}><option value="">No vendor linked</option>{retained && <option value={value}>{historical?.vendor?.name ?? "Unavailable vendor"} · Unavailable (retained history)</option>}{options.map(v => <option key={v.id} value={v.id}>{v.name} · {vendorCategoryLabels[v.category as keyof typeof vendorCategoryLabels] ?? v.category} · {v.source === "MANUAL" ? "Manual" : "Google Places"}</option>)}</select></label>
    {error && <small className="event-field-error" id="expense-error-vendorId">{error}</small>}
    {enabled && !vendors.length && <p className="expense-helper">No active saved vendors yet. This expense can stay unlinked.</p>}{search && !matches.length && <p className="expense-helper" role="status">No matching active vendors. Your selected association is unchanged.</p>}
    <p id="expense-vendor-help" className="expense-helper">Link a saved vendor or leave this unlinked. Choosing or clearing a vendor does not change the amount, expense category or event, and does not search Google Places.</p>
  </section>;
}
