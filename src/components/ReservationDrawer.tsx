import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAgentSettings } from "@/lib/queries";
import { loadScheduleContext, effectiveDay, type ScheduleContext } from "@/lib/effectiveSchedule";
import type { Reservation, Zone, RestaurantTable, ReservationStatus, ReservationChannel, ScheduleRow, AgentSettings } from "@/lib/types";
import { evaluateReservationRules, appendReviewReasonsToNotes, parseReviewReasonsFromNotes } from "@/lib/reservationRules";
import { syncReservationTables, getReservationTableIds } from "@/lib/reservationTables";
import {
  TableAssignmentPicker,
  selectionFromExisting,
  persistFromSelection,
  type TableSelection,
} from "@/components/TableAssignmentPicker";
import { toast } from "sonner";
import { AlertCircle, Ban, CheckCircle2, Clock, Minus, Plus, UserX, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  modified: "Modificada",
  cancelled: "Cancelada",
  requires_human: "Requiere revisión",
  no_show: "No-show",
};

const CHANNEL_LABEL: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  future_voice: "Voz",
  external_calendar: "Externo",
};

export type DrawerMode = "create" | "edit" | "review";

export function ReservationDrawer({
  open, onOpenChange, restaurantId, initial, mode, onSaved, createDefaults,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  restaurantId: string;
  initial?: Reservation | null;
  mode: DrawerMode;
  onSaved: () => void;
  createDefaults?: Partial<Reservation>;
}) {
  const [v, setV] = useState<Partial<Reservation>>({});
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [scheduleCtx, setScheduleCtx] = useState<ScheduleContext>({ schedule: [], seasons: [], exceptions: [] });
  const [dayReservations, setDayReservations] = useState<Pick<Reservation, "reservation_time" | "party_size" | "status" | "id" | "customer_name">[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [statusManuallyChanged, setStatusManuallyChanged] = useState(false);
  const [confirmWithWarnings, setConfirmWithWarnings] = useState(false);
  const [tableSelection, setTableSelection] = useState<TableSelection>({ kind: "none" });

  useEffect(() => {
    if (!open || !restaurantId) return;
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setTables((data as RestaurantTable[]) ?? []));
    loadScheduleContext(restaurantId)
      .then(setScheduleCtx)
      .catch(() => setScheduleCtx({ schedule: [], seasons: [], exceptions: [] }));
    getAgentSettings(restaurantId).then(setAgentSettings).catch(() => setAgentSettings(null));
  }, [open, restaurantId]);

  useEffect(() => {
    setV(initial ?? {
      customer_name: "", customer_phone: "",
      reservation_date: new Date().toISOString().slice(0, 10),
      reservation_time: "20:00", party_size: 2,
      status: "confirmed" as ReservationStatus,
      channel: "manual" as ReservationChannel,
      customer_notes: "", internal_notes: "", table_id: null,
      ...(createDefaults ?? {}),
    });
    setStatusManuallyChanged(false);
  }, [initial, open, createDefaults]);

  // Initialize table selection from the loaded reservation (using reservation_tables when present).
  useEffect(() => {
    if (!open) return;
    if (!initial?.id) {
      setTableSelection({ kind: "none" });
      return;
    }
    let cancelled = false;
    getReservationTableIds(initial.id).then((ids) => {
      if (cancelled) return;
      setTableSelection(
        selectionFromExisting({ tableIds: ids, fallbackTableId: initial.table_id ?? null }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, initial?.id, initial?.table_id]);

  // Load same-day reservations to compute availability
  useEffect(() => {
    if (!open || !restaurantId || !v.reservation_date) return;
    supabase
      .from("reservations")
      .select("id, reservation_time, party_size, status, customer_name")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", v.reservation_date)
      .then(({ data }) => setDayReservations((data as any) ?? []));
  }, [open, restaurantId, v.reservation_date]);

  const time = (v.reservation_time ?? "20:00").slice(0, 5);
  const service = time < "17:00" ? "Mediodía" : "Noche";

  // Compute capacity for the selected slot
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };

  const availability = useMemo(() => {
    if (!v.reservation_date || !time) return null;
    const candidates = effectiveDay(scheduleCtx, v.reservation_date).services;
    const row = candidates.find((s) => {
      const open = s.opening_time!.slice(0, 5);
      const close = s.closing_time!.slice(0, 5);
      return time >= open && time < close;
    });
    if (!row) return { outOfService: true as const };
    const capacity = row.max_guests_per_slot ?? 0;
    if (!capacity) return null;
    const step = row.slot_duration_minutes ?? 30;
    const openMin = toMin(row.opening_time!);
    const start = toMin(time);
    const slotStart = openMin + Math.floor((start - openMin) / step) * step;
    const slotEnd = slotStart + step;
    const active = new Set(["pending", "confirmed", "modified", "requires_human"]);
    const occupied = dayReservations
      .filter((r) => {
        if (initial?.id && r.id === initial.id) return false;
        if (!active.has(r.status as string)) return false;
        const mins = toMin(r.reservation_time);
        return mins >= slotStart && mins < slotEnd;
      })
      .reduce((acc, r) => acc + Math.max(0, r.party_size ?? 0), 0);
    const free = Math.min(capacity, Math.max(0, capacity - occupied));
    return { free, capacity, service, outOfService: false as const };
  }, [scheduleCtx, dayReservations, v.reservation_date, time, initial?.id, service]);

  const partySize = Number(v.party_size ?? 0);
  const overCapacity =
    availability && !availability.outOfService ? partySize > availability.free : false;

  const evaluation = useMemo(() => {
    const avail = availability
      ? {
          outOfService: !!availability.outOfService,
          free: availability.outOfService ? null : availability.free,
          capacity: availability.outOfService ? null : availability.capacity,
          service: null as null,
        }
      : null;
    return evaluateReservationRules(
      {
        customer_name: v.customer_name,
        customer_phone: v.customer_phone,
        reservation_date: v.reservation_date,
        reservation_time: v.reservation_time,
        party_size: v.party_size,
        id: initial?.id,
      },
      agentSettings,
      avail,
      dayReservations,
    );
  }, [v, availability, agentSettings, dayReservations, initial?.id]);

  async function save(extra?: Partial<Reservation>) {
    // For new manual reservations, apply confirmation rules
    const isNewManual = !initial && !extra?.status;
    let appliedStatus: ReservationStatus | undefined = extra?.status as ReservationStatus | undefined;
    let appliedNotes = v.internal_notes ?? "";
    if (isNewManual) {
      if (!evaluation || !evaluation.canSave) {
        toast.error(evaluation?.blockingReason ?? "Revisa los datos de la reserva.");
        return;
      }
      appliedStatus = (evaluation.suggestedStatus ?? "confirmed") as ReservationStatus;
      if (appliedStatus === "requires_human") {
        appliedNotes = appendReviewReasonsToNotes(v.internal_notes, evaluation.reviewReasons);
      }
    } else if (initial && !extra?.status) {
      // Edit path: apply same rules but respect manual status override
      if (!evaluation || !evaluation.canSave) {
        toast.error(evaluation?.blockingReason ?? "Revisa los datos de la reserva.");
        return;
      }
      if (!statusManuallyChanged && evaluation.suggestedStatus === "requires_human") {
        appliedStatus = "requires_human" as ReservationStatus;
        appliedNotes = appendReviewReasonsToNotes(v.internal_notes, evaluation.reviewReasons);
      }
    }
    setSaving(true);
    const { tableId: selTableId, tableIds: selTableIds } = persistFromSelection(tableSelection);
    const payload = {
      ...v,
      ...extra,
      internal_notes: appliedNotes,
      restaurant_id: restaurantId,
      // Defaults for manual creation
      status: (appliedStatus ?? v.status ?? "confirmed") as ReservationStatus,
      channel: (v.channel ?? "manual") as ReservationChannel,
      table_id: selTableId,
    } as any;
    let savedId: string | null = initial?.id ?? null;
    if (initial?.id) {
      const { error } = await supabase.from("reservations").update(payload).eq("id", initial.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase
        .from("reservations")
        .insert(payload)
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      savedId = (data as { id: string } | null)?.id ?? null;
    }
    if (savedId) {
      await syncReservationTables(savedId, selTableIds);
    }
    setSaving(false);
    if (initial) {
      toast.success("Cambios guardados.");
    } else if (appliedStatus === "requires_human") {
      toast.success("Reserva guardada para revisar.");
    } else {
      toast.success("Reserva guardada.");
    }
    onOpenChange(false);
    onSaved();
  }

  const isReview = mode === "review";
  const isEdit = mode === "edit" && !!initial;
  const title = isReview ? "Revisar reserva" : isEdit ? "Editar reserva" : "Nueva reserva";
  const editSubtitle = isEdit
    ? `${(initial?.customer_name ?? "Reserva").trim()} · ${initial?.party_size ?? v.party_size ?? 0} ${
        (initial?.party_size ?? 0) === 1 ? "persona" : "personas"
      } · ${(initial?.reservation_time ?? "").slice(0, 5)}`
    : "";
  const reviewChannel = (v.channel as string) || (initial?.channel as string) || "manual";
  const reviewSubtitle =
    reviewChannel === "future_voice" ? "Creada por voz" :
    reviewChannel === "whatsapp" ? "WhatsApp" :
    reviewChannel === "external_calendar" ? "Calendario externo" :
    "Reserva manual";
  const subtitle = isReview ? reviewSubtitle : isEdit ? editSubtitle : "Reserva manual";

  // Aggregate review reasons: live evaluation + persisted notes
  const persistedReasons = useMemo(
    () => parseReviewReasonsFromNotes(v.internal_notes),
    [v.internal_notes],
  );
  const allReviewReasons = useMemo(() => {
    const set = new Set<string>();
    (evaluation?.reviewReasons ?? []).forEach((r) => set.add(r));
    // Only show persisted reasons that are still relevant — keep them if we can't infer otherwise
    if (!evaluation || evaluation.reviewReasons.length === 0) {
      persistedReasons.forEach((r) => set.add(r));
    } else {
      persistedReasons.forEach((r) => set.add(r));
    }
    if (reviewChannel === "future_voice" && !set.has("Creada por voz.")) {
      // soft note for voice provenance
    }
    return Array.from(set);
  }, [evaluation, persistedReasons, reviewChannel]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const canMarkNoShow =
    isEdit &&
    initial?.reservation_date === todayISO &&
    (initial?.reservation_time ?? "").slice(0, 5) <= nowHHMM &&
    initial?.status !== "cancelled" &&
    initial?.status !== "no_show";

  async function quickStatusChange(status: ReservationStatus, msg: string) {
    if (!initial?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("reservations")
      .update({ status })
      .eq("id", initial.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(msg);
    onOpenChange(false);
    onSaved();
  }

  /** Review-mode save: persists current form. Optionally forces status. */
  async function reviewSave(opts: { status?: ReservationStatus; confirmAnyway?: boolean; successMsg: string }) {
    if (!v.customer_name || !v.customer_name.trim()) { toast.error("Introduce el nombre del cliente."); return; }
    if (!partySize || partySize < 1) { toast.error("Indica el número de personas."); return; }
    if (!v.reservation_date || !v.reservation_time) { toast.error("Selecciona fecha y hora."); return; }
    if (evaluation?.blockingReason) { toast.error(evaluation.blockingReason); return; }

    let notes = v.internal_notes ?? "";
    if (opts.status === "confirmed" && opts.confirmAnyway && allReviewReasons.length > 0) {
      const line = `Confirmada manualmente con avisos pendientes: ${allReviewReasons.map((r) => r.replace(/\.$/, "")).join("; ")}.`;
      notes = notes.trim() ? `${notes.trim()}\n${line}` : line;
    }

    setSaving(true);
    const { tableId: selTableId, tableIds: selTableIds } = persistFromSelection(tableSelection);
    const payload: any = {
      ...v,
      internal_notes: notes,
      restaurant_id: restaurantId,
      table_id: selTableId,
    };
    if (opts.status) payload.status = opts.status;
    let savedId: string | null = initial?.id ?? null;
    if (initial?.id) {
      const { error } = await supabase.from("reservations").update(payload).eq("id", initial.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase
        .from("reservations")
        .insert(payload)
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      savedId = (data as { id: string } | null)?.id ?? null;
    }
    if (savedId) {
      await syncReservationTables(savedId, selTableIds);
    }
    setSaving(false);
    toast.success(opts.successMsg);
    onOpenChange(false);
    onSaved();
  }

  function onReviewConfirmClick() {
    if (evaluation?.blockingReason) {
      toast.error(evaluation.blockingReason);
      return;
    }
    if (allReviewReasons.length > 0) {
      setConfirmWithWarnings(true);
      return;
    }
    reviewSave({ status: "confirmed" as ReservationStatus, successMsg: "Reserva confirmada." });
  }

  const missingPhone = !v.customer_phone || v.customer_phone.trim().length < 6;
  const nameValid = !!(v.customer_name && v.customer_name.trim());
  const isCreate = !initial && mode === "create";
  const canSubmit = (isCreate || isEdit) ? !!evaluation?.canSave : nameValid && partySize >= 1 && !!v.reservation_date && !!v.reservation_time;
  const createButtonLabel =
    evaluation?.suggestedStatus === "requires_human" ? "Guardar para revisar" : "Guardar reserva";

  function bumpParty(delta: number) {
    const next = Math.min(30, Math.max(1, partySize + delta));
    setV({ ...v, party_size: next });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:min-w-[480px] sm:max-w-[520px] bg-card p-0 flex flex-col gap-0"
      >
        {/* Fixed header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-2xl tracking-tight leading-tight">{title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

        {isEdit && initial && (
          <div className="mb-5 rounded-[14px] border border-border bg-secondary/40 px-4 py-3">
            <p className="font-medium text-foreground">{initial.customer_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date((initial.reservation_date as string) + "T00:00:00").toLocaleDateString("es-ES")} ·{" "}
              {(initial.reservation_time ?? "").slice(0, 5)} · {initial.party_size}{" "}
              {initial.party_size === 1 ? "persona" : "personas"}
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                {STATUS_LABEL[initial.status as string] ?? initial.status}
              </span>
              <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {CHANNEL_LABEL[initial.channel as string] ?? initial.channel}
              </span>
            </div>
          </div>
        )}

        {isReview && (
          <>
            {/* Banner de revisión */}
            <div className="mb-4 rounded-2xl border border-terracotta/30 bg-terracotta/10 p-4 space-y-2">
              <p className="font-medium text-terracotta flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Esta reserva necesita revisión.
              </p>
              {allReviewReasons.length > 0 ? (
                <ul className="ml-6 list-disc text-xs text-terracotta space-y-0.5">
                  {allReviewReasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              ) : (
                <p className="ml-6 text-xs text-terracotta/80">Revisa los datos y confirma cuando todo sea correcto.</p>
              )}
            </div>

            {/* Datos detectados */}
            <div className="mb-5 rounded-2xl border border-border bg-secondary/40 p-4 space-y-1.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {reviewChannel === "future_voice" ? "El agente entendió" : "Datos actuales"}
              </p>
              <p><span className="text-muted-foreground">Nombre · </span><span className="font-medium">{v.customer_name || "—"}</span></p>
              <p><span className="text-muted-foreground">Personas · </span>{v.party_size}</p>
              <p><span className="text-muted-foreground">Fecha · </span>{v.reservation_date}</p>
              <p><span className="text-muted-foreground">Hora · </span>{(v.reservation_time ?? "").slice(0, 5)}</p>
              <p>
                <span className="text-muted-foreground">Teléfono · </span>
                {v.customer_phone || <span className="text-terracotta">{reviewChannel === "future_voice" ? "no detectado" : "no facilitado"}</span>}
              </p>
              {v.customer_notes && <p><span className="text-muted-foreground">Nota · </span>{v.customer_notes}</p>}
            </div>
          </>
        )}

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos esenciales</h3>
            <div className="space-y-1.5">
              <Label>Nombre del cliente <span className="text-terracotta">*</span></Label>
              <Input
                value={v.customer_name ?? ""}
                onBlur={() => setNameTouched(true)}
                onChange={(e) => setV({ ...v, customer_name: e.target.value })}
              />
              {nameTouched && !nameValid && (
                <p className="text-xs text-terracotta">Introduce el nombre del cliente.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Personas <span className="text-terracotta">*</span></Label>
                <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 transition-shadow">
                  <button
                    type="button"
                    onClick={() => bumpParty(-1)}
                    disabled={partySize <= 1}
                    className="px-3 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                    aria-label="Restar persona"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={partySize || ""}
                    onChange={(e) => {
                      const n = Math.min(30, Math.max(1, Number(e.target.value) || 1));
                      setV({ ...v, party_size: n });
                    }}
                    className="flex-1 w-full text-center bg-transparent outline-none text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => bumpParty(1)}
                    disabled={partySize >= 30}
                    className="px-3 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                    aria-label="Sumar persona"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={v.customer_phone ?? ""} onChange={(e) => setV({ ...v, customer_phone: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fecha y hora</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha <span className="text-terracotta">*</span></Label>
                <Input type="date" value={v.reservation_date ?? ""} onChange={(e) => setV({ ...v, reservation_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora <span className="text-terracotta">*</span></Label>
                <Input type="time" value={(v.reservation_time ?? "").slice(0, 5)} onChange={(e) => setV({ ...v, reservation_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Servicio detectado: <span className="font-medium text-foreground">{service}</span>
              </p>
              {availability?.outOfService ? (
                <p className="text-xs text-terracotta">
                  Esta hora está fuera del horario habitual.
                </p>
              ) : availability ? (
                availability.free === 0 ? (
                  <p className="text-xs text-terracotta font-medium">
                    {service} · franja completa
                  </p>
                ) : overCapacity ? (
                  <p className="text-xs text-terracotta font-medium">
                    Esta franja no tiene plazas suficientes ({availability.free} libres).
                  </p>
                ) : availability.free <= 4 ? (
                  <p className="text-xs text-warning-foreground">
                    {service} · quedan pocas plazas en esta franja
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {service} · <span className="text-foreground font-medium">{availability.free} plazas libres</span> en esta franja
                  </p>
                )
              ) : null}
            </div>
          </section>

          {(isCreate || isEdit || isReview) && evaluation && (evaluation.blockingReason || (!isReview && evaluation.reviewReasons.length > 0) || evaluation.warnings.length > 0 || (isEdit && statusManuallyChanged && v.status === "confirmed" && evaluation.reviewReasons.length > 0)) && (
            <div className="space-y-2">
              {evaluation.blockingReason && (nameTouched || isEdit || isReview || evaluation.blockingReason !== "Introduce el nombre del cliente.") && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{evaluation.blockingReason}</span>
                </div>
              )}
              {!evaluation.blockingReason && !isReview && evaluation.reviewReasons.length > 0 && (
                <div className="rounded-xl border border-terracotta/30 bg-terracotta/10 px-3 py-2.5 text-sm text-terracotta space-y-1">
                  <p className="flex items-start gap-2 font-medium">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {isEdit && statusManuallyChanged && v.status === "confirmed"
                      ? "Esta reserva tiene motivos de revisión. Puedes guardarla como confirmada bajo tu responsabilidad."
                      : "Esta reserva requerirá revisión."}
                  </p>
                  <ul className="ml-6 list-disc text-xs space-y-0.5">
                    {evaluation.reviewReasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}
              {!evaluation.blockingReason && evaluation.warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{evaluation.warnings.join(" ")}</span>
                </div>
              )}
            </div>
          )}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asignación de mesa</h3>
            <TableAssignmentPicker
              restaurantId={restaurantId}
              date={v.reservation_date}
              time={(v.reservation_time ?? "").slice(0, 5)}
              partySize={partySize}
              excludeReservationId={initial?.id}
              value={tableSelection}
              onChange={setTableSelection}
              currentAssignmentLabel={(() => {
                if (tableSelection.kind === "table") {
                  const t = tables.find((x) => x.id === tableSelection.tableId);
                  return t ? t.label : null;
                }
                if (tableSelection.kind === "combo") {
                  return tableSelection.tableIds
                    .map((id) => tables.find((t) => t.id === id)?.label)
                    .filter(Boolean)
                    .join(" + ") || null;
                }
                return null;
              })()}
            />
            {isEdit && v.reservation_date === todayISO && (v.status === "confirmed" || v.status === "pending") && tableSelection.kind === "none" && (() => {
                const now = new Date();
                const [h, m] = (v.reservation_time ?? "00:00").slice(0, 5).split(":").map(Number);
                const resTime = new Date();
                resTime.setHours(h, m, 0, 0);
                const diffMin = (resTime.getTime() - now.getTime()) / 60000;
                if (diffMin <= 0 || diffMin > 60) return null;
                return (
                  <p className="text-xs text-warning-foreground flex items-start gap-1.5 mt-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Esta reserva está próxima y todavía no tiene mesa asignada.</span>
                  </p>
                );
              })()}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</h3>
            <div className="space-y-1.5">
              <Label>Notas del cliente</Label>
              <Textarea
                rows={2}
                placeholder="Ej. Prefiere terraza, sin gluten, carrito de bebé…"
                className="min-h-[72px]"
                value={v.customer_notes ?? ""}
                onChange={(e) => setV({ ...v, customer_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea
                rows={2}
                placeholder="Ej. Cliente habitual, confirmar teléfono…"
                className="min-h-[72px]"
                value={v.internal_notes ?? ""}
                onChange={(e) => setV({ ...v, internal_notes: e.target.value })}
              />
            </div>
          </section>
        </div>

          {(isEdit || isReview) && (
            <>
              {isEdit && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado de la reserva
                </h3>
                <Select
                  value={(v.status as string) ?? "confirmed"}
                  onValueChange={(x) => { setV({ ...v, status: x as ReservationStatus }); setStatusManuallyChanged(true); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["pending", "confirmed", "modified", "cancelled", "requires_human", "no_show"] as const).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Origen: <span className="text-foreground font-medium">{CHANNEL_LABEL[(v.channel as string) ?? "manual"]}</span>
                </p>
              </section>
              )}
              {isReview && (
                <p className="text-xs text-muted-foreground">
                  Origen: <span className="text-foreground font-medium">{CHANNEL_LABEL[(v.channel as string) ?? "manual"]}</span>
                </p>
              )}

              <section className="space-y-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Acciones de reserva
                </h3>
                <div className="flex flex-wrap gap-2">
                  {isReview && (
                    <button
                      type="button"
                      onClick={() => reviewSave({ status: "pending" as ReservationStatus, successMsg: "Reserva marcada como pendiente." })}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5" /> Mantener pendiente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    disabled={initial?.status === "cancelled"}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-terracotta hover:bg-terracotta/10 disabled:opacity-40 transition-colors"
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancelar reserva
                  </button>
                  {canMarkNoShow && (
                    <button
                      type="button"
                      onClick={() => setConfirmNoShow(true)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <UserX className="h-3.5 w-3.5" /> Marcar no-show
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  La reserva dejará de contar para la ocupación.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Compact summary */}
        {!isReview && v.reservation_date && v.reservation_time && partySize >= 1 && (
          <div className="border-t border-border bg-secondary/30 px-6 py-2.5 text-xs text-muted-foreground">
            {nameValid && (
              <span className="font-medium text-foreground">{v.customer_name!.trim()} · </span>
            )}
            <span>{partySize} {partySize === 1 ? "persona" : "personas"}</span>
            <span> · {new Date(v.reservation_date + "T00:00:00").toLocaleDateString("es-ES")}</span>
            <span> · {time}</span>
            <span> · {service}</span>
          </div>
        )}

        {/* Fixed footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {isReview ? (
            <>
              <Button
                variant="outline"
                onClick={() => reviewSave({ successMsg: "Cambios guardados." })}
                disabled={saving || !!evaluation?.blockingReason}
              >
                Guardar cambios
              </Button>
              <Button onClick={onReviewConfirmClick} disabled={saving || !!evaluation?.blockingReason}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar reserva
              </Button>
            </>
          ) : (
            <Button onClick={() => save()} disabled={saving || !canSubmit}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : createButtonLabel}
            </Button>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              La reserva quedará marcada como cancelada y no contará para la ocupación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => quickStatusChange("cancelled" as ReservationStatus, "Reserva cancelada.")}>
              Sí, cancelar reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmNoShow} onOpenChange={setConfirmNoShow}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como no-show?</AlertDialogTitle>
            <AlertDialogDescription>
              La reserva quedará marcada como no-show y no contará para la ocupación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => quickStatusChange("no_show" as ReservationStatus, "Reserva marcada como no-show.")}>
              Sí, marcar no-show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmWithWarnings} onOpenChange={setConfirmWithWarnings}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta reserva todavía tiene avisos</AlertDialogTitle>
            <AlertDialogDescription>
              La reserva aún tiene motivos de revisión. Puedes confirmarla igualmente si ya lo has comprobado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {allReviewReasons.length > 0 && (
            <ul className="ml-5 list-disc text-sm text-muted-foreground space-y-0.5">
              {allReviewReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reviewSave({ status: "confirmed" as ReservationStatus, confirmAnyway: true, successMsg: "Reserva confirmada." })}
            >
              Confirmar igualmente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}