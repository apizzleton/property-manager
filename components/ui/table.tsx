"use client";

import * as React from "react";
import { Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Table Components — Table, TableHeader, TableBody, TableFooter,
   TableHead, TableRow, TableCell, TableCaption
   ============================================================================ */

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width: number;
  order: number;
}

function normalizeLabel(input: string, fallback: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  return trimmed || fallback;
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  customizable?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, customizable = true, ...props }, ref) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null);
    const dragStateRef = React.useRef<{ colId: string; startX: number; startWidth: number } | null>(null);
    const [showCustomizer, setShowCustomizer] = React.useState(false);
    const [columns, setColumns] = React.useState<ColumnConfig[]>([]);
    const [storageKey, setStorageKey] = React.useState("");
    const [ready, setReady] = React.useState(false);

    React.useImperativeHandle(ref, () => tableRef.current as HTMLTableElement);

    const persistColumns = React.useCallback((next: ColumnConfig[], key: string) => {
      if (!key) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore localStorage errors
      }
    }, []);

    const applyColumnsToDom = React.useCallback((next: ColumnConfig[]) => {
      const table = tableRef.current;
      if (!table) return;
      const sorted = [...next].sort((a, b) => a.order - b.order);
      const rows = Array.from(table.querySelectorAll("tr"));

      for (const row of rows) {
        const cells = Array.from(row.children) as HTMLElement[];
        const mapped = new Map<string, HTMLElement>();
        for (const cell of cells) {
          const colId = cell.dataset.pmColId;
          if (colId) mapped.set(colId, cell);
        }

        const orderedCells: HTMLElement[] = [];
        for (const col of sorted) {
          const cell = mapped.get(col.id);
          if (cell) orderedCells.push(cell);
        }
        for (const cell of cells) {
          if (!orderedCells.includes(cell)) orderedCells.push(cell);
        }
        for (const cell of orderedCells) row.appendChild(cell);
      }

      for (const col of next) {
        const colCells = table.querySelectorAll<HTMLElement>(`[data-pm-col-id="${col.id}"]`);
        colCells.forEach((cell) => {
          cell.style.display = col.visible ? "" : "none";
          if (col.visible) {
            cell.style.width = `${col.width}px`;
            cell.style.minWidth = `${Math.max(80, col.width - 30)}px`;
          }
        });
      }
    }, []);

    const updateColumns = React.useCallback((updater: (prev: ColumnConfig[]) => ColumnConfig[]) => {
      setColumns((prev) => {
        const next = updater(prev);
        applyColumnsToDom(next);
        if (storageKey) persistColumns(next, storageKey);
        return next;
      });
    }, [applyColumnsToDom, persistColumns, storageKey]);

    const setColumnWidthInDom = React.useCallback((colId: string, width: number) => {
      const table = tableRef.current;
      if (!table) return;
      const colCells = table.querySelectorAll<HTMLElement>(`[data-pm-col-id="${colId}"]`);
      colCells.forEach((cell) => {
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${Math.max(80, width - 30)}px`;
      });
    }, []);

    React.useEffect(() => {
      if (!customizable) return;
      const table = tableRef.current;
      if (!table || ready) return;

      const headerCells = Array.from(table.querySelectorAll("thead tr:first-child th")) as HTMLElement[];
      if (headerCells.length === 0) return;

      headerCells.forEach((cell, index) => {
        if (!cell.dataset.pmColId) cell.dataset.pmColId = `col-${index}`;
      });

      const rows = Array.from(table.querySelectorAll("tr"));
      rows.forEach((row) => {
        const cells = Array.from(row.children) as HTMLElement[];
        cells.forEach((cell, index) => {
          const colId = headerCells[index]?.dataset.pmColId;
          if (colId) cell.dataset.pmColId = colId;
        });
      });

      const defaults: ColumnConfig[] = headerCells.map((cell, index) => ({
        id: cell.dataset.pmColId || `col-${index}`,
        label: normalizeLabel(cell.textContent || "", `Column ${index + 1}`),
        visible: true,
        width: Math.max(120, Math.round(cell.getBoundingClientRect().width) || 160),
        order: index,
      }));

      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const signature = defaults.map((c) => c.label).join("|");
      const key = `pmapp-table-config:${path}:${signature}`;
      setStorageKey(key);

      let merged = defaults;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw) as ColumnConfig[];
          const savedById = new Map(saved.map((c) => [c.id, c]));
          merged = defaults.map((d) => {
            const s = savedById.get(d.id);
            return s
              ? { ...d, visible: s.visible, width: s.width, order: s.order }
              : d;
          });
        }
      } catch {
        merged = defaults;
      }

      setColumns(merged);
      applyColumnsToDom(merged);
      setReady(true);
    }, [applyColumnsToDom, customizable, ready]);

    React.useEffect(() => {
      if (!customizable) return;
      const onMouseMove = (e: MouseEvent) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const nextWidth = Math.max(100, Math.min(720, Math.round(drag.startWidth + (e.clientX - drag.startX))));
        setColumnWidthInDom(drag.colId, nextWidth);
        document.body.style.cursor = "col-resize";
      };

      const onMouseUp = () => {
        const drag = dragStateRef.current;
        if (!drag) return;
        dragStateRef.current = null;
        document.body.style.cursor = "";

        const table = tableRef.current;
        const headerCell = table?.querySelector<HTMLElement>(`thead th[data-pm-col-id="${drag.colId}"]`);
        if (!headerCell) return;
        const finalWidth = Math.max(100, Math.round(headerCell.getBoundingClientRect().width));

        updateColumns((prev) => prev.map((col) => (
          col.id === drag.colId ? { ...col, width: finalWidth } : col
        )));
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }, [customizable, setColumnWidthInDom, updateColumns]);

    React.useEffect(() => {
      if (!customizable) return;
      const table = tableRef.current;
      if (!table || !ready) return;

      const headerCells = Array.from(table.querySelectorAll("thead tr:first-child th")) as HTMLElement[];
      for (const cell of headerCells) {
        const colId = cell.dataset.pmColId;
        if (!colId) continue;
        cell.style.position = "relative";

        let handle = cell.querySelector<HTMLElement>('[data-pm-resizer="true"]');
        if (!handle) {
          handle = document.createElement("div");
          handle.dataset.pmResizer = "true";
          handle.className = "absolute right-0 top-0 h-full w-2 cursor-col-resize select-none";
          handle.style.userSelect = "none";
          handle.style.touchAction = "none";
          cell.appendChild(handle);
        }

        handle.onmousedown = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const startWidth = Math.max(100, Math.round(cell.getBoundingClientRect().width));
          dragStateRef.current = {
            colId,
            startX: e.clientX,
            startWidth,
          };
          document.body.style.cursor = "col-resize";
        };
      }
    }, [columns, customizable, ready]);

    return (
      <div className="relative">
        {customizable && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowCustomizer((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Customize table columns"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Customize
            </button>
          </div>
        )}

        {customizable && showCustomizer && columns.length > 0 && (
          <div className="mb-2 rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Columns</p>
            <div className="grid gap-2 md:grid-cols-2">
              {columns
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((col) => (
                  <div key={col.id} className="rounded-md border border-border/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={(e) => updateColumns((prev) => prev.map((c) => (
                            c.id === col.id ? { ...c, visible: e.target.checked } : c
                          )))}
                        />
                        {col.label}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-border px-1 py-0.5 text-xs hover:bg-accent"
                          onClick={() => updateColumns((prev) => {
                            const sorted = [...prev].sort((x, y) => x.order - y.order);
                            const idx = sorted.findIndex((x) => x.id === col.id);
                            if (idx <= 0) return prev;
                            const left = sorted[idx - 1];
                            const current = sorted[idx];
                            const leftOrder = left.order;
                            left.order = current.order;
                            current.order = leftOrder;
                            return [...sorted];
                          })}
                          aria-label={`Move ${col.label} left`}
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-1 py-0.5 text-xs hover:bg-accent"
                          onClick={() => updateColumns((prev) => {
                            const sorted = [...prev].sort((x, y) => x.order - y.order);
                            const idx = sorted.findIndex((x) => x.id === col.id);
                            if (idx === -1 || idx >= sorted.length - 1) return prev;
                            const right = sorted[idx + 1];
                            const current = sorted[idx];
                            const rightOrder = right.order;
                            right.order = current.order;
                            current.order = rightOrder;
                            return [...sorted];
                          })}
                          aria-label={`Move ${col.label} right`}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Drag this column edge in the table header to resize.
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="relative w-full overflow-auto">
          <table ref={tableRef} className={cn("w-full caption-bottom text-sm", className)} {...props} />
        </div>
      </div>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  )
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  )
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/70 transition-colors",
        "hover:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]",
        "data-[state=selected]:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "relative h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        "bg-[color-mix(in_srgb,var(--muted)_45%,transparent)]",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "p-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  )
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
