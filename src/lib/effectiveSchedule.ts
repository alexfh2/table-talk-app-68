import { supabase } from "@/integrations/supabase/client";
import type {
  ScheduleRow,
  ScheduleSeason,
  ScheduleException,
} from "./types";

export interface ScheduleContext {
  schedule: ScheduleRow[];
  seasons: ScheduleSeason[];
  exceptions: ScheduleException[];
}

export interface EffectiveDay {
  date: string;
  dow: number;
  source: "exception" | "season" | "base";
  seasonId: string | null;
  exceptionId?: string;
  isClosed: boolean;
  /** Service rows applicable that day (already filtered by season + exceptions). */
  services: ScheduleRow[];
}

export async function loadScheduleContext(restaurantId: string): Promise<ScheduleContext> {
  const [sched, seas, exc] = await Promise.all([
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", restaurantId),
    supabase.from("schedule_seasons").select("*").eq("restaurant_id", restaurantId),
    supabase.from("blocked_dates").select("*").eq("restaurant_id", restaurantId),
  ]);
  return {
    schedule: (sched.data ?? []) as ScheduleRow[],
    seasons: (seas.data ?? []) as ScheduleSeason[],
    exceptions: (exc.data ?? []) as ScheduleException[],
  };
}

function activeSeasonFor(seasons: ScheduleSeason[], dateStr: string): ScheduleSeason | null {
  const matches = seasons.filter((s) => s.start_date <= dateStr && s.end_date >= dateStr);
  if (!matches.length) return null;
  // Higher priority wins; tie-break: most recent start_date.
  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.start_date < b.start_date ? 1 : -1;
  });
  return matches[0];
}

/**
 * Returns the effective schedule for a given date, applying priority:
 *   Exception > Season > Base.
 */
export function effectiveDay(ctx: ScheduleContext, dateStr: string): EffectiveDay {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const season = activeSeasonFor(ctx.seasons, dateStr);
  const seasonId = season?.id ?? null;

  let services: ScheduleRow[] = ctx.schedule
    .filter(
      (r) =>
        r.day_of_week === dow &&
        (r.season_id ?? null) === seasonId &&
        r.is_open &&
        r.opening_time &&
        r.closing_time,
    )
    .map((r) => ({ ...r }));

  let source: EffectiveDay["source"] = season ? "season" : "base";
  let exceptionId: string | undefined;

  const exs = ctx.exceptions.filter((e) => e.date === dateStr);
  for (const ex of exs) {
    source = "exception";
    exceptionId = ex.id;
    const affected: Array<"lunch" | "dinner"> =
      ex.service_period === "lunch"
        ? ["lunch"]
        : ex.service_period === "dinner"
        ? ["dinner"]
        : ["lunch", "dinner"];

    if (ex.kind === "closed" || ex.kind === "private_event") {
      services = services.filter((s) => !affected.includes(s.service_period));
    } else if (ex.kind === "special_hours" || ex.kind === "extra_service") {
      for (const p of affected) {
        if (!ex.start_time || !ex.end_time) continue;
        const synth: ScheduleRow = {
          id: `exception-${ex.id}-${p}`,
          restaurant_id: ex.restaurant_id,
          day_of_week: dow,
          is_open: true,
          opening_time: ex.start_time,
          closing_time: ex.end_time,
          service_name: ex.reason ?? (p === "lunch" ? "Mediodía" : "Noche"),
          max_guests_per_slot: ex.max_guests_per_slot,
          max_reservations_per_slot: ex.max_reservations_per_slot,
          slot_duration_minutes: ex.slot_duration_minutes ?? 30,
          booking_mode: (ex.booking_mode as "slots" | "shifts") ?? "slots",
          shift_times: ex.shift_times,
          service_period: p,
          season_id: null,
        };
        services = services.filter((s) => s.service_period !== p);
        services.push(synth);
      }
    }
  }

  services.sort((a, b) => (a.opening_time! < b.opening_time! ? -1 : 1));

  return {
    date: dateStr,
    dow,
    source,
    seasonId,
    exceptionId,
    isClosed: services.length === 0,
    services,
  };
}

/** Detect overlapping seasons for validation. Returns the conflicting season, if any. */
export function findOverlappingSeason(
  seasons: ScheduleSeason[],
  start: string,
  end: string,
  ignoreId?: string,
): ScheduleSeason | null {
  return (
    seasons.find(
      (s) => s.id !== ignoreId && s.start_date <= end && s.end_date >= start,
    ) ?? null
  );
}