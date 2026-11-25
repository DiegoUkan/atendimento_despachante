// Gerado a partir do Supabase (generate_typescript_types). Não edite à mão.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          base_url: string
          created_at: string
          id: string
          key_hint: string | null
          last_test: Json | null
          models: Json
          name: string
          secret_id: string | null
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: string
          key_hint?: string | null
          last_test?: Json | null
          models?: Json
          name: string
          secret_id?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: string
          key_hint?: string | null
          last_test?: Json | null
          models?: Json
          name?: string
          secret_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          case_id: string | null
          confidence: number | null
          context: Json
          conversation_id: string | null
          created_at: string
          error: string | null
          feedback: string | null
          finished_at: string | null
          handoff: boolean
          handoff_reason: string | null
          held_for_review: boolean
          id: string
          kind: string
          knowledge: Json
          latency_ms: number | null
          mode: string | null
          mode_source: string | null
          model: string | null
          output: Json
          provider: string | null
          rating: string | null
          rationale: string | null
          service_id: string | null
          stage_id: string | null
          status: string
          teach_session_id: string | null
          tokens_in: number | null
          tokens_out: number | null
          tools: Json
          trigger_message_ids: string[]
        }
        Insert: {
          case_id?: string | null
          confidence?: number | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          feedback?: string | null
          finished_at?: string | null
          handoff?: boolean
          handoff_reason?: string | null
          held_for_review?: boolean
          id?: string
          kind?: string
          knowledge?: Json
          latency_ms?: number | null
          mode?: string | null
          mode_source?: string | null
          model?: string | null
          output?: Json
          provider?: string | null
          rating?: string | null
          rationale?: string | null
          service_id?: string | null
          stage_id?: string | null
          status?: string
          teach_session_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tools?: Json
          trigger_message_ids?: string[]
        }
        Update: {
          case_id?: string | null
          confidence?: number | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          feedback?: string | null
          finished_at?: string | null
          handoff?: boolean
          handoff_reason?: string | null
          held_for_review?: boolean
          id?: string
          kind?: string
          knowledge?: Json
          latency_ms?: number | null
          mode?: string | null
          mode_source?: string | null
          model?: string | null
          output?: Json
          provider?: string | null
          rating?: string | null
          rationale?: string | null
          service_id?: string | null
          stage_id?: string | null
          status?: string
          teach_session_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tools?: Json
          trigger_message_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "service_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_teach_fk"
            columns: ["teach_session_id"]
            isOneToOne: false
            referencedRelation: "teach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_task_models: {
        Row: {
          enabled: boolean
          model: string | null
          provider_id: string | null
          supports_vision: boolean
          task: string
          temperature: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          model?: string | null
          provider_id?: string | null
          supports_vision?: boolean
          task: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          model?: string | null
          provider_id?: string | null
          supports_vision?: boolean
          task?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          ai_run_id: string | null
          case_id: string | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          payload: Json
          reason: string
          status: string
        }
        Insert: {
          ai_run_id?: string | null
          case_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          payload?: Json
          reason?: string
          status?: string
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
          created_at: string
          doc_key: string
          extracted: Json
          id: string
          label: string
          media_path: string | null
          message_id: string | null
          notes: string
          required: boolean
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          doc_key: string
          extracted?: Json
          id?: string
          label: string
          media_path?: string | null
          message_id?: string | null
          notes?: string
          required?: boolean
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          doc_key?: string
          extracted?: Json
          id?: string
          label?: string
          media_path?: string | null
          message_id?: string | null
          notes?: string
          required?: boolean
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          actor: string
          actor_id: string | null
          ai_run_id: string | null
          case_id: string
          created_at: string
          data: Json
          description: string
          id: string
          type: string
        }
        Insert: {
          actor?: string
          actor_id?: string | null
          ai_run_id?: string | null
          case_id: string
          created_at?: string
          data?: Json
          description?: string
          id?: string
          type: string
        }
        Update: {
          actor?: string
          actor_id?: string | null
          ai_run_id?: string | null
          case_id?: string
          created_at?: string
          data?: Json
          description?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          ai_notes_md: string
          assigned_to: string | null
          client_id: string | null
          closed_at: string | null
          code: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          due_at: string | null
          fields: Json
          id: string
          is_test: boolean
          last_change_actor: string | null
          last_change_run_id: string | null
          next_action: string
          number: number
          opened_at: string
          priority: string
          quote: Json
          quote_status: string
          service_id: string
          stage_changed_at: string
          stage_id: string
          team_notes_md: string
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          ai_notes_md?: string
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          code?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at?: string | null
          fields?: Json
          id?: string
          is_test?: boolean
          last_change_actor?: string | null
          last_change_run_id?: string | null
          next_action?: string
          number?: number
          opened_at?: string
          priority?: string
          quote?: Json
          quote_status?: string
          service_id: string
          stage_changed_at?: string
          stage_id: string
          team_notes_md?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          ai_notes_md?: string
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          code?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at?: string | null
          fields?: Json
          id?: string
          is_test?: boolean
          last_change_actor?: string | null
          last_change_run_id?: string | null
          next_action?: string
          number?: number
          opened_at?: string
          priority?: string
          quote?: Json
          quote_status?: string
          service_id?: string
          stage_changed_at?: string
          stage_id?: string
          team_notes_md?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_conversation_fk"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "service_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active: boolean
          color: string
          config: Json
          created_at: string
          emoji: string
          id: string
          kind: string
          mode_override: string | null
          name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          config?: Json
          created_at?: string
          emoji?: string
          id?: string
          kind?: string
          mode_override?: string | null
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          config?: Json
          created_at?: string
          emoji?: string
          id?: string
          kind?: string
          mode_override?: string | null
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          ai_notes_md: string
          city: string | null
          created_at: string
          doc: string | null
          email: string | null
          id: string
          is_test: boolean
          kind: string
          name: string
          tags: string[]
          team_notes_md: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai_notes_md?: string
          city?: string | null
          created_at?: string
          doc?: string | null
          email?: string | null
          id?: string
          is_test?: boolean
          kind?: string
          name: string
          tags?: string[]
          team_notes_md?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai_notes_md?: string
          city?: string | null
          created_at?: string
          doc?: string | null
          email?: string | null
          id?: string
          is_test?: boolean
          kind?: string
          name?: string
          tags?: string[]
          team_notes_md?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_clients: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string
          is_primary: boolean
          relation: string
          verified: boolean
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string
          is_primary?: boolean
          relation?: string
          verified?: boolean
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string
          is_primary?: boolean
          relation?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contact_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_clients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          blocked: boolean
          created_at: string
          id: string
          is_test: boolean
          last_seen_at: string | null
          name: string | null
          phone: string
          updated_at: string
          wa_name: string | null
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          id?: string
          is_test?: boolean
          last_seen_at?: string | null
          name?: string | null
          phone: string
          updated_at?: string
          wa_name?: string | null
        }
        Update: {
          blocked?: boolean
          created_at?: string
          id?: string
          is_test?: boolean
          last_seen_at?: string | null
          name?: string | null
          phone?: string
          updated_at?: string
          wa_name?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          active_case_id: string | null
          ai_processed_until: string | null
          assigned_to: string | null
          contact_id: string
          created_at: string
          handoff_at: string | null
          handoff_reason: string | null
          handoff_summary: string | null
          id: string
          is_test: boolean
          last_channel_id: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          mode: string | null
          pending_drafts: number
          scenario_id: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          active_case_id?: string | null
          ai_processed_until?: string | null
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          handoff_at?: string | null
          handoff_reason?: string | null
          handoff_summary?: string | null
          id?: string
          is_test?: boolean
          last_channel_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          mode?: string | null
          pending_drafts?: number
          scenario_id?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          active_case_id?: string | null
          ai_processed_until?: string | null
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          handoff_at?: string | null
          handoff_reason?: string | null
          handoff_summary?: string | null
          id?: string
          is_test?: boolean
          last_channel_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          mode?: string | null
          pending_drafts?: number
          scenario_id?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_active_case_id_fkey"
            columns: ["active_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_channel_id_fkey"
            columns: ["last_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: number
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_at: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: never
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_at?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: never
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_at?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_docs: {
        Row: {
          active: boolean
          always_include: boolean
          content_md: string
          created_at: string
          created_by: string | null
          embedding: string | null
          embedding_model: string | null
          fts: unknown
          id: string
          kind: string
          scope: string
          service_id: string | null
          source: string
          stage_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          always_include?: boolean
          content_md?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          kind?: string
          scope?: string
          service_id?: string | null
          source?: string
          stage_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          always_include?: boolean
          content_md?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          kind?: string
          scope?: string
          service_id?: string | null
          source?: string
          stage_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_docs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_docs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_docs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "service_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_proposals: {
        Row: {
          action: string
          after: Json
          before: Json | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          error: string | null
          explanation: string
          id: string
          session_id: string | null
          status: string
          target_id: string | null
          target_table: string | null
          teach_message_id: string | null
          title: string
        }
        Insert: {
          action: string
          after?: Json
          before?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          explanation?: string
          id?: string
          session_id?: string | null
          status?: string
          target_id?: string | null
          target_table?: string | null
          teach_message_id?: string | null
          title?: string
        }
        Update: {
          action?: string
          after?: Json
          before?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          explanation?: string
          id?: string
          session_id?: string | null
          status?: string
          target_id?: string | null
          target_table?: string | null
          teach_message_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_proposals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "teach_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_proposals_teach_message_id_fkey"
            columns: ["teach_message_id"]
            isOneToOne: false
            referencedRelation: "teach_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          id: number
          op: string
          row_id: string
          snapshot: Json
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: never
          op: string
          row_id: string
          snapshot: Json
          table_name: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: never
          op?: string
          row_id?: string
          snapshot?: Json
          table_name?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_run_id: string | null
          body: string
          case_id: string | null
          channel_id: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          external_id: string | null
          id: string
          kind: string
          media_description: string | null
          media_mime: string | null
          media_name: string | null
          media_path: string | null
          sender: string
          sender_profile_id: string | null
          sent_at: string | null
          status: string
          transcript: string | null
        }
        Insert: {
          ai_run_id?: string | null
          body?: string
          case_id?: string | null
          channel_id?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          media_description?: string | null
          media_mime?: string | null
          media_name?: string | null
          media_path?: string | null
          sender: string
          sender_profile_id?: string | null
          sent_at?: string | null
          status?: string
          transcript?: string | null
        }
        Update: {
          ai_run_id?: string | null
          body?: string
          case_id?: string | null
          channel_id?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          media_description?: string | null
          media_mime?: string | null
          media_name?: string | null
          media_path?: string | null
          sender?: string
          sender_profile_id?: string | null
          sent_at?: string | null
          status?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          color: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_documents: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
          label: string
          required: boolean
          service_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          key: string
          label: string
          required?: boolean
          service_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
          label?: string
          required?: boolean
          service_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_documents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_fields: {
        Row: {
          ai_hint: string
          created_at: string
          id: string
          key: string
          label: string
          options: Json
          required: boolean
          service_id: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          ai_hint?: string
          created_at?: string
          id?: string
          key: string
          label: string
          options?: Json
          required?: boolean
          service_id: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          ai_hint?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          required?: boolean
          service_id?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_fields_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          active: boolean
          amount: number | null
          created_at: string
          id: string
          kind: string
          label: string
          needs_review: boolean
          notes: string
          service_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          created_at?: string
          id?: string
          kind?: string
          label: string
          needs_review?: boolean
          notes?: string
          service_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          needs_review?: boolean
          notes?: string
          service_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_stages: {
        Row: {
          ai_can_advance: boolean
          color: string
          created_at: string
          emoji: string
          id: string
          instructions_md: string
          is_canceled: boolean
          is_final: boolean
          key: string
          mode_override: string | null
          name: string
          notify_mode: string
          notify_template: string
          require_checklist: boolean
          service_id: string
          sort_order: number
          updated_at: string
          waiting_on: string | null
        }
        Insert: {
          ai_can_advance?: boolean
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          instructions_md?: string
          is_canceled?: boolean
          is_final?: boolean
          key: string
          mode_override?: string | null
          name: string
          notify_mode?: string
          notify_template?: string
          require_checklist?: boolean
          service_id: string
          sort_order?: number
          updated_at?: string
          waiting_on?: string | null
        }
        Update: {
          ai_can_advance?: boolean
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          instructions_md?: string
          is_canceled?: boolean
          is_final?: boolean
          key?: string
          mode_override?: string | null
          name?: string
          notify_mode?: string
          notify_template?: string
          require_checklist?: boolean
          service_id?: string
          sort_order?: number
          updated_at?: string
          waiting_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_stages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          code_prefix: string
          color: string
          created_at: string
          emoji: string
          id: string
          instructions_md: string
          mode_override: string | null
          name: string
          short_description: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code_prefix?: string
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          instructions_md?: string
          mode_override?: string | null
          name: string
          short_description?: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code_prefix?: string
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          instructions_md?: string
          mode_override?: string | null
          name?: string
          short_description?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          about_md: string
          assistant_emoji: string
          assistant_name: string
          business_hours: Json
          company_address: string
          company_city: string
          company_name: string
          company_phone: string
          confidence_threshold: number
          debounce_seconds: number
          default_mode: string
          history_messages: number
          holidays: Json
          id: number
          onboarding_done: boolean
          out_of_hours_md: string
          payment_notes: string
          persona: Json
          persona_extra_md: string
          pix_holder: string
          pix_key: string
          pix_key_type: string
          test_debounce_seconds: number
          timezone: string
          updated_at: string
        }
        Insert: {
          about_md?: string
          assistant_emoji?: string
          assistant_name?: string
          business_hours?: Json
          company_address?: string
          company_city?: string
          company_name?: string
          company_phone?: string
          confidence_threshold?: number
          debounce_seconds?: number
          default_mode?: string
          history_messages?: number
          holidays?: Json
          id?: number
          onboarding_done?: boolean
          out_of_hours_md?: string
          payment_notes?: string
          persona?: Json
          persona_extra_md?: string
          pix_holder?: string
          pix_key?: string
          pix_key_type?: string
          test_debounce_seconds?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          about_md?: string
          assistant_emoji?: string
          assistant_name?: string
          business_hours?: Json
          company_address?: string
          company_city?: string
          company_name?: string
          company_phone?: string
          confidence_threshold?: number
          debounce_seconds?: number
          default_mode?: string
          history_messages?: number
          holidays?: Json
          id?: number
          onboarding_done?: boolean
          out_of_hours_md?: string
          payment_notes?: string
          persona?: Json
          persona_extra_md?: string
          pix_holder?: string
          pix_key?: string
          pix_key_type?: string
          test_debounce_seconds?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      teach_messages: {
        Row: {
          ai_run_id: string | null
          author_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          ai_run_id?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          ai_run_id?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teach_messages_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teach_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "teach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      teach_sessions: {
        Row: {
          context_run_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          context_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          context_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teach_sessions_context_run_id_fkey"
            columns: ["context_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teach_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_scenarios: {
        Row: {
          client_messages: Json
          created_at: string
          created_by: string | null
          description: string
          expectations: string
          id: string
          last_result: Json | null
          last_run_at: string | null
          last_status: string | null
          name: string
          setup: Json
          updated_at: string
        }
        Insert: {
          client_messages?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          expectations?: string
          id?: string
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          setup?: Json
          updated_at?: string
        }
        Update: {
          client_messages?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          expectations?: string
          id?: string
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          setup?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          chassis: string | null
          client_id: string | null
          color: string | null
          created_at: string
          id: string
          is_test: boolean
          model: string | null
          notes: string
          plate: string | null
          renavam: string | null
          updated_at: string
          year: string | null
        }
        Insert: {
          chassis?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          model?: string | null
          notes?: string
          plate?: string | null
          renavam?: string | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          chassis?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          model?: string | null
          notes?: string
          plate?: string | null
          renavam?: string | null
          updated_at?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: { p_limit?: number; p_lock_seconds?: number; p_worker: string }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: number
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_at: string
          status: string
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: {
        Args: { p_id: number; p_result?: Json }
        Returns: undefined
      }
      enqueue_job: {
        Args: {
          p_dedupe_key?: string
          p_delay_seconds?: number
          p_max_attempts?: number
          p_payload?: Json
          p_type: string
        }
        Returns: number
      }
      enqueue_job_internal: {
        Args: {
          p_dedupe_key?: string
          p_delay_seconds?: number
          p_max_attempts?: number
          p_payload?: Json
          p_type: string
        }
        Returns: number
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      fail_job: {
        Args: { p_error: string; p_id: number; p_retry_in_seconds?: number }
        Returns: undefined
      }
      get_provider_key: { Args: { p_provider_id: string }; Returns: string }
      is_owner: { Args: never; Returns: boolean }
      is_service_role: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      needs_setup: { Args: never; Returns: boolean }
      restore_version: { Args: { p_version_id: number }; Returns: undefined }
      run_job_now: { Args: { p_dedupe_key: string }; Returns: undefined }
      search_knowledge: {
        Args: {
          p_embedding?: string
          p_limit?: number
          p_model?: string
          p_query: string
          p_service_ids?: string[]
        }
        Returns: {
          content_md: string
          id: string
          kind: string
          scope: string
          score: number
          service_id: string
          stage_id: string
          title: string
        }[]
      }
      set_provider_key: {
        Args: { p_key: string; p_provider_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
