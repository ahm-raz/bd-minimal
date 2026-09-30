export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type_id: string
          campaign_id: string | null
          category: Database["public"]["Enums"]["activity_category"]
          channel_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          occurred_at: string
          office_id: string
          opportunity_id: string | null
          outcome_key: string
          user_id: string
        }
        Insert: {
          activity_type_id: string
          campaign_id?: string | null
          category: Database["public"]["Enums"]["activity_category"]
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          occurred_at?: string
          office_id?: string
          opportunity_id?: string | null
          outcome_key?: string
          user_id?: string
        }
        Update: {
          activity_type_id?: string
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["activity_category"]
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          occurred_at?: string
          office_id?: string
          opportunity_id?: string | null
          outcome_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_outcome_key_fkey"
            columns: ["office_id", "outcome_key"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["office_id", "key"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_types: {
        Row: {
          category: Database["public"]["Enums"]["activity_category"]
          created_at: string
          default_channel_id: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          category: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          default_channel_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          default_channel_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_types_default_channel_id_fkey"
            columns: ["default_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_cleanup: {
        Row: {
          calendar_id: string
          created_at: string
          gcal_event_id: string
          id: number
          office_id: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          created_at?: string
          gcal_event_id: string
          id?: never
          office_id?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          gcal_event_id?: string
          id?: never
          office_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_cleanup_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_cleanup_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          name: string
          niche_id: string | null
          notes: string | null
          office_id: string
          owner_id: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          name: string
          niche_id?: string | null
          notes?: string | null
          office_id?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          name?: string
          niche_id?: string | null
          notes?: string | null
          office_id?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          email_status: Database["public"]["Enums"]["email_status"]
          first_name: string
          id: string
          is_decision_maker: boolean
          is_primary: boolean
          job_title: string | null
          last_name: string | null
          lead_id: string
          linkedin_url: string | null
          mobile_phone: string | null
          notes: string | null
          office_id: string
          other_social_url: string | null
          phone: string | null
          preferred_channel_id: string | null
          secondary_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          first_name: string
          id?: string
          is_decision_maker?: boolean
          is_primary?: boolean
          job_title?: string | null
          last_name?: string | null
          lead_id: string
          linkedin_url?: string | null
          mobile_phone?: string | null
          notes?: string | null
          office_id?: string
          other_social_url?: string | null
          phone?: string | null
          preferred_channel_id?: string | null
          secondary_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          first_name?: string
          id?: string
          is_decision_maker?: boolean
          is_primary?: boolean
          job_title?: string | null
          last_name?: string | null
          lead_id?: string
          linkedin_url?: string | null
          mobile_phone?: string | null
          notes?: string | null
          office_id?: string
          other_social_url?: string | null
          phone?: string | null
          preferred_channel_id?: string | null
          secondary_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_preferred_channel_id_fkey"
            columns: ["preferred_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pillars: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pillars_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          kind: string
          lead_id: string | null
          meeting_id: string | null
          office_id: string
          opportunity_id: string | null
          post_id: string | null
          subject_user_id: string | null
          summary: string
          task_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: never
          kind: string
          lead_id?: string | null
          meeting_id?: string | null
          office_id?: string
          opportunity_id?: string | null
          post_id?: string | null
          subject_user_id?: string | null
          summary: string
          task_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: never
          kind?: string
          lead_id?: string | null
          meeting_id?: string | null
          office_id?: string
          opportunity_id?: string | null
          post_id?: string | null
          subject_user_id?: string | null
          summary?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connections: {
        Row: {
          auto_add: boolean
          calendar_id: string
          connected_at: string
          google_email: string
          last_error: string | null
          office_id: string
          refresh_token_enc: string
          scopes: string[]
          status: Database["public"]["Enums"]["google_connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_add?: boolean
          calendar_id?: string
          connected_at?: string
          google_email: string
          last_error?: string | null
          office_id?: string
          refresh_token_enc: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["google_connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_add?: boolean
          calendar_id?: string
          connected_at?: string
          google_email?: string
          last_error?: string | null
          office_id?: string
          refresh_token_enc?: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["google_connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_connections_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_batches: {
        Row: {
          code: string
          created_at: string
          created_by: string
          created_by_role: Database["public"]["Enums"]["user_role"]
          default_owner_id: string | null
          duplicate_rows: number
          error_summary: string | null
          errors: Json
          expires_at: string
          file_sha256: string
          filename: string
          id: string
          imported_at: string | null
          imported_rows: number
          invalid_rows: number
          office_id: string
          rows: Json | null
          status: string
          total_rows: number
          valid_rows: number
          warning_count: number
        }
        Insert: {
          code?: string
          created_at?: string
          created_by?: string
          created_by_role: Database["public"]["Enums"]["user_role"]
          default_owner_id?: string | null
          duplicate_rows?: number
          error_summary?: string | null
          errors?: Json
          expires_at?: string
          file_sha256: string
          filename: string
          id?: string
          imported_at?: string | null
          imported_rows?: number
          invalid_rows?: number
          office_id?: string
          rows?: Json | null
          status: string
          total_rows?: number
          valid_rows?: number
          warning_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          created_by_role?: Database["public"]["Enums"]["user_role"]
          default_owner_id?: string | null
          duplicate_rows?: number
          error_summary?: string | null
          errors?: Json
          expires_at?: string
          file_sha256?: string
          filename?: string
          id?: string
          imported_at?: string | null
          imported_rows?: number
          invalid_rows?: number
          office_id?: string
          rows?: Json | null
          status?: string
          total_rows?: number
          valid_rows?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_import_batches_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_import_batches_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_owner_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_owner: string | null
          id: number
          lead_id: string
          office_id: string
          to_owner: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id: string
          office_id?: string
          to_owner: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id?: string
          office_id?: string
          to_owner?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_owner_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_events_from_owner_fkey"
            columns: ["from_owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_events_to_owner_fkey"
            columns: ["to_owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          campaign_id: string | null
          channel_id: string
          city: string | null
          company_email: string | null
          company_linkedin_url: string | null
          company_name: string
          company_phone: string | null
          company_size: string | null
          completeness: number
          country: string
          created_at: string
          created_by: string
          domain: string | null
          google_maps_url: string | null
          google_rating: number | null
          google_review_count: number | null
          id: string
          import_batch_id: string | null
          last_activity_at: string | null
          lead_timezone: string | null
          next_action: string | null
          next_action_due: string | null
          niche_id: string
          notes: string | null
          offer: string | null
          office_id: string
          owner_id: string
          pain_point: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          source_id: string | null
          state_region: string | null
          status: Database["public"]["Enums"]["lead_status"]
          sub_niche: string | null
          tags: string[]
          updated_at: string
          upwork_job_url: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          campaign_id?: string | null
          channel_id: string
          city?: string | null
          company_email?: string | null
          company_linkedin_url?: string | null
          company_name: string
          company_phone?: string | null
          company_size?: string | null
          completeness?: number
          country?: string
          created_at?: string
          created_by?: string
          domain?: string | null
          google_maps_url?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          import_batch_id?: string | null
          last_activity_at?: string | null
          lead_timezone?: string | null
          next_action?: string | null
          next_action_due?: string | null
          niche_id: string
          notes?: string | null
          offer?: string | null
          office_id?: string
          owner_id: string
          pain_point?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          source_id?: string | null
          state_region?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_niche?: string | null
          tags?: string[]
          updated_at?: string
          upwork_job_url?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          campaign_id?: string | null
          channel_id?: string
          city?: string | null
          company_email?: string | null
          company_linkedin_url?: string | null
          company_name?: string
          company_phone?: string | null
          company_size?: string | null
          completeness?: number
          country?: string
          created_at?: string
          created_by?: string
          domain?: string | null
          google_maps_url?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          import_batch_id?: string | null
          last_activity_at?: string | null
          lead_timezone?: string | null
          next_action?: string | null
          next_action_due?: string | null
          niche_id?: string
          notes?: string | null
          offer?: string | null
          office_id?: string
          owner_id?: string
          pain_point?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          source_id?: string | null
          state_region?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_niche?: string | null
          tags?: string[]
          updated_at?: string
          upwork_job_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "lead_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lost_reasons_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          activity_id: string | null
          add_to_calendar: boolean
          agenda: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          duration_min: number
          gcal_attempts: number
          gcal_calendar_id: string | null
          gcal_error: string | null
          gcal_event_id: string | null
          gcal_next_retry_at: string | null
          gcal_state: Database["public"]["Enums"]["calendar_sync_state"]
          gcal_synced_version: number
          held_activity_id: string | null
          id: string
          invite_contact: boolean
          lead_id: string
          location: string | null
          office_id: string
          opportunity_id: string | null
          owner_id: string
          reminder_minutes: number[]
          starts_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          status_note: string | null
          sync_version: number
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          add_to_calendar?: boolean
          agenda?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number
          gcal_attempts?: number
          gcal_calendar_id?: string | null
          gcal_error?: string | null
          gcal_event_id?: string | null
          gcal_next_retry_at?: string | null
          gcal_state?: Database["public"]["Enums"]["calendar_sync_state"]
          gcal_synced_version?: number
          held_activity_id?: string | null
          id?: string
          invite_contact?: boolean
          lead_id: string
          location?: string | null
          office_id?: string
          opportunity_id?: string | null
          owner_id: string
          reminder_minutes?: number[]
          starts_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          status_note?: string | null
          sync_version?: number
          timezone: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          add_to_calendar?: boolean
          agenda?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number
          gcal_attempts?: number
          gcal_calendar_id?: string | null
          gcal_error?: string | null
          gcal_event_id?: string | null
          gcal_next_retry_at?: string | null
          gcal_state?: Database["public"]["Enums"]["calendar_sync_state"]
          gcal_synced_version?: number
          held_activity_id?: string | null
          id?: string
          invite_contact?: boolean
          lead_id?: string
          location?: string | null
          office_id?: string
          opportunity_id?: string | null
          owner_id?: string
          reminder_minutes?: number[]
          starts_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          status_note?: string | null
          sync_version?: number
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_held_activity_id_fkey"
            columns: ["held_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "niches_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          browser: boolean
          in_app: boolean
          kind_group: string
          office_id: string
          user_id: string
        }
        Insert: {
          browser?: boolean
          in_app?: boolean
          kind_group: string
          office_id?: string
          user_id: string
        }
        Update: {
          browser?: boolean
          in_app?: boolean
          kind_group?: string
          office_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          dedupe_key: string
          feed_event_id: number | null
          id: number
          kind: string
          kind_group: string
          lead_id: string | null
          link: string | null
          meeting_id: string | null
          office_id: string
          opportunity_id: string | null
          post_id: string | null
          priority: string
          read_at: string | null
          recipient_id: string
          task_id: string | null
          title: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedupe_key: string
          feed_event_id?: number | null
          id?: never
          kind: string
          kind_group: string
          lead_id?: string | null
          link?: string | null
          meeting_id?: string | null
          office_id?: string
          opportunity_id?: string | null
          post_id?: string | null
          priority?: string
          read_at?: string | null
          recipient_id: string
          task_id?: string | null
          title: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string
          feed_event_id?: number | null
          id?: never
          kind?: string
          kind_group?: string
          lead_id?: string | null
          link?: string | null
          meeting_id?: string | null
          office_id?: string
          opportunity_id?: string | null
          post_id?: string | null
          priority?: string
          read_at?: string | null
          recipient_id?: string
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_feed_event_id_fkey"
            columns: ["feed_event_id"]
            isOneToOne: false
            referencedRelation: "feed_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          created_at: string
          id: string
          name: string
          seat_limit: number | null
          status: Database["public"]["Enums"]["office_status"]
          suspended_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          seat_limit?: number | null
          status?: Database["public"]["Enums"]["office_status"]
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          seat_limit?: number | null
          status?: Database["public"]["Enums"]["office_status"]
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          contract_ended_at: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          created_at: string
          created_by: string
          estimated_value: number
          expected_close_date: string | null
          id: string
          lead_id: string
          lost_at: string | null
          lost_note: string | null
          lost_reason_id: string | null
          monthly_amount: number
          notes: string | null
          office_id: string
          owner_id: string
          stage_changed_at: string
          stage_key: string
          title: string
          updated_at: string
          won_at: string | null
          won_value: number | null
        }
        Insert: {
          contract_ended_at?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string
          created_by?: string
          estimated_value?: number
          expected_close_date?: string | null
          id?: string
          lead_id: string
          lost_at?: string | null
          lost_note?: string | null
          lost_reason_id?: string | null
          monthly_amount?: number
          notes?: string | null
          office_id?: string
          owner_id: string
          stage_changed_at?: string
          stage_key?: string
          title: string
          updated_at?: string
          won_at?: string | null
          won_value?: number | null
        }
        Update: {
          contract_ended_at?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string
          created_by?: string
          estimated_value?: number
          expected_close_date?: string | null
          id?: string
          lead_id?: string
          lost_at?: string | null
          lost_note?: string | null
          lost_reason_id?: string | null
          monthly_amount?: number
          notes?: string | null
          office_id?: string
          owner_id?: string
          stage_changed_at?: string
          stage_key?: string
          title?: string
          updated_at?: string
          won_at?: string | null
          won_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lost_reason_id_fkey"
            columns: ["lost_reason_id"]
            isOneToOne: false
            referencedRelation: "lost_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_key_fkey"
            columns: ["office_id", "stage_key"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["office_id", "key"]
          },
        ]
      }
      opportunity_stage_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: number
          office_id: string
          opportunity_id: string
          owner_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
          office_id?: string
          opportunity_id: string
          owner_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
          office_id?: string
          opportunity_id?: string
          owner_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_from_stage_fkey"
            columns: ["office_id", "from_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["office_id", "key"]
          },
          {
            foreignKeyName: "opportunity_stage_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_fkey"
            columns: ["office_id", "to_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["office_id", "key"]
          },
        ]
      }
      outcomes: {
        Row: {
          allowed_categories: Database["public"]["Enums"]["activity_category"][]
          is_meeting: boolean
          is_positive: boolean
          is_reply: boolean
          key: string
          label: string
          office_id: string
          sort_order: number
        }
        Insert: {
          allowed_categories: Database["public"]["Enums"]["activity_category"][]
          is_meeting: boolean
          is_positive: boolean
          is_reply: boolean
          key: string
          label: string
          office_id?: string
          sort_order: number
        }
        Update: {
          allowed_categories?: Database["public"]["Enums"]["activity_category"][]
          is_meeting?: boolean
          is_positive?: boolean
          is_reply?: boolean
          key?: string
          label?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_members: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          office_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          office_id?: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          office_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "pending_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["post_comment_kind"]
          office_id: string
          post_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["post_comment_kind"]
          office_id?: string
          post_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["post_comment_kind"]
          office_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_status_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["post_status"] | null
          id: number
          office_id: string
          post_id: string
          to_status: Database["public"]["Enums"]["post_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["post_status"] | null
          id?: never
          office_id?: string
          post_id: string
          to_status: Database["public"]["Enums"]["post_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["post_status"] | null
          id?: never
          office_id?: string
          post_id?: string
          to_status?: Database["public"]["Enums"]["post_status"]
        }
        Relationships: [
          {
            foreignKeyName: "post_status_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_status_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_status_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_schedules: {
        Row: {
          account_id: string
          assignee_id: string
          created_at: string
          created_by: string
          default_format: Database["public"]["Enums"]["post_format"]
          draft_lead_hours: number
          ends_on: string | null
          id: string
          is_active: boolean
          local_time: string
          needs_approval: boolean
          office_id: string
          pillar_id: string | null
          starts_on: string
          timezone: string
          weekdays: number[]
        }
        Insert: {
          account_id: string
          assignee_id: string
          created_at?: string
          created_by?: string
          default_format?: Database["public"]["Enums"]["post_format"]
          draft_lead_hours?: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          local_time: string
          needs_approval?: boolean
          office_id?: string
          pillar_id?: string | null
          starts_on?: string
          timezone: string
          weekdays: number[]
        }
        Update: {
          account_id?: string
          assignee_id?: string
          created_at?: string
          created_by?: string
          default_format?: Database["public"]["Enums"]["post_format"]
          draft_lead_hours?: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          local_time?: string
          needs_approval?: boolean
          office_id?: string
          pillar_id?: string | null
          starts_on?: string
          timezone?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "posting_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_schedules_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_schedules_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_schedules_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "content_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          account_id: string
          assignee_id: string
          brief: string | null
          campaign_id: string | null
          caption: string | null
          clicks: number | null
          comments_count: number | null
          created_at: string
          created_by: string
          cta_link: string | null
          draft_due_at: string | null
          first_comment: string | null
          format: Database["public"]["Enums"]["post_format"]
          hashtags: string | null
          id: string
          impressions: number | null
          media_links: string[]
          needs_approval: boolean
          office_id: string
          pillar_id: string | null
          post_url: string | null
          posted_at: string | null
          reactions: number | null
          results_recorded_at: string | null
          schedule_id: string | null
          scheduled_at: string | null
          shares: number | null
          status: Database["public"]["Enums"]["post_status"]
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assignee_id: string
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          clicks?: number | null
          comments_count?: number | null
          created_at?: string
          created_by?: string
          cta_link?: string | null
          draft_due_at?: string | null
          first_comment?: string | null
          format?: Database["public"]["Enums"]["post_format"]
          hashtags?: string | null
          id?: string
          impressions?: number | null
          media_links?: string[]
          needs_approval?: boolean
          office_id?: string
          pillar_id?: string | null
          post_url?: string | null
          posted_at?: string | null
          reactions?: number | null
          results_recorded_at?: string | null
          schedule_id?: string | null
          scheduled_at?: string | null
          shares?: number | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assignee_id?: string
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          clicks?: number | null
          comments_count?: number | null
          created_at?: string
          created_by?: string
          cta_link?: string | null
          draft_due_at?: string | null
          first_comment?: string | null
          format?: Database["public"]["Enums"]["post_format"]
          hashtags?: string | null
          id?: string
          impressions?: number | null
          media_links?: string[]
          needs_approval?: boolean
          office_id?: string
          pillar_id?: string | null
          post_url?: string | null
          posted_at?: string | null
          reactions?: number | null
          results_recorded_at?: string | null
          schedule_id?: string | null
          scheduled_at?: string | null
          shares?: number | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "content_pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "posting_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          can_import_leads: boolean
          created_at: string
          deactivated_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          meeting_reminders: number[]
          office_id: string
          primary_niche_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          can_import_leads?: boolean
          created_at?: string
          deactivated_at?: string | null
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          meeting_reminders?: number[]
          office_id?: string
          primary_niche_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          can_import_leads?: boolean
          created_at?: string
          deactivated_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          meeting_reminders?: number[]
          office_id?: string
          primary_niche_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_primary_niche_fk"
            columns: ["primary_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          audience_timezone: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          office_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_url: string | null
          sort_order: number
        }
        Insert: {
          audience_timezone?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_url?: string | null
          sort_order?: number
        }
        Update: {
          audience_timezone?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          profile_url?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          is_open: boolean
          key: string
          label: string
          office_id: string
          probability: number
          sort_order: number
        }
        Insert: {
          is_open: boolean
          key: string
          label: string
          office_id?: string
          probability: number
          sort_order: number
        }
        Update: {
          is_open?: boolean
          key?: string
          label?: string
          office_id?: string
          probability?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      targets: {
        Row: {
          id: string
          metric: Database["public"]["Enums"]["target_metric"]
          office_id: string
          updated_at: string
          user_id: string
          weekly_value: number
        }
        Insert: {
          id?: string
          metric: Database["public"]["Enums"]["target_metric"]
          office_id?: string
          updated_at?: string
          user_id: string
          weekly_value: number
        }
        Update: {
          id?: string
          metric?: Database["public"]["Enums"]["target_metric"]
          office_id?: string
          updated_at?: string
          user_id?: string
          weekly_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "targets_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          assignee_id: string
          created_at: string
          created_by: string
          filter_campaign_id: string | null
          filter_niche_id: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["task_kind"]
          metric: Database["public"]["Enums"]["task_metric"] | null
          note: string | null
          office_id: string
          starts_on: string
          target_count: number | null
          title: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          created_by?: string
          filter_campaign_id?: string | null
          filter_niche_id?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["task_kind"]
          metric?: Database["public"]["Enums"]["task_metric"] | null
          note?: string | null
          office_id?: string
          starts_on?: string
          target_count?: number | null
          title: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          created_by?: string
          filter_campaign_id?: string | null
          filter_niche_id?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["task_kind"]
          metric?: Database["public"]["Enums"]["task_metric"] | null
          note?: string | null
          office_id?: string
          starts_on?: string
          target_count?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_filter_campaign_id_fkey"
            columns: ["filter_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_filter_niche_id_fkey"
            columns: ["filter_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string
          filter_campaign_id: string | null
          filter_niche_id: string | null
          id: string
          kind: Database["public"]["Enums"]["task_kind"]
          lead_id: string | null
          metric: Database["public"]["Enums"]["task_metric"] | null
          note: string | null
          office_id: string
          opportunity_id: string | null
          target_count: number | null
          template_id: string | null
          title: string
        }
        Insert: {
          assignee_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date: string
          filter_campaign_id?: string | null
          filter_niche_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          metric?: Database["public"]["Enums"]["task_metric"] | null
          note?: string | null
          office_id?: string
          opportunity_id?: string | null
          target_count?: number | null
          template_id?: string | null
          title: string
        }
        Update: {
          assignee_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          filter_campaign_id?: string | null
          filter_niche_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          metric?: Database["public"]["Enums"]["task_metric"] | null
          note?: string | null
          office_id?: string
          opportunity_id?: string | null
          target_count?: number | null
          template_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_filter_campaign_id_fkey"
            columns: ["filter_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_filter_niche_id_fkey"
            columns: ["filter_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_mrr: { Args: { p_user?: string }; Returns: number }
      admin_office_summary: {
        Args: never
        Returns: {
          active_members: number
          created_at: string
          founder_email: string
          id: string
          last_activity_at: string
          leads_count: number
          name: string
          seat_limit: number
          status: Database["public"]["Enums"]["office_status"]
          timezone: string
        }[]
      }
      book_meeting: {
        Args: {
          p_activity_type_id: string
          p_add_to_calendar?: boolean
          p_agenda?: string
          p_contact_id?: string
          p_duration_min?: number
          p_invite_contact?: boolean
          p_lead_id: string
          p_location?: string
          p_notes?: string
          p_occurred_at?: string
          p_opportunity_id?: string
          p_reminder_minutes?: number[]
          p_starts_at: string
          p_timezone: string
          p_title?: string
        }
        Returns: string
      }
      calendar_active_for: { Args: { p_user: string }; Returns: boolean }
      can_access_lead: { Args: { p_lead_id: string }; Returns: boolean }
      can_import_leads: { Args: never; Returns: boolean }
      check_count_tasks: {
        Args: { p_ts: string; p_user: string }
        Returns: undefined
      }
      count_task_progress: {
        Args: {
          p_assignee: string
          p_campaign: string
          p_day: string
          p_metric: Database["public"]["Enums"]["task_metric"]
          p_niche: string
        }
        Returns: number
      }
      create_office: {
        Args: {
          p_founder_email: string
          p_name: string
          p_seat_limit: number
          p_timezone: string
        }
        Returns: string
      }
      current_office_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      discard_empty_office: { Args: { p_office: string }; Returns: undefined }
      ensure_post_slots: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      ensure_recurring_tasks: {
        Args: { p_day: string; p_user: string }
        Returns: number
      }
      import_conflicts: {
        Args: { p_batch: string }
        Returns: {
          reason: string
          row_number: number
        }[]
      }
      import_lead_batch: { Args: { p_batch: string }; Returns: number }
      is_active_user: { Args: never; Returns: boolean }
      is_founder: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_system: { Args: never; Returns: boolean }
      is_trusted_context: { Args: never; Returns: boolean }
      log_activity: {
        Args: {
          p_activity_type_id: string
          p_clear_next_action?: boolean
          p_contact_id?: string
          p_lead_id: string
          p_next_action?: string
          p_next_action_due?: string
          p_notes?: string
          p_occurred_at?: string
          p_opportunity_id?: string
          p_outcome_key: string
        }
        Returns: string
      }
      mark_google_needs_reconnect: {
        Args: { p_error: string }
        Returns: undefined
      }
      mark_missed_posts: { Args: never; Returns: number }
      meeting_when: { Args: { p_at: string; p_tz: string }; Returns: string }
      metrics_by_dimension: {
        Args: {
          p_dimension: string
          p_from: string
          p_to: string
          p_user?: string
        }
        Returns: {
          dimension_id: string
          dimension_name: string
          leads_added: number
          meetings_booked: number
          outreach: number
          positive_replies: number
          proposals_sent: number
          replies: number
          won_count: number
          won_revenue: number
        }[]
      }
      metrics_daily: {
        Args: { p_from: string; p_to: string; p_tz: string; p_user?: string }
        Returns: {
          day: string
          follow_ups: number
          leads_added: number
          meetings_booked: number
          outreach: number
          replies: number
          user_id: string
        }[]
      }
      metrics_scoreboard: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_completeness: number
          flagged_leads: number
          follow_ups: number
          leads_added: number
          meetings_booked: number
          meetings_done: number
          new_mrr: number
          outreach: number
          positive_replies: number
          proposals_sent: number
          replies: number
          user_id: string
          won_count: number
          won_revenue: number
        }[]
      }
      my_account_state: { Args: never; Returns: string }
      my_google_token: {
        Args: never
        Returns: {
          calendar_id: string
          refresh_token_enc: string
          status: Database["public"]["Enums"]["google_connection_status"]
        }[]
      }
      notification_group: { Args: { p_kind: string }; Returns: string }
      office_seat_error: {
        Args: { p_adding: number; p_office: string }
        Returns: string
      }
      pipeline_summary: {
        Args: { p_niche?: string; p_stuck_days?: number; p_user?: string }
        Returns: {
          opp_count: number
          sort_order: number
          stage_key: string
          stage_label: string
          stuck_count: number
          total_value: number
          weighted_value: number
        }[]
      }
      post_guard_bypassed: { Args: never; Returns: boolean }
      prune_my_notifications: { Args: never; Returns: number }
      recompute_lead_completeness: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      request_post_changes: {
        Args: { p_body: string; p_post: string }
        Returns: undefined
      }
      save_google_connection: {
        Args: { p_email: string; p_scopes: string[]; p_token_enc: string }
        Returns: undefined
      }
      seed_office_defaults: { Args: { p_office: string }; Returns: undefined }
      set_meeting_gcal: {
        Args: { p_fields: Json; p_meeting: string; p_sync_version: number }
        Returns: boolean
      }
      setup_first_office: {
        Args: { p_founder_email: string; p_name: string; p_timezone: string }
        Returns: string
      }
      social_daily: {
        Args: { p_from: string; p_to: string; p_tz: string; p_user?: string }
        Returns: {
          day: string
          missed: number
          posted: number
          scheduled: number
          user_id: string
        }[]
      }
      social_metrics: {
        Args: { p_from: string; p_to: string; p_user?: string }
        Returns: {
          changes_requested: number
          clicks: number
          comments: number
          impressions: number
          late: number
          median_approval_hours: number
          missed: number
          on_time: number
          on_time_rate: number
          planned: number
          posted: number
          reactions: number
          shares: number
          user_id: string
        }[]
      }
      social_metrics_by: {
        Args: {
          p_dimension: string
          p_from: string
          p_to: string
          p_user?: string
        }
        Returns: {
          avg_reactions: number
          dimension_id: string
          dimension_name: string
          impressions: number
          missed: number
          on_time: number
          planned: number
          posted: number
          reactions: number
        }[]
      }
      sync_lead_contacts: {
        Args: { p_contacts: Json; p_lead_id: string }
        Returns: undefined
      }
      tasks_with_progress: {
        Args: { p_assignee?: string; p_from: string; p_to: string }
        Returns: {
          assignee_id: string
          completed_at: string
          completed_on_time: boolean
          created_by: string
          due_date: string
          id: string
          is_recurring: boolean
          kind: Database["public"]["Enums"]["task_kind"]
          lead_id: string
          metric: Database["public"]["Enums"]["task_metric"]
          note: string
          opportunity_id: string
          progress: number
          status: string
          target_count: number
          title: string
        }[]
      }
      team_calendar_status: {
        Args: never
        Returns: {
          google_email: string
          status: Database["public"]["Enums"]["google_connection_status"]
          user_id: string
        }[]
      }
      user_local_date: {
        Args: { p_ts: string; p_user: string }
        Returns: string
      }
    }
    Enums: {
      activity_category:
        | "outreach"
        | "follow_up"
        | "inbound_reply"
        | "call"
        | "meeting"
        | "proposal"
        | "other"
      calendar_sync_state:
        | "off"
        | "pending"
        | "synced"
        | "failed"
        | "removed_in_google"
      campaign_status: "active" | "paused" | "completed"
      contract_type: "one_time" | "monthly"
      email_status: "unverified" | "valid" | "invalid" | "bounced"
      google_connection_status: "active" | "needs_reconnect"
      lead_priority: "high" | "medium" | "low"
      lead_status:
        | "new"
        | "contacted"
        | "replied"
        | "qualified"
        | "customer"
        | "lost"
        | "nurture"
        | "not_interested"
        | "bad_fit"
      meeting_status: "scheduled" | "held" | "no_show" | "cancelled"
      office_status: "active" | "suspended"
      post_comment_kind:
        | "comment"
        | "change_request"
        | "approval"
        | "status_note"
      post_format:
        | "text"
        | "image"
        | "carousel"
        | "video"
        | "reel"
        | "story"
        | "article"
        | "poll"
      post_status:
        | "idea"
        | "planned"
        | "drafting"
        | "in_review"
        | "changes_requested"
        | "approved"
        | "posted"
        | "missed"
        | "cancelled"
      social_platform:
        | "linkedin_page"
        | "linkedin_profile"
        | "instagram"
        | "facebook"
        | "x"
        | "tiktok"
        | "youtube"
        | "other"
      target_metric:
        | "leads_added"
        | "outreach"
        | "follow_ups"
        | "replies"
        | "meetings_booked"
        | "proposals_sent"
        | "posts_published"
      task_kind: "count" | "checklist" | "lead_fix"
      task_metric:
        | "leads_added"
        | "outreach"
        | "follow_ups"
        | "replies"
        | "meetings_booked"
        | "posts_published"
      user_role: "founder" | "bd" | "social"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_category: [
        "outreach",
        "follow_up",
        "inbound_reply",
        "call",
        "meeting",
        "proposal",
        "other",
      ],
      calendar_sync_state: [
        "off",
        "pending",
        "synced",
        "failed",
        "removed_in_google",
      ],
      campaign_status: ["active", "paused", "completed"],
      contract_type: ["one_time", "monthly"],
      email_status: ["unverified", "valid", "invalid", "bounced"],
      google_connection_status: ["active", "needs_reconnect"],
      lead_priority: ["high", "medium", "low"],
      lead_status: [
        "new",
        "contacted",
        "replied",
        "qualified",
        "customer",
        "lost",
        "nurture",
        "not_interested",
        "bad_fit",
      ],
      meeting_status: ["scheduled", "held", "no_show", "cancelled"],
      office_status: ["active", "suspended"],
      post_comment_kind: [
        "comment",
        "change_request",
        "approval",
        "status_note",
      ],
      post_format: [
        "text",
        "image",
        "carousel",
        "video",
        "reel",
        "story",
        "article",
        "poll",
      ],
      post_status: [
        "idea",
        "planned",
        "drafting",
        "in_review",
        "changes_requested",
        "approved",
        "posted",
        "missed",
        "cancelled",
      ],
      social_platform: [
        "linkedin_page",
        "linkedin_profile",
        "instagram",
        "facebook",
        "x",
        "tiktok",
        "youtube",
        "other",
      ],
      target_metric: [
        "leads_added",
        "outreach",
        "follow_ups",
        "replies",
        "meetings_booked",
        "proposals_sent",
        "posts_published",
      ],
      task_kind: ["count", "checklist", "lead_fix"],
      task_metric: [
        "leads_added",
        "outreach",
        "follow_ups",
        "replies",
        "meetings_booked",
        "posts_published",
      ],
      user_role: ["founder", "bd", "social"],
    },
  },
} as const

