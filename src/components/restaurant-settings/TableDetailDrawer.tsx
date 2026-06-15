import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { RestaurantTable, Zone, TableCombination } from "@/lib/types";
import { Link2, Plus, X } from "lucide-react";

type ComboRow = {
  combination: TableCombination;
  tableIds: string[];
};

export function TableDetailDrawer({
  open,
  onOpenChange,
  table,
  zone,
  tables,
  combos,
  onEditCombo,
  onCreateComboWithTable,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  table: RestaurantTable | null;
  zone: Zone | null;
  tables: RestaurantTable[];
  combos: ComboRow[];
  onEditCombo: (c: ComboRow) => void;
  onCreateComboWithTable: (t: RestaurantTable) => void;
}) {
  if (!table) return null;
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const myCombos = combos.filter((c) => c.tableIds.includes(table.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:min-w-[420px] sm:max-w-[460px] bg-card p-0 flex flex-col gap-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-2xl tracking-tight leading-tight">Mesa {table.label}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(zone?.name ? `${zone.name} · ` : "")}{table.min_capacity}–{table.max_capacity} personas
              {!table.is_active && " · Inactiva"}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {table.internal_notes && (
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
              {table.internal_notes}
            </div>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Puede unirse con
              </h3>
              {table.is_active && (
                <Button size="sm" variant="ghost" onClick={() => onCreateComboWithTable(table)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Crear combinación con esta mesa
                </Button>
              )}
            </div>
            {myCombos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta mesa todavía no forma parte de ninguna combinación.
              </p>
            ) : (
              <ul className="space-y-2">
                {myCombos.map((row) => {
                  const partners = row.tableIds
                    .filter((id) => id !== table.id)
                    .map((id) => tableById.get(id)?.label)
                    .filter(Boolean)
                    .join(", ");
                  const cap =
                    row.combination.min_capacity != null
                      ? `${row.combination.min_capacity}–${row.combination.max_capacity} personas`
                      : `${row.combination.max_capacity} personas`;
                  return (
                    <li
                      key={row.combination.id}
                      className="rounded-lg border border-border bg-background/40 px-3 py-2 flex items-center gap-3"
                    >
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {partners || "—"} · {row.combination.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cap}
                          {!row.combination.is_active && " · Inactiva"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => onEditCombo(row)}>
                        Editar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}