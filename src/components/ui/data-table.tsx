"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input, Select } from "./form";
import { Dropdown } from "./dialog";
import { EmptyState, ErrorState, LoadingState } from "./states";

export type DataTableHandle = {
  getSelectedRows: () => any[];
  clearSelection: () => void;
};

// ---------------------------------------------------------------------------
// Search input with debounce
// ---------------------------------------------------------------------------

/** Ergonomic column factory: simplified ColumnDef with cell(row) + alignment. */
export function col<T = any>(def: {
  key: string;
  header: React.ReactNode;
  cell?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  width?: number;
}): ColumnDef<T, any> {
  const alignClass =
    def.align === "right" ? "text-right" : def.align === "center" ? "text-center" : "text-left";
  return {
    id: def.key,
    accessorKey: def.key,
    header: def.header,
    enableSorting: def.sortable ?? true,
    size: def.width,
    cell: def.cell
      ? (ctx: any) => <div className={alignClass}>{def.cell!(ctx.row.original)}</div>
      : (ctx: any) => <div className={alignClass}>{String(ctx.getValue() ?? "")}</div>,
  } as ColumnDef<T, any>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [inner, setInner] = useState(value);
  useEffect(() => setInner(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (inner !== value) onChange(inner);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner]);

  return (
    <div className={cn("relative", className)}>
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={inner}
        onChange={(e) => setInner(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="pl-8 pr-7"
      />
      {inner && (
        <button
          aria-label="Clear search"
          onClick={() => {
            setInner("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar container
// ---------------------------------------------------------------------------
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

function exportRowsCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// DataTable — server-driven pagination/sorting, selection, column visibility
// ---------------------------------------------------------------------------
export function DataTable({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  sorting,
  onSortingChange,
  isLoading,
  error,
  onRetry,
  onRowClick,
  rowActions,
  emptyTitle = "No records found",
  emptyHint,
  emptyAction,
  toolbar,
  bulkActions,
  storageKey,
  exportName,
  csvHeaders,
  csvRows,
  compact,
}: {
  columns: ColumnDef<any, any>[];
  data: any[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: any) => void;
  rowActions?: (row: any) => React.ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  toolbar?: React.ReactNode;
  bulkActions?: (selectedRows: any[], clear: () => void) => React.ReactNode;
  storageKey?: string;
  exportName?: string;
  csvHeaders?: string[];
  csvRows?: (rows: any[]) => (string | number | null | undefined)[][];
  compact?: boolean;
}) {
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem(`nexora.cols.${storageKey}`) ?? "{}");
      } catch {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    if (storageKey) localStorage.setItem(`nexora.cols.${storageKey}`, JSON.stringify(visibility));
  }, [visibility, storageKey]);

  // reset selection when data changes
  useEffect(() => setSelection({}), [data]);

  const selectable = !!bulkActions;
  const tableColumns = useMemo<ColumnDef<any, any>[]>(() => {
    const cols: ColumnDef<any, any>[] = [...columns];
    if (selectable) {
      cols.unshift({
        id: "__select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label="Select row"
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        size: 36,
      });
    }
    if (rowActions) {
      cols.push({
        id: "__actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <div onClick={(e) => e.stopPropagation()}>{rowActions(row.original)}</div>,
        enableSorting: false,
        size: 60,
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, selectable, rowActions]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      rowSelection: selection,
      columnVisibility: visibility,
      sorting: sorting ?? [],
    },
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    onSortingChange: (updater) => {
      if (onSortingChange) onSortingChange(typeof updater === "function" ? (updater as any)(sorting ?? []) : updater);
    },
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const pageCount = total !== undefined && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const showPagination = onPageChange !== undefined && total !== undefined;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {(toolbar || exportName || bulkActions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2.5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {toolbar}
            {bulkActions && selectedRows.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1">
                <span className="text-xs font-medium text-primary">{selectedRows.length} selected</span>
                {bulkActions(selectedRows, () => setSelection({}))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Dropdown
              trigger={
                <Button variant="outline" size="sm">
                  <Columns3 size={13} /> Columns
                </Button>
              }
            >
              {(close) => (
                <div className="max-h-72 w-52 overflow-y-auto py-1 scrollbar-thin">
                  {table
                    .getAllLeafColumns()
                    .filter((c) => c.id !== "__select" && c.id !== "__actions")
                    .map((col) => (
                      <label
                        key={col.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                          checked={col.getIsVisible()}
                          onChange={col.getToggleVisibilityHandler()}
                          onClick={close}
                        />
                        {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                      </label>
                    ))}
                </div>
              )}
            </Dropdown>
            {exportName && csvHeaders && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportRowsCsv(
                    `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`,
                    csvHeaders,
                    csvRows ? csvRows(data) : []
                  )
                }
              >
                <Download size={13} /> CSV
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto scrollbar-thin">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <div className="p-4">
            <ErrorState title={error} retry={onRetry} />
          </div>
        ) : data.length === 0 ? (
          <div className="p-4">
            <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
          </div>
        ) : (
          <table className="data-table w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b">
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.column.columnDef.size }}
                        className={cn(
                          "select-none px-3 py-2 font-semibold",
                          compact ? "py-1.5" : "py-2",
                          canSort && "cursor-pointer hover:text-foreground"
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-muted-foreground/60">
                              {sorted === "asc" ? (
                                <ArrowUp size={11} />
                              ) : sorted === "desc" ? (
                                <ArrowDown size={11} />
                              ) : (
                                <ArrowUpDown size={11} className="opacity-40" />
                              )}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0",
                    onRowClick && "cursor-pointer hover:bg-accent/60",
                    row.getIsSelected() && "bg-primary/5"
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3", compact ? "py-1.5" : "py-2")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showPagination && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {total === 0 ? "0" : (page! - 1) * pageSize! + 1}–{Math.min(page! * pageSize!, total!)} of {total}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <Select
                aria-label="Rows per page"
                className="h-6 w-16 py-0 text-xs"
                value={String(pageSize)}
                onChange={(e) => onPageChange!(1, Number(e.target.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page! <= 1}
                onClick={() => onPageChange!(page! - 1, pageSize!)}
              >
                <ChevronLeft size={13} />
              </Button>
              <span className="tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={page! >= pageCount}
                onClick={() => onPageChange!(page! + 1, pageSize!)}
              >
                <ChevronRight size={13} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
