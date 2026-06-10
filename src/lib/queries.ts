import { supabase } from "@/integrations/supabase/client";
import type {
  Restaurant,
  Reservation,
  ScheduleRow,
  Faq,
  AgentSettings,
  NotificationSettings,
  HandoffRequest,
  ExternalCalendarSettings,
  Profile,
  ScheduleSeason,
  ScheduleException,
} from "./types";

export async function listRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase.from("restaurants").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as Restaurant[];
}

export async function getRestaurant(id: string): Promise<Restaurant | null> {
  const { data, error } = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Restaurant | null;
}

export async function listReservations(restaurantId?: string): Promise<Reservation[]> {
  let q = supabase.from("reservations").select("*").order("reservation_date", { ascending: false }).order("reservation_time", { ascending: true });
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  const { data, error } = await q;
  if (error) throw error;
  return data as Reservation[];
}

export async function listSchedule(restaurantId: string): Promise<ScheduleRow[]> {
  const { data, error } = await supabase
    .from("restaurant_schedule")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week");
  if (error) throw error;
  return data as ScheduleRow[];
}

export async function listSeasons(restaurantId: string): Promise<ScheduleSeason[]> {
  const { data, error } = await supabase
    .from("schedule_seasons")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleSeason[];
}

export async function listExceptions(restaurantId: string): Promise<ScheduleException[]> {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleException[];
}

export async function listFaqs(restaurantId: string): Promise<Faq[]> {
  const { data, error } = await supabase.from("faqs").select("*").eq("restaurant_id", restaurantId).order("created_at");
  if (error) throw error;
  return data as Faq[];
}

export async function getAgentSettings(restaurantId: string): Promise<AgentSettings | null> {
  const { data, error } = await supabase.from("agent_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw error;
  return data as AgentSettings | null;
}

export async function getNotificationSettings(restaurantId: string): Promise<NotificationSettings | null> {
  const { data, error } = await supabase.from("notification_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw error;
  return data as NotificationSettings | null;
}

export async function listHandoff(restaurantId?: string): Promise<HandoffRequest[]> {
  let q = supabase.from("human_handoff_requests").select("*").order("created_at", { ascending: false });
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  const { data, error } = await q;
  if (error) throw error;
  return data as HandoffRequest[];
}

export async function getExternalCalendar(restaurantId: string): Promise<ExternalCalendarSettings | null> {
  const { data, error } = await supabase
    .from("external_calendar_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data as ExternalCalendarSettings | null;
}

export async function listManagerProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "restaurant_admin");
  if (error) throw error;
  return data as Profile[];
}

/** Placeholder de notificaciones — se conectará a una edge function en una fase posterior. */
export function notifyManager(payload: Record<string, unknown>) {
  console.info("[notifyManager placeholder]", payload);
}
export function sendWhatsAppMessage(payload: Record<string, unknown>) {
  console.info("[sendWhatsAppMessage placeholder]", payload);
}