export type UserRole = "platform_admin" | "restaurant_admin";
export type RestaurantStatus = "draft" | "active" | "paused";
export type CalendarType = "internal" | "external";
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "modified"
  | "cancelled"
  | "requires_human"
  | "no_show";
export type ReservationChannel = "manual" | "whatsapp" | "future_voice" | "external_calendar";
export type HandoffStatus = "pending" | "in_review" | "resolved";
export type IntegrationStatus = "pending" | "connected" | "needs_review";
export type SummaryFrequency = "every_12_hours" | "daily";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  restaurant_id: string | null;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  main_phone: string | null;
  whatsapp_number: string | null;
  contact_email: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_whatsapp: string | null;
  status: RestaurantStatus;
  calendar_type: CalendarType;
  notes_internal: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  channel: ReservationChannel;
  customer_notes: string | null;
  internal_notes: string | null;
  table_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRow {
  id: string;
  restaurant_id: string;
  day_of_week: number;
  is_open: boolean;
  opening_time: string | null;
  closing_time: string | null;
  service_name: string | null;
  max_guests_per_slot: number | null;
  max_reservations_per_slot: number | null;
  slot_duration_minutes: number | null;
  booking_mode: "slots" | "shifts";
  shift_times: string[] | null;
  service_period: "lunch" | "dinner";
}

export interface Faq {
  id: string;
  restaurant_id: string;
  category: string | null;
  question: string;
  answer: string;
  is_active: boolean;
}

export interface AgentSettings {
  id: string;
  restaurant_id: string;
  main_language: string | null;
  tone_style: string | null;
  formality_level: string | null;
  welcome_message: string | null;
  confirmation_message: string | null;
  cancellation_message: string | null;
  human_handoff_message: string | null;
  additional_instructions: string | null;
  max_party_size_auto: number | null;
  min_notice_hours: number | null;
  max_advance_days: number | null;
}

export interface NotificationSettings {
  id: string;
  restaurant_id: string;
  notify_by_email: boolean;
  notify_by_whatsapp: boolean;
  manager_email: string | null;
  manager_whatsapp: string | null;
  notify_new_reservation: boolean;
  notify_modified_reservation: boolean;
  notify_cancelled_reservation: boolean;
  notify_human_required: boolean;
  send_summary: boolean;
  summary_frequency: SummaryFrequency;
  summary_time: string | null;
}

export interface HandoffRequest {
  id: string;
  restaurant_id: string;
  reservation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  source_channel: ReservationChannel;
  reason: string | null;
  customer_message: string | null;
  status: HandoffStatus;
  created_at: string;
}

export interface ExternalCalendarSettings {
  id: string;
  restaurant_id: string;
  provider_name: string | null;
  connection_type: string | null;
  connection_url: string | null;
  api_key_placeholder: string | null;
  webhook_url_placeholder: string | null;
  integration_status: IntegrationStatus;
  technical_notes: string | null;
}

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  modified: "Modificada",
  cancelled: "Cancelada",
  requires_human: "Requiere humano",
  no_show: "No-show",
};

export const CHANNEL_LABELS: Record<ReservationChannel, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  future_voice: "Voz (próximamente)",
  external_calendar: "Calendario externo",
};

export const RESTAURANT_STATUS_LABELS: Record<RestaurantStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
};

export const HANDOFF_STATUS_LABELS: Record<HandoffStatus, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelta",
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  pending: "Pendiente",
  connected: "Conectada",
  needs_review: "Requiere revisión",
};

export const TONE_OPTIONS = [
  { value: "cercano_casual", label: "Cercano y casual" },
  { value: "elegante_profesional", label: "Elegante y profesional" },
  { value: "rapido_directo", label: "Rápido y directo" },
  { value: "familiar_divertido", label: "Familiar y divertido" },
  { value: "premium_alta_cocina", label: "Premium / alta cocina" },
];

export const HANDOFF_REASONS = [
  "Grupo grande",
  "Evento privado",
  "Alergia compleja",
  "Cliente enfadado",
  "Solicitud fuera de horario",
  "El agente no entiende",
  "Cliente pide hablar con persona",
  "Otra petición especial",
];

export interface Zone {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  zone_id: string;
  label: string;
  min_capacity: number;
  max_capacity: number;
  is_active: boolean;
  internal_notes: string | null;
  sort_order: number;
}