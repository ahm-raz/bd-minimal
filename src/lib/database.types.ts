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
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_outcome_key_fkey"
            columns: ["outcome_key"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["key"]
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
          sort_order: number
        }
        Insert: {
          category: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          default_channel_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          default_channel_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
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
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
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
            foreignKeyName: "contacts_preferred_channel_id_fkey"
            columns: ["preferred_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
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
          opportunity_id: string | null
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
          opportunity_id?: string | null
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
          opportunity_id?: string | null
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
            foreignKeyName: "feed_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
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
      lead_owner_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_owner: string | null
          id: number
          lead_id: string
          to_owner: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id: string
          to_owner: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id?: string
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
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
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
          last_activity_at: string | null
          lead_timezone: string | null
          next_action: string | null
          next_action_due: string | null
          niche_id: string
          notes: string | null
          offer: string | null
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
          last_activity_at?: string | null
          lead_timezone?: string | null
          next_action?: string | null
          next_action_due?: string | null
          niche_id: string
          notes?: string | null
          offer?: string | null
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
          last_activity_at?: string | null
          lead_timezone?: string | null
          next_action?: string | null
          next_action_due?: string | null
          niche_id?: string
          notes?: string | null
          offer?: string | null
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
            foreignKeyName: "leads_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
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
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      niches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
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
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_key_fkey"
            columns: ["stage_key"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["key"]
          },
        ]
      }
      opportunity_stage_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: number
          opportunity_id: string
          owner_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
          opportunity_id: string
          owner_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
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
            columns: ["from_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["key"]
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
            columns: ["to_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["key"]
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
          sort_order: number
        }
        Insert: {
          allowed_categories: Database["public"]["Enums"]["activity_category"][]
          is_meeting: boolean
          is_positive: boolean
          is_reply: boolean
          key: string
          label: string
          sort_order: number
        }
        Update: {
          allowed_categories?: Database["public"]["Enums"]["activity_category"][]
          is_meeting?: boolean
          is_positive?: boolean
          is_reply?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          primary_niche_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          primary_niche_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          primary_niche_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_niche_fk"
            columns: ["primary_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          is_open: boolean
          key: string
          label: string
          probability: number
          sort_order: number
        }
        Insert: {
          is_open: boolean
          key: string
          label: string
          probability: number
          sort_order: number
        }
        Update: {
          is_open?: boolean
          key?: string
          label?: string
          probability?: number
          sort_order?: number
        }
        Relationships: []
      }
      targets: {
        Row: {
          id: string
          metric: Database["public"]["Enums"]["target_metric"]
          updated_at: string
          user_id: string
          weekly_value: number
        }
        Insert: {
          id?: string
          metric: Database["public"]["Enums"]["target_metric"]
          updated_at?: string
          user_id: string
          weekly_value: number
        }
        Update: {
          id?: string
          metric?: Database["public"]["Enums"]["target_metric"]
          updated_at?: string
          user_id?: string
          weekly_value?: number
        }
        Relationships: [
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
      can_access_lead: { Args: { p_lead_id: string }; Returns: boolean }
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
      ensure_recurring_tasks: {
        Args: { p_day: string; p_user: string }
        Returns: number
      }
      is_active_user: { Args: never; Returns: boolean }
      is_founder: { Args: never; Returns: boolean }
      is_system: { Args: never; Returns: boolean }
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
      pipeline_summary: {
        Args: { p_stuck_days?: number; p_user?: string }
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
      recompute_lead_completeness: {
        Args: { p_lead_id: string }
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
      campaign_status: "active" | "paused" | "completed"
      contract_type: "one_time" | "monthly"
      email_status: "unverified" | "valid" | "invalid" | "bounced"
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
      target_metric:
        | "leads_added"
        | "outreach"
        | "follow_ups"
        | "replies"
        | "meetings_booked"
        | "proposals_sent"
      task_kind: "count" | "checklist" | "lead_fix"
      task_metric:
        | "leads_added"
        | "outreach"
        | "follow_ups"
        | "replies"
        | "meetings_booked"
      user_role: "founder" | "bd"
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
      campaign_status: ["active", "paused", "completed"],
      contract_type: ["one_time", "monthly"],
      email_status: ["unverified", "valid", "invalid", "bounced"],
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
      target_metric: [
        "leads_added",
        "outreach",
        "follow_ups",
        "replies",
        "meetings_booked",
        "proposals_sent",
      ],
      task_kind: ["count", "checklist", "lead_fix"],
      task_metric: [
        "leads_added",
        "outreach",
        "follow_ups",
        "replies",
        "meetings_booked",
      ],
      user_role: ["founder", "bd"],
    },
  },
} as const

