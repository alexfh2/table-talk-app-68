export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_settings: {
        Row: {
          additional_instructions: string | null
          cancellation_message: string | null
          confirmation_message: string | null
          created_at: string
          formality_level: string | null
          human_handoff_message: string | null
          id: string
          main_language: string | null
          max_advance_days: number | null
          max_party_size_auto: number | null
          min_notice_hours: number | null
          restaurant_id: string
          tone_style: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          additional_instructions?: string | null
          cancellation_message?: string | null
          confirmation_message?: string | null
          created_at?: string
          formality_level?: string | null
          human_handoff_message?: string | null
          id?: string
          main_language?: string | null
          max_advance_days?: number | null
          max_party_size_auto?: number | null
          min_notice_hours?: number | null
          restaurant_id: string
          tone_style?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          additional_instructions?: string | null
          cancellation_message?: string | null
          confirmation_message?: string | null
          created_at?: string
          formality_level?: string | null
          human_handoff_message?: string | null
          id?: string
          main_language?: string | null
          max_advance_days?: number | null
          max_party_size_auto?: number | null
          min_notice_hours?: number | null
          restaurant_id?: string
          tone_style?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_full_day: boolean
          reason: string | null
          restaurant_id: string
          start_time: string | null
        }
        Insert: {
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean
          reason?: string | null
          restaurant_id: string
          start_time?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean
          reason?: string | null
          restaurant_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendar_settings: {
        Row: {
          api_key_placeholder: string | null
          connection_type: string | null
          connection_url: string | null
          created_at: string
          id: string
          integration_status: Database["public"]["Enums"]["integration_status"]
          provider_name: string | null
          restaurant_id: string
          technical_notes: string | null
          updated_at: string
          webhook_url_placeholder: string | null
        }
        Insert: {
          api_key_placeholder?: string | null
          connection_type?: string | null
          connection_url?: string | null
          created_at?: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          provider_name?: string | null
          restaurant_id: string
          technical_notes?: string | null
          updated_at?: string
          webhook_url_placeholder?: string | null
        }
        Update: {
          api_key_placeholder?: string | null
          connection_type?: string | null
          connection_url?: string | null
          created_at?: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          provider_name?: string | null
          restaurant_id?: string
          technical_notes?: string | null
          updated_at?: string
          webhook_url_placeholder?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          question: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      human_handoff_requests: {
        Row: {
          created_at: string
          customer_message: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          reason: string | null
          reservation_id: string | null
          restaurant_id: string
          source_channel: Database["public"]["Enums"]["reservation_channel"]
          status: Database["public"]["Enums"]["handoff_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_message?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          reason?: string | null
          reservation_id?: string | null
          restaurant_id: string
          source_channel?: Database["public"]["Enums"]["reservation_channel"]
          status?: Database["public"]["Enums"]["handoff_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_message?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          reason?: string | null
          reservation_id?: string | null
          restaurant_id?: string
          source_channel?: Database["public"]["Enums"]["reservation_channel"]
          status?: Database["public"]["Enums"]["handoff_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_handoff_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_handoff_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          id: string
          manager_email: string | null
          manager_whatsapp: string | null
          notify_by_email: boolean
          notify_by_whatsapp: boolean
          notify_cancelled_reservation: boolean
          notify_human_required: boolean
          notify_modified_reservation: boolean
          notify_new_reservation: boolean
          restaurant_id: string
          send_summary: boolean
          summary_frequency: Database["public"]["Enums"]["summary_frequency"]
          summary_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_email?: string | null
          manager_whatsapp?: string | null
          notify_by_email?: boolean
          notify_by_whatsapp?: boolean
          notify_cancelled_reservation?: boolean
          notify_human_required?: boolean
          notify_modified_reservation?: boolean
          notify_new_reservation?: boolean
          restaurant_id: string
          send_summary?: boolean
          summary_frequency?: Database["public"]["Enums"]["summary_frequency"]
          summary_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_email?: string | null
          manager_whatsapp?: string | null
          notify_by_email?: boolean
          notify_by_whatsapp?: boolean
          notify_cancelled_reservation?: boolean
          notify_human_required?: boolean
          notify_modified_reservation?: boolean
          notify_new_reservation?: boolean
          restaurant_id?: string
          send_summary?: boolean
          summary_frequency?: Database["public"]["Enums"]["summary_frequency"]
          summary_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          channel: Database["public"]["Enums"]["reservation_channel"]
          created_at: string
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          id: string
          internal_notes: string | null
          party_size: number
          reservation_date: string
          reservation_time: string
          restaurant_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reservation_channel"]
          created_at?: string
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          id?: string
          internal_notes?: string | null
          party_size?: number
          reservation_date: string
          reservation_time: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["reservation_channel"]
          created_at?: string
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          id?: string
          internal_notes?: string | null
          party_size?: number
          reservation_date?: string
          reservation_time?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_schedule: {
        Row: {
          closing_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          max_guests_per_slot: number | null
          max_reservations_per_slot: number | null
          opening_time: string | null
          restaurant_id: string
          service_name: string | null
          slot_duration_minutes: number | null
          updated_at: string
        }
        Insert: {
          closing_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          max_guests_per_slot?: number | null
          max_reservations_per_slot?: number | null
          opening_time?: string | null
          restaurant_id: string
          service_name?: string | null
          slot_duration_minutes?: number | null
          updated_at?: string
        }
        Update: {
          closing_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          max_guests_per_slot?: number | null
          max_reservations_per_slot?: number | null
          opening_time?: string | null
          restaurant_id?: string
          service_name?: string | null
          slot_duration_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_schedule_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          calendar_type: Database["public"]["Enums"]["calendar_type"]
          contact_email: string | null
          created_at: string
          id: string
          main_phone: string | null
          manager_email: string | null
          manager_name: string | null
          manager_whatsapp: string | null
          name: string
          notes_internal: string | null
          status: Database["public"]["Enums"]["restaurant_status"]
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          calendar_type?: Database["public"]["Enums"]["calendar_type"]
          contact_email?: string | null
          created_at?: string
          id?: string
          main_phone?: string | null
          manager_email?: string | null
          manager_name?: string | null
          manager_whatsapp?: string | null
          name: string
          notes_internal?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          calendar_type?: Database["public"]["Enums"]["calendar_type"]
          contact_email?: string | null
          created_at?: string
          id?: string
          main_phone?: string | null
          manager_email?: string | null
          manager_name?: string | null
          manager_whatsapp?: string | null
          name?: string
          notes_internal?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_restaurant_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_platform_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      calendar_type: "internal" | "external"
      handoff_status: "pending" | "in_review" | "resolved"
      integration_status: "pending" | "connected" | "needs_review"
      reservation_channel:
        | "manual"
        | "whatsapp"
        | "future_voice"
        | "external_calendar"
      reservation_status:
        | "pending"
        | "confirmed"
        | "modified"
        | "cancelled"
        | "requires_human"
        | "no_show"
      restaurant_status: "draft" | "active" | "paused"
      summary_frequency: "every_12_hours" | "daily"
      user_role: "platform_admin" | "restaurant_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      calendar_type: ["internal", "external"],
      handoff_status: ["pending", "in_review", "resolved"],
      integration_status: ["pending", "connected", "needs_review"],
      reservation_channel: [
        "manual",
        "whatsapp",
        "future_voice",
        "external_calendar",
      ],
      reservation_status: [
        "pending",
        "confirmed",
        "modified",
        "cancelled",
        "requires_human",
        "no_show",
      ],
      restaurant_status: ["draft", "active", "paused"],
      summary_frequency: ["every_12_hours", "daily"],
      user_role: ["platform_admin", "restaurant_admin"],
    },
  },
} as const
