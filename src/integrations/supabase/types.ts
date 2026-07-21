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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      announcement_comments: {
        Row: {
          announcement_id: string
          author_id: string
          content: string
          created_at: string | null
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          announcement_id: string
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          announcement_id?: string
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reactions: {
        Row: {
          announcement_id: string
          created_at: string | null
          employee_id: string
          id: string
          reaction: string
          tenant_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string | null
          employee_id: string
          id?: string
          reaction?: string
          tenant_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          reaction?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reactions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcement_reactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_visibility: {
        Row: {
          announcement_id: string
          id: string
          target_id: string | null
          target_type: string
          tenant_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          target_id?: string | null
          target_type: string
          tenant_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          target_id?: string | null
          target_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_visibility_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_visibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          content: string
          cover_url: string | null
          created_at: string
          id: string
          pinned: boolean
          published_at: string | null
          status: string
          tags: string[]
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string
          cover_url?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          status?: string
          tags?: string[]
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          cover_url?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          status?: string
          tags?: string[]
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_bookmarks: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          sort_order: number
          tenant_id: string
          title: string
          url: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          sort_order?: number
          tenant_id: string
          title: string
          url: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          sort_order?: number
          tenant_id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      chat_conversation_label_assignments: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          label_id: string
          tenant_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          label_id: string
          tenant_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          label_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversation_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "chat_conversation_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversation_labels: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          area_id: string | null
          avatar_url: string | null
          canvas_doc_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string | null
          project_id: string | null
          tenant_id: string
          topic: string | null
          type: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          avatar_url?: string | null
          canvas_doc_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string | null
          project_id?: string | null
          tenant_id: string
          topic?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          avatar_url?: string | null
          canvas_doc_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string | null
          project_id?: string | null
          tenant_id?: string
          topic?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_huddles: {
        Row: {
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          livekit_room_name: string
          meeting_id: string | null
          started_at: string
          started_by: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          livekit_room_name: string
          meeting_id?: string | null
          started_at?: string
          started_by: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          livekit_room_name?: string
          meeting_id?: string | null
          started_at?: string
          started_by?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_huddles_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_huddles_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mentions: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          mention_type: string
          mentioned_employee_id: string
          message_id: string
          read_at: string | null
          tenant_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          mention_type?: string
          mentioned_employee_id: string
          message_id: string
          read_at?: string | null
          tenant_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          mention_type?: string
          mentioned_employee_id?: string
          message_id?: string
          read_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_for: string[]
          edited_at: string | null
          employee_id: string
          id: string
          pinned_at: string | null
          pinned_by: string | null
          reply_to_id: string | null
          thread_root_id: string | null
          type: string
        }
        Insert: {
          attachments?: Json
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_for?: string[]
          edited_at?: string | null
          employee_id: string
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          thread_root_id?: string | null
          type?: string
        }
        Update: {
          attachments?: Json
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_for?: string[]
          edited_at?: string | null
          employee_id?: string
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          thread_root_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_root_id_fkey"
            columns: ["thread_root_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          archived_at: string | null
          conversation_id: string
          employee_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          muted_until: string | null
          pinned_at: string | null
          role: string
          unread_override: boolean
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          employee_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          pinned_at?: string | null
          role?: string
          unread_override?: boolean
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          employee_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          pinned_at?: string | null
          role?: string
          unread_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_poll_options: {
        Row: {
          id: string
          poll_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          poll_id: string
          sort_order?: number
          text: string
        }
        Update: {
          id?: string
          poll_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_poll_votes: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          option_id: string
          poll_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          option_id: string
          poll_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          option_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "chat_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_polls: {
        Row: {
          closed_at: string | null
          closes_at: string | null
          conversation_id: string
          created_at: string
          created_by: string
          id: string
          message_id: string | null
          multi: boolean
          question: string
          tenant_id: string
        }
        Insert: {
          closed_at?: string | null
          closes_at?: string | null
          conversation_id: string
          created_at?: string
          created_by: string
          id?: string
          message_id?: string | null
          multi?: boolean
          question: string
          tenant_id: string
        }
        Update: {
          closed_at?: string | null
          closes_at?: string | null
          conversation_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message_id?: string | null
          multi?: boolean
          question?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_presence: {
        Row: {
          dnd_until: string | null
          employee_id: string
          id: string
          is_online: boolean
          last_seen_at: string
          status_emoji: string | null
          status_text: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          dnd_until?: string | null
          employee_id: string
          id?: string
          is_online?: boolean
          last_seen_at?: string
          status_emoji?: string | null
          status_text?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          dnd_until?: string | null
          employee_id?: string
          id?: string
          is_online?: boolean
          last_seen_at?: string
          status_emoji?: string | null
          status_text?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          employee_id: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          employee_id: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          employee_id?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reminders: {
        Row: {
          conversation_id: string | null
          created_at: string
          employee_id: string
          fired_at: string | null
          id: string
          message_id: string | null
          remind_at: string
          tenant_id: string
          text: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          employee_id: string
          fired_at?: string | null
          id?: string
          message_id?: string | null
          remind_at: string
          tenant_id: string
          text?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          employee_id?: string
          fired_at?: string | null
          id?: string
          message_id?: string | null
          remind_at?: string
          tenant_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_reminders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_starred_messages: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          message_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          message_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          message_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_starred_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_areas: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          position: string
          sort_order: number | null
          tenant_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          position: string
          sort_order?: number | null
          tenant_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          position?: string
          sort_order?: number | null
          tenant_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_positions: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
          position_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
          position_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_projects: {
        Row: {
          employee_id: string
          joined_at: string | null
          project_id: string
          role_in_project: string | null
          tenant_id: string
        }
        Insert: {
          employee_id: string
          joined_at?: string | null
          project_id: string
          role_in_project?: string | null
          tenant_id: string
        }
        Update: {
          employee_id?: string
          joined_at?: string | null
          project_id?: string
          role_in_project?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_projects_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_projects_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_projects_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_projects_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "employee_projects_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_hierarchy_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "employee_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          employee_id: string
          id: string
          new_status: Database["public"]["Enums"]["employee_status"]
          old_status: Database["public"]["Enums"]["employee_status"] | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          new_status: Database["public"]["Enums"]["employee_status"]
          old_status?: Database["public"]["Enums"]["employee_status"] | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["employee_status"]
          old_status?: Database["public"]["Enums"]["employee_status"] | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_status_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_status_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_status_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_status_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "employee_status_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admission_date: string | null
          created_at: string | null
          id: string
          is_ceo: boolean | null
          is_test: boolean
          manager_id: string | null
          phone: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          status_reason: string | null
          tenant_id: string
          termination_date: string | null
          updated_at: string | null
          user_id: string | null
          work_email: string | null
        }
        Insert: {
          admission_date?: string | null
          created_at?: string | null
          id?: string
          is_ceo?: boolean | null
          is_test?: boolean
          manager_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          status_reason?: string | null
          tenant_id: string
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_email?: string | null
        }
        Update: {
          admission_date?: string | null
          created_at?: string | null
          id?: string
          is_ceo?: boolean | null
          is_test?: boolean
          manager_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          status_reason?: string | null
          tenant_id?: string
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_audio_transcriptions: {
        Row: {
          attachment_url: string
          created_at: string
          created_by: string | null
          id: string
          language: string | null
          model: string | null
          tenant_id: string
          transcription: string
        }
        Insert: {
          attachment_url: string
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string | null
          model?: string | null
          tenant_id: string
          transcription: string
        }
        Update: {
          attachment_url?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string | null
          model?: string | null
          tenant_id?: string
          transcription?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_audio_transcriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          employee_id: string
          feed_post_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          employee_id: string
          feed_post_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          employee_id?: string
          feed_post_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "feed_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_comments_feed_post_id_fkey"
            columns: ["feed_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          employee_id: string
          id: string
          tags: string[]
          tenant_id: string
          updated_at: string
          visibility_targets: Json
          visibility_type: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          employee_id: string
          id?: string
          tags?: string[]
          tenant_id: string
          updated_at?: string
          visibility_targets?: Json
          visibility_type?: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          employee_id?: string
          id?: string
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          visibility_targets?: Json
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_posts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_posts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "feed_posts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_reactions: {
        Row: {
          created_at: string
          employee_id: string
          feed_post_id: string
          id: string
          reaction: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          feed_post_id: string
          id?: string
          reaction?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          feed_post_id?: string
          id?: string
          reaction?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "feed_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "feed_reactions_feed_post_id_fkey"
            columns: ["feed_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_access: {
        Row: {
          created_at: string
          grant_type: string
          id: string
          permission: string
          resource_id: string
          resource_type: string
          target_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          grant_type: string
          id?: string
          permission?: string
          resource_id: string
          resource_type: string
          target_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          grant_type?: string
          id?: string
          permission?: string
          resource_id?: string
          resource_type?: string
          target_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          folder_id: string | null
          id: string
          is_personal: boolean
          link_url: string | null
          owner_id: string | null
          sort_order: number
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          is_personal?: boolean
          link_url?: string | null
          owner_id?: string | null
          sort_order?: number
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          is_personal?: boolean
          link_url?: string | null
          owner_id?: string | null
          sort_order?: number
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_shares: {
        Row: {
          created_at: string
          document_id: string
          id: string
          permission: string
          shared_by: string
          shared_with: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          permission?: string
          shared_by: string
          shared_with: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          permission?: string
          shared_by?: string
          shared_with?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_ai_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_chunks: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          meeting_id: string
          metadata: Json
          phase: string
          processed_chunks: number
          progress: number
          started_at: string | null
          status: string
          tenant_id: string
          total_chunks: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_chunks?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          meeting_id: string
          metadata?: Json
          phase?: string
          processed_chunks?: number
          progress?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          total_chunks?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_chunks?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          meeting_id?: string
          metadata?: Json
          phase?: string
          processed_chunks?: number
          progress?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          total_chunks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_ai_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_ai_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_approved_items: {
        Row: {
          approved_at: string | null
          id: string
          item_id: string | null
          item_type: string
          meeting_id: string
          original_suggestion: Json | null
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          id?: string
          item_id?: string | null
          item_type: string
          meeting_id: string
          original_suggestion?: Json | null
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          id?: string
          item_id?: string | null
          item_type?: string
          meeting_id?: string
          original_suggestion?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_approved_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_approved_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          attendance_status: string | null
          created_at: string | null
          email: string | null
          employee_id: string | null
          id: string
          meeting_id: string
          name: string
          role: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          attendance_status?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          meeting_id: string
          name: string
          role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          attendance_status?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          meeting_id?: string
          name?: string
          role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "meeting_attendees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "meeting_attendees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "meeting_attendees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_guest_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          guest_name: string
          guest_token: string
          id: string
          livekit_room_name: string
          meeting_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          guest_name: string
          guest_token?: string
          id?: string
          livekit_room_name: string
          meeting_id: string
          requested_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          guest_name?: string
          guest_token?: string
          id?: string
          livekit_room_name?: string
          meeting_id?: string
          requested_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_guest_requests_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_recording_events: {
        Row: {
          created_at: string
          event_type: string
          huddle_id: string | null
          id: string
          meeting_id: string | null
          participant_identity: string | null
          payload: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          huddle_id?: string | null
          id?: string
          meeting_id?: string | null
          participant_identity?: string | null
          payload?: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          huddle_id?: string | null
          id?: string
          meeting_id?: string | null
          participant_identity?: string | null
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_recording_events_huddle_id_fkey"
            columns: ["huddle_id"]
            isOneToOne: false
            referencedRelation: "chat_huddles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_recording_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          action_items: Json | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          attention_points: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          egress_id: string | null
          ended_at: string | null
          generated_projects: Json | null
          generated_tasks: Json | null
          id: string
          is_recurring: boolean
          key_points: Json | null
          last_reminder_sent_at: string | null
          live_participants: Json
          livekit_room_name: string | null
          location: string | null
          meeting_mode: string
          metadata: Json | null
          next_occurrence_at: string | null
          participants: Json | null
          project_id: string | null
          recording_status: string | null
          recording_url: string | null
          recurrence_pattern: Json | null
          reminder_minutes_before: number
          scheduled_date: string | null
          scheduled_time: string | null
          soniox_session_id: string | null
          started_at: string | null
          status: string
          summary_markdown: string | null
          tenant_id: string
          title: string
          transcript_final: string | null
          transcript_raw: string | null
          updated_at: string | null
        }
        Insert: {
          action_items?: Json | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attention_points?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          generated_projects?: Json | null
          generated_tasks?: Json | null
          id?: string
          is_recurring?: boolean
          key_points?: Json | null
          last_reminder_sent_at?: string | null
          live_participants?: Json
          livekit_room_name?: string | null
          location?: string | null
          meeting_mode?: string
          metadata?: Json | null
          next_occurrence_at?: string | null
          participants?: Json | null
          project_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          recurrence_pattern?: Json | null
          reminder_minutes_before?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          soniox_session_id?: string | null
          started_at?: string | null
          status?: string
          summary_markdown?: string | null
          tenant_id: string
          title: string
          transcript_final?: string | null
          transcript_raw?: string | null
          updated_at?: string | null
        }
        Update: {
          action_items?: Json | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attention_points?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          generated_projects?: Json | null
          generated_tasks?: Json | null
          id?: string
          is_recurring?: boolean
          key_points?: Json | null
          last_reminder_sent_at?: string | null
          live_participants?: Json
          livekit_room_name?: string | null
          location?: string | null
          meeting_mode?: string
          metadata?: Json | null
          next_occurrence_at?: string | null
          participants?: Json | null
          project_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          recurrence_pattern?: Json | null
          reminder_minutes_before?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          soniox_session_id?: string | null
          started_at?: string | null
          status?: string
          summary_markdown?: string | null
          tenant_id?: string
          title?: string
          transcript_final?: string | null
          transcript_raw?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_hierarchy_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          source: string | null
          source_id: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          source?: string | null
          source_id?: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          source?: string | null
          source_id?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          area_id: string | null
          created_at: string | null
          description: string | null
          goals: string[] | null
          id: string
          level: number | null
          reports_to_id: string | null
          responsibilities: string[] | null
          sort_order: number | null
          subarea_id: string | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          level?: number | null
          reports_to_id?: string | null
          responsibilities?: string[] | null
          sort_order?: number | null
          subarea_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          level?: number | null
          reports_to_id?: string | null
          responsibilities?: string[] | null
          sort_order?: number | null
          subarea_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["subarea_id"]
          },
          {
            foreignKeyName: "positions_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      process_areas: {
        Row: {
          area_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          process_id: string
          subarea_id: string | null
        }
        Insert: {
          area_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          process_id: string
          subarea_id?: string | null
        }
        Update: {
          area_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          process_id?: string
          subarea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "process_areas_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_areas_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
          {
            foreignKeyName: "process_areas_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["subarea_id"]
          },
          {
            foreignKeyName: "process_areas_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
        ]
      }
      process_doc_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          name: string
          parent_id: string | null
          process_id: string
          public_token: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          name: string
          parent_id?: string | null
          process_id: string
          public_token?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          name?: string
          parent_id?: string | null
          process_id?: string
          public_token?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_doc_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "process_doc_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "process_doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_doc_folders_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_doc_folders_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
          {
            foreignKeyName: "process_doc_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      process_documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          folder_id: string | null
          id: string
          is_public: boolean
          process_id: string
          public_token: string | null
          sort_order: number
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          process_id: string
          public_token?: string | null
          sort_order?: number
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          process_id?: string
          public_token?: string | null
          sort_order?: number
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "process_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "process_doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
          {
            foreignKeyName: "process_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      process_folders: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "process_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "process_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      process_positions: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          position_id: string
          process_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          position_id: string
          process_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          position_id?: string
          process_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "process_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_positions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_positions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
        ]
      }
      process_steps: {
        Row: {
          checklist_items: string[] | null
          created_at: string | null
          description: string | null
          estimated_time: number | null
          id: string
          process_id: string
          responsible_position_id: string | null
          sort_order: number | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          checklist_items?: string[] | null
          created_at?: string | null
          description?: string | null
          estimated_time?: number | null
          id?: string
          process_id: string
          responsible_position_id?: string | null
          sort_order?: number | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          checklist_items?: string[] | null
          created_at?: string | null
          description?: string | null
          estimated_time?: number | null
          id?: string
          process_id?: string
          responsible_position_id?: string | null
          sort_order?: number | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
          {
            foreignKeyName: "process_steps_responsible_position_id_fkey"
            columns: ["responsible_position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "process_steps_responsible_position_id_fkey"
            columns: ["responsible_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tag_assignments: {
        Row: {
          created_at: string | null
          id: string
          process_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          process_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          process_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_tag_assignments_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tag_assignments_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_hierarchy_view"
            referencedColumns: ["process_id"]
          },
          {
            foreignKeyName: "process_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "process_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tags: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "process_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          area_id: string | null
          bpmn_data: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          flow_data: Json | null
          folder_id: string | null
          id: string
          name: string
          original_prompt: string | null
          position_id: string | null
          process_markdown: string | null
          status: Database["public"]["Enums"]["process_status"] | null
          subarea_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          bpmn_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_data?: Json | null
          folder_id?: string | null
          id?: string
          name: string
          original_prompt?: string | null
          position_id?: string | null
          process_markdown?: string | null
          status?: Database["public"]["Enums"]["process_status"] | null
          subarea_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          bpmn_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_data?: Json | null
          folder_id?: string | null
          id?: string
          name?: string
          original_prompt?: string | null
          position_id?: string | null
          process_markdown?: string | null
          status?: Database["public"]["Enums"]["process_status"] | null
          subarea_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "processes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "process_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "processes_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["subarea_id"]
          },
          {
            foreignKeyName: "processes_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          dnd_until: string | null
          full_name: string | null
          is_system_bot: boolean
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          dnd_until?: string | null
          full_name?: string | null
          is_system_bot?: boolean
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          dnd_until?: string | null
          full_name?: string | null
          is_system_bot?: boolean
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_doc_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          name: string
          parent_id: string | null
          project_id: string
          public_token: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          name: string
          parent_id?: string | null
          project_id: string
          public_token?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          name?: string
          parent_id?: string | null
          project_id?: string
          public_token?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_doc_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_doc_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_doc_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_hierarchy_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_doc_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          folder_id: string | null
          id: string
          is_public: boolean
          project_id: string
          public_token: string | null
          sort_order: number
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          project_id: string
          public_token?: string | null
          sort_order?: number
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          project_id?: string
          public_token?: string | null
          sort_order?: number
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_hierarchy_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          owner_id: string | null
          potential_revenue: number | null
          potential_savings: number | null
          priority: string | null
          progress: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          owner_id?: string | null
          potential_revenue?: number | null
          potential_savings?: number | null
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          potential_revenue?: number | null
          potential_savings?: number | null
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          employee_id: string
          endpoint: string
          id: string
          keys: Json
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          endpoint: string
          id?: string
          keys: Json
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          endpoint?: string
          id?: string
          keys?: Json
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      subareas: {
        Row: {
          area_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          area_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subareas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subareas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "subareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string | null
          employee_id: string
          id: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string | null
          employee_id: string
          id?: string
          task_id: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string | null
          employee_id?: string
          id?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "task_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          task_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence: {
        Row: {
          created_at: string | null
          day_of_month: number | null
          days_of_week: number[] | null
          end_date: string | null
          frequency: string
          id: string
          interval_days: number | null
          is_active: boolean | null
          next_occurrence: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          frequency: string
          id?: string
          interval_days?: number | null
          is_active?: boolean | null
          next_occurrence: string
          task_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval_days?: number | null
          is_active?: boolean | null
          next_occurrence?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          recurrence_id: string
          tenant_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          recurrence_id: string
          tenant_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          recurrence_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrence_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "task_recurrence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence_completions: {
        Row: {
          completed_by: string
          completion_date: string
          created_at: string | null
          id: string
          notes: string | null
          recurrence_id: string
          tenant_id: string
        }
        Insert: {
          completed_by: string
          completion_date: string
          created_at?: string | null
          id?: string
          notes?: string | null
          recurrence_id: string
          tenant_id: string
        }
        Update: {
          completed_by?: string
          completion_date?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          recurrence_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrence_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "task_recurrence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_completions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_time_entries: {
        Row: {
          created_at: string
          duration_seconds: number | null
          employee_id: string
          ended_at: string | null
          id: string
          note: string | null
          started_at: string
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          employee_id: string
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          employee_id?: string
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "task_time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          attachments: Json | null
          checklist_items: Json | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          labels: Json | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          attachments?: Json | null
          checklist_items?: Json | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          project_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          attachments?: Json | null
          checklist_items?: Json | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          project_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_hierarchy_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_platforms: {
        Row: {
          color: string
          created_at: string
          description: string
          href: string
          id: string
          initial: string
          name: string
          order_index: number
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          href: string
          id?: string
          initial?: string
          name: string
          order_index?: number
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          href?: string
          id?: string
          initial?: string
          name?: string
          order_index?: number
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_platforms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          favicon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          primary_color_dark: string | null
          secondary_color: string | null
          secondary_color_dark: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          primary_color_dark?: string | null
          secondary_color?: string | null
          secondary_color_dark?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          primary_color_dark?: string | null
          secondary_color?: string | null
          secondary_color_dark?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          event: string
          id: string
          payload: Json | null
          response_body: string | null
          response_status: number | null
          success: boolean | null
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          created_at?: string | null
          event: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          tenant_id: string
          webhook_id: string
        }
        Update: {
          created_at?: string | null
          event?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean
          name: string
          secret: string | null
          tenant_id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          name: string
          secret?: string | null
          tenant_id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          name?: string
          secret?: string | null
          tenant_id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employees_hierarchy_view: {
        Row: {
          active_projects: number | null
          admission_date: string | null
          area_color: string | null
          area_id: string | null
          area_name: string | null
          area_type: string | null
          avatar_url: string | null
          employee_id: string | null
          full_name: string | null
          is_ceo: boolean | null
          pending_tasks: number | null
          position_level: number | null
          position_title: string | null
          primary_position_id: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          subarea_id: string | null
          subarea_name: string | null
          tasks_completed_this_week: number | null
          tenant_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organograma_view: {
        Row: {
          active_projects: number | null
          area_color: string | null
          area_id: string | null
          area_name: string | null
          area_type: string | null
          avatar_url: string | null
          employee_id: string | null
          full_name: string | null
          is_ceo: boolean | null
          level: number | null
          manager_employee_id: string | null
          manager_id: string | null
          manager_name: string | null
          manager_position_title: string | null
          pending_tasks: number | null
          position_reports_to_id: string | null
          position_title: string | null
          primary_position_id: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          subarea_color: string | null
          subarea_id: string | null
          subarea_name: string | null
          tasks_completed_this_week: number | null
          tenant_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["manager_employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["position_reports_to_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["position_reports_to_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_hierarchy_view: {
        Row: {
          area_color: string | null
          area_id: string | null
          area_name: string | null
          area_type: string | null
          description: string | null
          employee_avatar_url: string | null
          employee_count: number | null
          employee_id: string | null
          employee_name: string | null
          employee_status: Database["public"]["Enums"]["employee_status"] | null
          is_employee_ceo: boolean | null
          level: number | null
          position_id: string | null
          position_title: string | null
          reports_to_id: string | null
          reports_to_title: string | null
          sort_order: number | null
          subarea_color: string | null
          subarea_id: string | null
          subarea_name: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["subarea_id"]
          },
          {
            foreignKeyName: "positions_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      processes_hierarchy_view: {
        Row: {
          area_color: string | null
          area_id: string | null
          area_name: string | null
          area_type: string | null
          created_at: string | null
          created_by: string | null
          flow_data: Json | null
          linked_positions_count: number | null
          name: string | null
          original_prompt: string | null
          primary_position_id: string | null
          primary_position_title: string | null
          process_id: string | null
          process_markdown: string | null
          status: Database["public"]["Enums"]["process_status"] | null
          subarea_id: string | null
          subarea_name: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "processes_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "position_hierarchy_view"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "processes_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "organograma_view"
            referencedColumns: ["subarea_id"]
          },
          {
            foreignKeyName: "processes_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_hierarchy_view: {
        Row: {
          completed_tasks_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          members_count: number | null
          name: string | null
          priority: string | null
          progress: number | null
          project_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          tasks_count: number | null
          tenant_id: string | null
        }
        Insert: {
          completed_tasks_count?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          members_count?: never
          name?: string | null
          priority?: string | null
          progress?: number | null
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          tasks_count?: never
          tenant_id?: string | null
        }
        Update: {
          completed_tasks_count?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          members_count?: never
          name?: string | null
          priority?: string | null
          progress?: number | null
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          tasks_count?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      area_employee_ids: {
        Args: { p_area_id: string }
        Returns: {
          emp_id: string
        }[]
      }
      chat_my_conversation_ids: {
        Args: never
        Returns: {
          conversation_id: string
        }[]
      }
      chat_my_employee_id: { Args: never; Returns: string }
      chat_my_tenant_id: { Args: never; Returns: string }
      chat_presence_my_employee_id: { Args: never; Returns: string }
      chat_user_created_conversation: {
        Args: { p_conv_id: string }
        Returns: boolean
      }
      compute_next_meeting_occurrence: {
        Args: { p_after?: string; p_pattern: Json }
        Returns: string
      }
      diagnostico_feed_posts_raw: { Args: never; Returns: Json }
      diagnostico_feed_visibilidade: { Args: never; Returns: Json }
      ensure_area_channel: {
        Args: { p_area_id: string; p_area_name: string; p_tenant_id: string }
        Returns: string
      }
      ensure_dm_conversation: {
        Args: { p_tenant_id: string; p_user_a: string; p_user_b: string }
        Returns: string
      }
      ensure_system_bot: { Args: { p_tenant_id: string }; Returns: string }
      get_chat_conversations_overview: {
        Args: never
        Returns: {
          archived_at: string
          area_id: string
          avatar_url: string
          created_at: string
          created_by: string
          description: string
          id: string
          last_message_at: string
          last_message_content: string
          last_message_employee_id: string
          last_message_id: string
          last_message_type: string
          muted_until: string
          my_last_read_at: string
          my_role: string
          name: string
          participant_ids: string[]
          pinned_at: string
          project_id: string
          tenant_id: string
          topic: string
          type: string
          unread_count: number
          updated_at: string
        }[]
      }
      get_meeting_created_by: {
        Args: { p_meeting_id: string }
        Returns: string
      }
      get_project_created_by: {
        Args: { p_project_id: string }
        Returns: string
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_meeting_host: { Args: { p_meeting_id: string }; Returns: boolean }
      kb_user_has_access: {
        Args: {
          p_resource_id: string
          p_resource_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      migrate_manager_to_position_hierarchy: { Args: never; Returns: undefined }
      process_task_recurrences: { Args: never; Returns: Json }
      user_can_read_feed_post: { Args: { p_post_id: string }; Returns: boolean }
      user_can_read_process: {
        Args: { p_process_id: string }
        Returns: boolean
      }
      user_can_read_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_has_process_access: {
        Args: { p_process_id: string }
        Returns: boolean
      }
      user_has_project_assigned_task: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_owns_or_member_of_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_process_matches_position_or_area: {
        Args: { p_process_id: string }
        Returns: boolean
      }
      user_project_matches_area: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_project_matches_position_or_area: {
        Args: { p_project_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "member"
      employee_status: "active" | "inactive" | "on_leave"
      process_status: "draft" | "active" | "archived"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "backlog"
        | "todo"
        | "doing"
        | "review"
        | "ajustes"
        | "done"
        | "arquivado"
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
      app_role: ["admin", "manager", "member"],
      employee_status: ["active", "inactive", "on_leave"],
      process_status: ["draft", "active", "archived"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "backlog",
        "todo",
        "doing",
        "review",
        "ajustes",
        "done",
        "arquivado",
      ],
    },
  },
} as const
