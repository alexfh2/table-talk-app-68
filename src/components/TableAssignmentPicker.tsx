import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  getAvailableTableOptions,
  type AvailableTableOptions,
} from "@/lib/getAvailableTableOptions";

export type TableSelection =
  | { kind: "none" }
  | { kind: "table"; tableId: string }
  | { kind: "combo"; combinationId: string; tableIds: string[] };

function selectionKey(s: TableSelection): string {
  if (s.kind === "none") return "none";
  if (s.kind === "table") return `t:${s.tableId}`;
  return `c:${s.combinationId}`;
}

/**
 * Reusable table assignment picker. Loads available individual tables and
 * combinations for the supplied slot, and exposes the selection as a
 * `TableSelection` value.
 *
 * Pass `currentSelection` so that, in edit mode, the existing assignment
 * stays visible even if it is no longer "available" for the new slot.
 */
export function TableAssignmentPicker({
  restaurantId,
  date,
  time,
  partySize,
  excludeReservationId,
  value,
  onChange,
  /** Used to render and keep the current assignment visible in edit mode. */
  currentAssignmentLabel,
}: {
  restaurantId: string;
  date: string | undefined;
  time: string | undefined;
  partySize: number;
  excludeReservationId?: string;
  value: TableSelection;
  onChange: (s: TableSelection) => void;
  currentAssignmentLabel?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AvailableTableOptions | null>(null);

  const ready = !!(restaurantId && date && time && partySize > 0);

  useEffect(() => {
    if (!ready) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAvailableTableOptions({
      restaurantId,
      date: date!,
      time: time!,
      partySize,
      excludeReservationId,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, restaurantId, date, time, partySize, excludeReservationId]);

  const currentStillAvailable = useMemo(() => {
    if (!result || value.kind === "none") return true;
    if (value.kind === "table") return result.individualTables.some((t) => t.id === value.tableId);
    return result.combinations.some((c) => c.combination.id === value.combinationId);
  }, [result, value]);

  if (!ready) {
    return (
      <p className="text-xs text-muted-foreground">
        Introduce fecha, hora y número de personas para ver mesas disponibles.
      </p>
    );
  }

  const selectedKey = selectionKey(value);
  const hasOptions =
    !!result && (result.individualTables.length > 0 || result.combinations.length > 0);

  return (
    <div className="space-y-3">
      {loading && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando mesas…
        </p>
      )}

      {!currentStillAvailable && value.kind !== "none" && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            La asignación actual{currentAssignmentLabel ? ` (${currentAssignmentLabel})` : ""} puede
            no estar disponible para esta nueva hora.
          </span>
        </div>
      )}

      {result && result.individualTables.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mesas individuales
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {result.individualTables.map((t) => {
              const key = `t:${t.id}`;
              const selected = selectedKey === key;
              return (
                <OptionCard
                  key={t.id}
                  selected={selected}
                  onClick={() => onChange({ kind: "table", tableId: t.id })}
                  title={t.label}
                  subtitle={`${t.min_capacity}–${t.max_capacity} personas`}
                />
              );
            })}
          </div>
        </div>
      )}

      {result && result.combinations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mesas unidas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {result.combinations.map((c) => {
              const key = `c:${c.combination.id}`;
              const selected = selectedKey === key;
              const tablesLabel = c.tables.map((t) => t.label).join(" + ");
              const zoneLabel = c.zone ? c.zone.name : "";
              const cap = `${c.combination.min_capacity ?? 1}–${c.combination.max_capacity} personas`;
              return (
                <OptionCard
                  key={c.combination.id}
                  selected={selected}
                  onClick={() =>
                    onChange({
                      kind: "combo",
                      combinationId: c.combination.id,
                      tableIds: c.tables.map((t) => t.id),
                    })
                  }
                  title={tablesLabel}
                  subtitle={[zoneLabel, cap].filter(Boolean).join(" · ")}
                />
              );
            })}
          </div>
        </div>
      )}

      {result && !hasOptions && (
        <p className="text-xs text-terracotta">
          No hay mesas disponibles para esta hora.
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sin asignar
        </p>
        <OptionCard
          selected={selectedKey === "none"}
          onClick={() => onChange({ kind: "none" })}
          title="Decidir más tarde"
          subtitle={hasOptions ? "Guardar sin mesa" : "Guardar sin mesa"}
        />
      </div>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-left rounded-xl border px-3 py-2 transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border bg-background hover:bg-secondary/50",
      ].join(" ")}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
    </button>
  );
}

/** Build the initial selection from existing reservation data. */
export function selectionFromExisting(opts: {
  tableIds: string[]; // from reservation_tables, primary
  fallbackTableId: string | null;
}): TableSelection {
  const ids = opts.tableIds.length > 0
    ? opts.tableIds
    : (opts.fallbackTableId ? [opts.fallbackTableId] : []);
  if (ids.length === 0) return { kind: "none" };
  if (ids.length === 1) return { kind: "table", tableId: ids[0] };
  // Multi-table without a matching combination row; we represent it as a synthetic combo selection.
  return { kind: "combo", combinationId: `manual:${ids.join("+")}`, tableIds: ids };
}

/** Resolve a selection into the data needed to persist a reservation. */
export function persistFromSelection(selection: TableSelection): {
  tableId: string | null;
  tableIds: string[];
} {
  if (selection.kind === "none") return { tableId: null, tableIds: [] };
  if (selection.kind === "table") return { tableId: selection.tableId, tableIds: [selection.tableId] };
  const first = selection.tableIds[0] ?? null;
  return { tableId: first, tableIds: selection.tableIds };
}