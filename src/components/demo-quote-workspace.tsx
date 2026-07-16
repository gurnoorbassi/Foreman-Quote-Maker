"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: number; description: string; category: string; quantity: number; unit: string; unitPrice: number };
type DemoState = { client: string; project: string; address: string; markup: number; contingency: number; discount: number; tax: number; notes: string; items: Item[] };

const initial: DemoState = {
  client: "Sample Customer", project: "Kitchen refresh", address: "123 Main Street, Vancouver, BC",
  markup: 15, contingency: 5, discount: 0, tax: 5,
  notes: "Work area will be protected and left broom-clean. Changes outside this scope require written approval.",
  items: [
    { id: 1, description: "Site preparation and protection", category: "Labour", quantity: 8, unit: "hr", unitPrice: 65 },
    { id: 2, description: "Cabinet installation", category: "Labour", quantity: 24, unit: "hr", unitPrice: 75 },
    { id: 3, description: "Finish materials and supplies", category: "Materials", quantity: 1, unit: "lot", unitPrice: 1850 },
  ],
};
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const num = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

export default function DemoQuoteWorkspace() {
  const [state, setState] = useState<DemoState>(initial);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const storageReady = useRef(false);

  useEffect(() => { const timer = window.setTimeout(() => { try { const stored = localStorage.getItem("foreman-public-demo"); storageReady.current = true; if (stored) setState(JSON.parse(stored)); } catch { storageReady.current = true; } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (!storageReady.current) return; localStorage.setItem("foreman-public-demo", JSON.stringify(state)); const start = window.setTimeout(() => setSaved(true), 0); const finish = window.setTimeout(() => setSaved(false), 1000); return () => { window.clearTimeout(start); window.clearTimeout(finish); }; }, [state]);

  const totals = useMemo(() => {
    const direct = state.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const markup = direct * state.markup / 100;
    const contingency = (direct + markup) * state.contingency / 100;
    const discount = (direct + markup + contingency) * state.discount / 100;
    const subtotal = direct + markup + contingency - discount;
    const tax = subtotal * state.tax / 100;
    return { direct, markup, contingency, discount, subtotal, tax, total: subtotal + tax };
  }, [state]);
  const updateItem = (id: number, key: keyof Item, value: string | number) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [key]: value } : item) }));
  const addItem = () => setState((current) => ({ ...current, items: [...current.items, { id: Date.now(), description: "New cost item", category: "Labour", quantity: 1, unit: "ea", unitPrice: 0 }] }));

  return <main className="min-h-screen bg-[#eef0ec] text-[#18201b]">
    <div className="border-b border-[#dce1dc] bg-[#fffaf0] px-4 py-2 text-center text-[11px] font-semibold text-[#73500f]">PUBLIC DEMO · Changes stay on this device. Don’t enter real customer information.</div>
    <header className="sticky top-0 z-20 border-b border-[#dfe3df] bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#171c19] font-black text-[#eaa83b]">F</div><div><p className="text-sm font-bold">Foreman</p><p className="text-[9px] uppercase tracking-[.18em] text-[#7c857f]">Quote Studio · Demo</p></div></div>
      <div className="flex items-center gap-2"><span className={`hidden text-[11px] text-[#7b847e] sm:inline ${saved ? "opacity-100" : "opacity-0"}`}>Saved on this device</span><Link href="/login" className="secondary-btn">Sign in</Link><button className="action-dark" onClick={() => setPreview(true)}>Preview</button></div>
    </div></header>

    <div className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-2xl border border-[#dce1dc] bg-white shadow-[0_10px_35px_rgba(24,32,27,.05)]">
        <div className="border-b border-[#e5e8e5] px-5 py-5 sm:px-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#929a94]">Quote details</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.04em]">Build a clear, professional estimate</h1><p className="mt-1 text-xs text-[#778079]">Edit anything below. Totals update instantly.</p></div>
        <div className="grid gap-4 border-b border-[#e5e8e5] p-5 sm:grid-cols-2 sm:p-7"><label className="text-xs font-semibold">Customer<input className="field" value={state.client} onChange={(e) => setState({ ...state, client: e.target.value })}/></label><label className="text-xs font-semibold">Project<input className="field" value={state.project} onChange={(e) => setState({ ...state, project: e.target.value })}/></label><label className="text-xs font-semibold sm:col-span-2">Job address<input className="field" value={state.address} onChange={(e) => setState({ ...state, address: e.target.value })}/></label></div>
        <div className="p-5 sm:p-7"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#929a94]">Scope and pricing</p><h2 className="mt-1 text-lg font-semibold">Cost items</h2></div><button className="primary-btn" onClick={addItem}>+ Add item</button></div>
          <div className="space-y-3">{state.items.map((item, index) => <div key={item.id} className="rounded-2xl border border-[#e1e5e1] bg-[#fafbfa] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa19c]">Item {index + 1}</span><button className="text-xs font-semibold text-[#a04b3d]" onClick={() => setState({ ...state, items: state.items.filter((row) => row.id !== item.id) })}>Remove</button></div>
            <div className="grid gap-3 md:grid-cols-[minmax(180px,2fr)_1fr_90px_80px_120px]"><label className="text-[10px] font-bold uppercase tracking-wide text-[#7d857f]">Description<input className="mini-field mt-1" value={item.description} onChange={(e) => updateItem(item.id,"description",e.target.value)}/></label><label className="text-[10px] font-bold uppercase tracking-wide text-[#7d857f]">Category<select className="mini-field mt-1" value={item.category} onChange={(e) => updateItem(item.id,"category",e.target.value)}><option>Labour</option><option>Materials</option><option>Equipment</option><option>Subcontractor</option><option>Other</option></select></label><label className="text-[10px] font-bold uppercase tracking-wide text-[#7d857f]">Qty<input type="number" min="0" className="mini-field mt-1" value={item.quantity} onChange={(e) => updateItem(item.id,"quantity",num(e.target.value))}/></label><label className="text-[10px] font-bold uppercase tracking-wide text-[#7d857f]">Unit<input className="mini-field mt-1" value={item.unit} onChange={(e) => updateItem(item.id,"unit",e.target.value)}/></label><label className="text-[10px] font-bold uppercase tracking-wide text-[#7d857f]">Unit price<input type="number" min="0" className="mini-field mt-1" value={item.unitPrice} onChange={(e) => updateItem(item.id,"unitPrice",num(e.target.value))}/></label></div><p className="mt-3 text-right text-sm font-bold">{money.format(item.quantity * item.unitPrice)}</p>
          </div>)}</div>
        </div>
      </section>

      <aside className="space-y-5 xl:sticky xl:top-[88px] xl:self-start"><section className="rounded-2xl border border-[#dce1dc] bg-white p-5 shadow-[0_10px_35px_rgba(24,32,27,.05)]"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#929a94]">Pricing controls</p><div className="mt-4 grid grid-cols-2 gap-3">{([['markup','Markup'],['contingency','Contingency'],['discount','Discount'],['tax','Tax']] as const).map(([key,label]) => <label key={key} className="text-[11px] font-semibold">{label} %<input type="number" min="0" className="field" value={state[key]} onChange={(e) => setState({ ...state, [key]: num(e.target.value) })}/></label>)}</div></section>
        <section className="overflow-hidden rounded-2xl bg-[#171c19] p-5 text-white shadow-[0_14px_35px_rgba(18,24,20,.18)]"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#eaa83b]">Quote total</p><div className="mt-5 space-y-2 text-xs text-white/60"><div className="flex justify-between"><span>Direct cost</span><span>{money.format(totals.direct)}</span></div><div className="flex justify-between"><span>Markup</span><span>{money.format(totals.markup)}</span></div><div className="flex justify-between"><span>Contingency</span><span>{money.format(totals.contingency)}</span></div>{totals.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money.format(totals.discount)}</span></div>}<div className="flex justify-between"><span>Tax</span><span>{money.format(totals.tax)}</span></div></div><div className="my-5 h-px bg-white/10"/><div className="flex items-end justify-between"><span className="text-xs text-white/50">CAD</span><strong className="text-3xl tracking-[-.04em]">{money.format(totals.total)}</strong></div><button className="mt-5 h-11 w-full rounded-xl bg-[#eaa83b] text-sm font-bold text-[#21190b]" onClick={() => setPreview(true)}>Preview customer quote</button></section>
        <button className="w-full text-xs font-semibold text-[#6d756f]" onClick={() => { localStorage.removeItem("foreman-public-demo"); setState(initial); }}>Reset demo</button></aside>
    </div>

    {preview && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#111612]/75 p-3 backdrop-blur-sm sm:p-8"><div className="mx-auto mb-4 flex max-w-4xl justify-end gap-2 print:hidden"><button className="secondary-btn" onClick={() => setPreview(false)}>Close</button><button className="primary-btn" onClick={() => window.print()}>Print / save PDF</button></div><article id="quote-document" className="mx-auto min-h-[950px] max-w-4xl bg-white p-7 shadow-2xl sm:p-12">
      <div className="flex items-start justify-between border-b-2 border-[#1b211d] pb-8"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#171c19] text-lg font-black text-[#eaa83b]">F</div><div><p className="text-xl font-bold">FOREMAN</p><p className="text-[9px] uppercase tracking-[.2em] text-[#7a827c]">Quote Studio</p></div></div><div className="text-right"><h2 className="text-3xl font-light tracking-[-.04em]">QUOTE</h2><p className="mt-1 text-xs text-[#7b837d]">DEMO-{new Date().getFullYear()}-001</p></div></div>
      <div className="grid gap-7 py-8 sm:grid-cols-2"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#949b96]">Prepared for</p><p className="mt-2 text-lg font-semibold">{state.client || "Customer"}</p><p className="mt-1 text-xs text-[#6e766f]">{state.address}</p></div><div className="sm:text-right"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#949b96]">Project</p><p className="mt-2 text-lg font-semibold">{state.project || "Project quote"}</p><p className="mt-1 text-xs text-[#6e766f]">Valid for 30 days</p></div></div>
      <div className="overflow-hidden rounded-lg border border-[#dfe3df]"><table className="w-full border-collapse text-left text-xs"><thead className="bg-[#f1f3f0]"><tr><th className="p-3">Description</th><th className="hidden p-3 sm:table-cell">Category</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{state.items.map((item) => <tr key={item.id} className="border-t border-[#e5e8e5]"><td className="p-3 font-medium">{item.description}</td><td className="hidden p-3 text-[#747c76] sm:table-cell">{item.category}</td><td className="p-3 text-right text-[#747c76]">{item.quantity} {item.unit}</td><td className="p-3 text-right font-semibold">{money.format(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div>
      <div className="ml-auto mt-7 w-full max-w-sm space-y-2 text-xs"><div className="flex justify-between"><span>Subtotal</span><span>{money.format(totals.subtotal)}</span></div><div className="flex justify-between text-[#6f7771]"><span>Tax ({state.tax}%)</span><span>{money.format(totals.tax)}</span></div><div className="mt-3 flex justify-between border-t-2 border-[#1b211d] pt-3 text-lg font-bold"><span>Total</span><span>{money.format(totals.total)} CAD</span></div></div>
      <div className="mt-12 border-t border-[#dfe3df] pt-7"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#949b96]">Terms and notes</p><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#646d66]">{state.notes}</p></div><p className="mt-12 text-center text-[9px] uppercase tracking-[.15em] text-[#a0a6a1]">Interactive demonstration · Not a binding quote</p>
    </article></div>}
  </main>;
}
