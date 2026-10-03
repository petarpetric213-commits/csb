"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { round2 } from "@/lib/utils";

export type LineItem = {
  key: string;
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
};

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salesPrice: number;
  purchasePrice: number;
  taxRate: number;
};

/** Editable document lines (quotes, orders, POs, invoices).
 *  Totals are computed with the same rounding as the server. */
export function LineItemsEditor({
  items,
  onChange,
  products,
  priceField = "salesPrice",
  allowNegativeTax = true,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: ProductOption[];
  priceField?: "salesPrice" | "purchasePrice";
  allowNegativeTax?: boolean;
}) {
  const t = useI18n().t;
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const update = (key: string, patch: Partial<LineItem>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const addLine = () => {
    const first = products[0];
    if (!first) return;
    onChange([
      ...items,
      {
        key: crypto.randomUUID(),
        productId: first.id,
        quantity: 1,
        unitPrice: priceField === "purchasePrice" ? first.purchasePrice : first.salesPrice,
        discountPercent: 0,
        taxRate: first.taxRate,
      },
    ]);
  };

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice * (1 - it.discountPercent / 100), 0);
  const discountTotal = items.reduce((s, it) => s + it.quantity * it.unitPrice * (it.discountPercent / 100), 0);
  const taxTotal = items.reduce(
    (s, it) => s + it.quantity * it.unitPrice * (1 - it.discountPercent / 100) * (it.taxRate / 100),
    0
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-2xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">{t("products.title")}</th>
              <th className="w-24 px-2 py-1.5 text-right font-medium">{t("common.quantity")}</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">{t("common.price")}</th>
              <th className="w-20 px-2 py-1.5 text-right font-medium">%</th>
              <th className="w-20 px-2 py-1.5 text-right font-medium">{t("common.vat")}</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">{t("common.total")}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("common.noItems")}
                </td>
              </tr>
            )}
            {items.map((it) => {
              const product = byId.get(it.productId);
              const net = it.quantity * it.unitPrice * (1 - it.discountPercent / 100);
              return (
                <tr key={it.key} className="border-b last:border-0">
                  <td className="px-2 py-1">
                    <select
                      className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs"
                      value={it.productId}
                      onChange={(e) => {
                        const p = byId.get(e.target.value);
                        update(it.key, {
                          productId: e.target.value,
                          unitPrice: p ? (priceField === "purchasePrice" ? p.purchasePrice : p.salesPrice) : it.unitPrice,
                          taxRate: p?.taxRate ?? it.taxRate,
                        });
                      }}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="h-7 text-right text-xs tabular-nums"
                      value={it.quantity}
                      onChange={(e) => update(it.key, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-7 text-right text-xs tabular-nums"
                      value={it.unitPrice}
                      onChange={(e) => update(it.key, { unitPrice: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-7 text-right text-xs tabular-nums"
                      value={it.discountPercent}
                      onChange={(e) => update(it.key, { discountPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-7 text-right text-xs tabular-nums"
                      value={it.taxRate}
                      onChange={(e) => update(it.key, { taxRate: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1 text-right text-xs tabular-nums">
                    {net.toFixed(2)} {product ? product.unit : ""}
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((x) => x.key !== it.key))}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between gap-4">
        <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={products.length === 0}>
          <Plus size={14} /> {t("common.addLine")}
        </Button>
        <dl className="w-56 space-y-0.5 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <dt>{t("common.subtotal")}</dt>
            <dd className="tabular-nums">{round2(subtotal).toFixed(2)}</dd>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>{t("common.discount")}</dt>
              <dd className="tabular-nums">−{round2(discountTotal).toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <dt>{t("common.vat")}</dt>
            <dd className="tabular-nums">{round2(taxTotal).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between border-t pt-0.5 font-semibold">
            <dt>{t("common.total")}</dt>
            <dd className="tabular-nums">{round2(subtotal + taxTotal).toFixed(2)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
