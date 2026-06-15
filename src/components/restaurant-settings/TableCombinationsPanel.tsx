import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Zone, RestaurantTable, TableCombination } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableCombinationDrawer } from "./TableCombinationDrawer";

type ComboRow = {
  combination: TableCombination;
  tableIds: string[];
};

export function TableCombinationsPanel({
  restaurantId,
  zones,
  tables,
}: {
  restaurantId: string;
  zones: Zone[];
  tables: RestaurantTable[];
}) {
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ComboRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ComboRow | null>(null);

  async function reload() {
    if (!restaurantId) return;
    setLoading(true);
    const { data: combosData, error: e1 } = await supabase
      .from("table_combinations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
    if (e1) {
      toast.error(e1.message);
      setLoading(false);
      return;
    }
    const ids = (combosData ?? []).map((c: any) => c.id);
    let memberMap = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: members, error: e2 } = await supabase
        .from("table_combination_tables")
        .select("combination_id, table_id, sort_order")
        .in("combination_id", ids)
        .order("sort_order", { ascending: true });
      if (e2) {
        toast.error(e2.message);
      } else {
        for (const m of (members ?? []) as any[]) {
          const arr = memberMap.get(m.combination_id) ?? [];
          arr.push(m.table_id);
          memberMap.set(m.combination_id, arr);
        }
      }
    }
    setCombos(
      ((combosData ?? []) as TableCombination[]).map((c) => ({
        combination: c,
        tableIds: memberMap.get(c.id) ?? [],
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  async function doDelete(row: ComboRow) {
    const { error } = await supabase
      .from("table_combinations")
      .delete()
      .eq("id", row.combination.id);
    if (error) return toast.error(error.message);
    toast.success("Combinación eliminada.");
    reload();
  }

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(row: ComboRow) {
    setEditing(row);
    setDrawerOpen(true);
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Mesas que se pueden unir</p>
            <p className="text-xs text-muted-foreground">
              Define qué mesas pueden juntarse para reservas grandes.
            </p>
          </div>
          <Button size="sm" onClick={openCreate} disabled={zones.length === 0 || tables.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Crear combinación
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : combos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay combinaciones. Crea una para permitir reservas que ocupen varias mesas.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {combos.map((row) => {
              const c = row.combination;
              const zoneName = c.zone_id ? zoneById.get(c.zone_id)?.name : null;
              const labels = row.tableIds
                .map((id) => tableById.get(id)?.label)
                .filter(Boolean) as string[];
              const capacity =
                c.min_capacity != null
                  ? `${c.min_capacity}–${c.max_capacity} personas`
                  : `${c.max_capacity} personas`;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-background/40 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {zoneName ?? "Sin zona"} · {capacity}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                        c.is_active
                          ? "bg-success/10 text-success border-success/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {c.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mesas incluidas:{" "}
                    <span className="text-foreground">
                      {labels.length > 0 ? labels.join(", ") : "—"}
                    </span>
                  </p>
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <TableCombinationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        restaurantId={restaurantId}
        zones={zones}
        tables={tables}
        initial={editing}
        existingCombos={combos}
        onSaved={reload}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(b) => !b && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar combinación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la combinación "{confirmDelete?.combination.name}"? Las mesas individuales no se borran.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) doDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}