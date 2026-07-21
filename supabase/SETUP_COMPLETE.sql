-- ─────────────────────────────────────────────────────────────────
-- SETUP COMPLETO — gerado por introspecção do banco vivo
-- Cole no SQL Editor do Supabase e Run.
-- Geração: 2026-05-12T23:21:12.748Z
-- ─────────────────────────────────────────────────────────────────

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE public."app_role" AS ENUM ('admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."employee_status" AS ENUM ('active', 'inactive', 'on_leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."process_status" AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."project_status" AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."task_priority" AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."task_status" AS ENUM ('backlog', 'todo', 'doing', 'review', 'ajustes', 'done', 'arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


CREATE TABLE IF NOT EXISTS public."announcement_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."announcement_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "reaction" text DEFAULT 'like'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."announcement_visibility" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid
);

CREATE TABLE IF NOT EXISTS public."announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "title" text NOT NULL,
  "content" text DEFAULT ''::text NOT NULL,
  "type" text DEFAULT 'post'::text NOT NULL,
  "status" text DEFAULT 'published'::text NOT NULL,
  "cover_url" text,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."chat_channel_members" (
  "channel_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now(),
  "last_read_at" timestamp with time zone DEFAULT now(),
  "role" text DEFAULT 'member'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."chat_channel_mutes" (
  "channel_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "muted_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."chat_channels" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_dm" boolean DEFAULT false NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_system" boolean DEFAULT false NOT NULL,
  "avatar_url" text,
  "area_id" uuid
);

CREATE TABLE IF NOT EXISTS public."chat_huddles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "room_name" text NOT NULL,
  "started_by" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT now(),
  "ended_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "parent_id" uuid,
  "edited_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_pinned_messages" (
  "message_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "pinned_by" uuid NOT NULL,
  "pinned_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_poll_votes" (
  "poll_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "option_idx" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_polls" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "question" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "multi" boolean DEFAULT false NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_presence" (
  "user_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_reactions" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "emoji" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_starred_messages" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "starred_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."chat_user_favorites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."company_areas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "position" text NOT NULL,
  "color" text DEFAULT '#7c3bed'::text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."employee_positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "position_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."employee_projects" (
  "employee_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "role_in_project" text DEFAULT 'member'::text,
  "joined_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."employee_status_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "old_status" public."employee_status",
  "new_status" public."employee_status" NOT NULL,
  "reason" text,
  "changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."employees" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid,
  "manager_id" uuid,
  "status" public."employee_status" DEFAULT 'active'::employee_status,
  "admission_date" date,
  "phone" text,
  "work_email" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_ceo" boolean DEFAULT false,
  "termination_date" date,
  "status_reason" text,
  "is_test" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public."feed_audio_transcriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "attachment_url" text NOT NULL,
  "transcription" text NOT NULL,
  "language" text,
  "model" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."feed_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "feed_post_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public."feed_posts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "visibility_type" text DEFAULT 'all'::text NOT NULL,
  "visibility_targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public."feed_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "feed_post_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "reaction" text DEFAULT 'like'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."knowledge_base_access" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "grant_type" text NOT NULL,
  "target_id" text,
  "permission" text DEFAULT 'read'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."knowledge_base_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "folder_id" uuid,
  "title" text NOT NULL,
  "content" text,
  "type" text DEFAULT 'document'::text NOT NULL,
  "link_url" text,
  "is_personal" boolean DEFAULT false NOT NULL,
  "owner_id" uuid,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."knowledge_base_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."knowledge_base_shares" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "shared_by" uuid NOT NULL,
  "shared_with" uuid NOT NULL,
  "permission" text DEFAULT 'read'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."meeting_ai_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "phase" text DEFAULT 'queued'::text NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "total_chunks" integer DEFAULT 0 NOT NULL,
  "processed_chunks" integer DEFAULT 0 NOT NULL,
  "failed_chunks" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."meeting_approved_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "item_type" text NOT NULL,
  "item_id" uuid,
  "original_suggestion" jsonb,
  "approved_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."meeting_attendees" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL,
  "employee_id" uuid,
  "name" text NOT NULL,
  "email" text,
  "role" text DEFAULT 'required'::text,
  "attendance_status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid
);

CREATE TABLE IF NOT EXISTS public."meeting_guest_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL,
  "livekit_room_name" text NOT NULL,
  "guest_name" text NOT NULL,
  "guest_token" uuid DEFAULT gen_random_uuid() NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "decided_by" uuid,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."meeting_recording_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "meeting_id" uuid,
  "huddle_id" uuid,
  "event_type" text NOT NULL,
  "participant_identity" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."meetings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "duration_seconds" integer,
  "created_by" uuid,
  "transcript_raw" text,
  "transcript_final" text,
  "summary_markdown" text,
  "action_items" jsonb DEFAULT '[]'::jsonb,
  "key_points" jsonb DEFAULT '[]'::jsonb,
  "attention_points" jsonb DEFAULT '[]'::jsonb,
  "participants" jsonb DEFAULT '[]'::jsonb,
  "approval_status" text DEFAULT 'pending'::text,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "generated_projects" jsonb DEFAULT '[]'::jsonb,
  "generated_tasks" jsonb DEFAULT '[]'::jsonb,
  "soniox_session_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "scheduled_date" date,
  "scheduled_time" time without time zone,
  "project_id" uuid,
  "location" text,
  "meeting_mode" text DEFAULT 'livekit'::text NOT NULL,
  "livekit_room_name" text,
  "recording_url" text,
  "recording_status" text,
  "egress_id" text,
  "live_participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_recurring" boolean DEFAULT false NOT NULL,
  "recurrence_pattern" jsonb,
  "reminder_minutes_before" integer DEFAULT 5 NOT NULL,
  "next_occurrence_at" timestamp with time zone,
  "last_reminder_sent_at" timestamp with time zone,
  "area_id" uuid,
  "estimated_duration_minutes" integer
);

CREATE TABLE IF NOT EXISTS public."notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text DEFAULT ''::text NOT NULL,
  "body_md" text DEFAULT ''::text NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "color" text,
  "pinned" boolean DEFAULT false NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "source_id" uuid,
  "source" text DEFAULT 'system'::text
);

CREATE TABLE IF NOT EXISTS public."positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "subarea_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "responsibilities" text[],
  "goals" text[],
  "level" integer DEFAULT 1,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "area_id" uuid,
  "reports_to_id" uuid
);

CREATE TABLE IF NOT EXISTS public."process_areas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "area_id" uuid NOT NULL,
  "subarea_id" uuid,
  "is_primary" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_doc_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "public_token" text,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."process_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "folder_id" uuid,
  "title" text NOT NULL,
  "content" text,
  "type" text DEFAULT 'document'::text NOT NULL,
  "file_path" text,
  "file_size" bigint,
  "file_type" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "public_token" text,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."process_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "parent_id" uuid,
  "sort_order" integer DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "position_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_steps" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "process_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0,
  "estimated_time" integer,
  "responsible_position_id" uuid,
  "checklist_items" text[],
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_tag_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."process_tags" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#6366f1'::text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."processes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "position_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "status" public."process_status" DEFAULT 'draft'::process_status,
  "bpmn_data" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "process_markdown" text,
  "flow_data" jsonb,
  "original_prompt" text,
  "subarea_id" uuid,
  "area_id" uuid,
  "folder_id" uuid
);

CREATE TABLE IF NOT EXISTS public."profiles" (
  "user_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "full_name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_system_bot" boolean DEFAULT false NOT NULL,
  "dnd_until" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."project_doc_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "public_token" text,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."project_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "folder_id" uuid,
  "title" text NOT NULL,
  "content" text,
  "type" text DEFAULT 'document'::text NOT NULL,
  "file_path" text,
  "file_size" bigint,
  "file_type" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "public_token" text,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" public."project_status" DEFAULT 'planning'::project_status,
  "priority" text,
  "start_date" date,
  "end_date" date,
  "progress" integer DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "owner_id" uuid,
  "potential_revenue" numeric(14,2),
  "potential_savings" numeric(14,2)
);

CREATE TABLE IF NOT EXISTS public."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "keys" jsonb NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."scheduled_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "channel_id" uuid,
  "recipient_user_id" uuid,
  "content" text NOT NULL,
  "send_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."subareas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "area_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_assignees" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_dependencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "depends_on_task_id" uuid NOT NULL,
  "dependency_type" text DEFAULT 'blocks'::text NOT NULL,
  "tenant_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."task_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "field" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."task_recurrence" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "frequency" text NOT NULL,
  "interval_days" integer,
  "days_of_week" int4[],
  "day_of_month" integer,
  "end_date" date,
  "next_occurrence" date NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_recurrence_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recurrence_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_recurrence_completions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recurrence_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "completed_by" uuid NOT NULL,
  "completion_date" date NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."task_time_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "duration_seconds" integer,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "project_id" uuid,
  "assignee_id" uuid,
  "created_by" uuid,
  "title" text NOT NULL,
  "description" text,
  "status" public."task_status" DEFAULT 'backlog'::task_status,
  "priority" public."task_priority" DEFAULT 'medium'::task_priority,
  "due_date" timestamp with time zone,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "checklist_items" jsonb DEFAULT '[]'::jsonb,
  "labels" jsonb DEFAULT '[]'::jsonb,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "cover_url" text,
  "parent_task_id" uuid,
  "source_meeting_id" uuid
);

CREATE TABLE IF NOT EXISTS public."tenant_platforms" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "href" text NOT NULL,
  "color" text DEFAULT 'from-blue-500 to-indigo-600'::text NOT NULL,
  "initial" text DEFAULT '?'::text NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "thumbnail_url" text
);

CREATE TABLE IF NOT EXISTS public."tenants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo_url" text,
  "primary_color" text DEFAULT '#7C3AED'::text,
  "secondary_color" text,
  "favicon_url" text,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "primary_color_dark" text,
  "secondary_color_dark" text,
  "logo_dark_url" text,
  "custom_domain" text
);

CREATE TABLE IF NOT EXISTS public."user_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" public."app_role" NOT NULL
);

CREATE TABLE IF NOT EXISTS public."webhook_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event" text NOT NULL,
  "payload" jsonb,
  "response_status" integer,
  "response_body" text,
  "success" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."webhooks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "secret" text,
  "events" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE announcement_comments ADD CONSTRAINT "announcement_comments_pkey" PRIMARY KEY (id);
ALTER TABLE announcement_reactions ADD CONSTRAINT "announcement_reactions_announcement_id_employee_id_reaction_key" UNIQUE (announcement_id, employee_id, reaction);
ALTER TABLE announcement_reactions ADD CONSTRAINT "announcement_reactions_pkey" PRIMARY KEY (id);
ALTER TABLE announcement_visibility ADD CONSTRAINT "announcement_visibility_pkey" PRIMARY KEY (id);
ALTER TABLE announcements ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE chat_channel_members ADD CONSTRAINT "chat_channel_members_pkey" PRIMARY KEY (channel_id, user_id);
ALTER TABLE chat_channel_mutes ADD CONSTRAINT "chat_channel_mutes_pkey" PRIMARY KEY (channel_id, user_id);
ALTER TABLE chat_channels ADD CONSTRAINT "chat_channels_pkey" PRIMARY KEY (id);
ALTER TABLE chat_huddles ADD CONSTRAINT "chat_huddles_pkey" PRIMARY KEY (id);
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id);
ALTER TABLE chat_pinned_messages ADD CONSTRAINT "chat_pinned_messages_pkey" PRIMARY KEY (message_id);
ALTER TABLE chat_poll_votes ADD CONSTRAINT "chat_poll_votes_pkey" PRIMARY KEY (poll_id, user_id, option_idx);
ALTER TABLE chat_polls ADD CONSTRAINT "chat_polls_pkey" PRIMARY KEY (id);
ALTER TABLE chat_presence ADD CONSTRAINT "chat_presence_pkey" PRIMARY KEY (user_id);
ALTER TABLE chat_reactions ADD CONSTRAINT "chat_reactions_pkey" PRIMARY KEY (message_id, user_id, emoji);
ALTER TABLE chat_starred_messages ADD CONSTRAINT "chat_starred_messages_pkey" PRIMARY KEY (message_id, user_id);
ALTER TABLE chat_user_favorites ADD CONSTRAINT "chat_user_favorites_pkey" PRIMARY KEY (id);
ALTER TABLE chat_user_favorites ADD CONSTRAINT "chat_user_favorites_user_id_channel_id_key" UNIQUE (user_id, channel_id);
ALTER TABLE company_areas ADD CONSTRAINT "company_areas_pkey" PRIMARY KEY (id);
ALTER TABLE company_areas ADD CONSTRAINT "company_areas_tenant_id_type_key" UNIQUE (tenant_id, type);
ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_employee_id_position_id_key" UNIQUE (employee_id, position_id);
ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_pkey" PRIMARY KEY (id);
ALTER TABLE employee_projects ADD CONSTRAINT "employee_projects_pkey" PRIMARY KEY (employee_id, project_id);
ALTER TABLE employee_status_history ADD CONSTRAINT "employee_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE employees ADD CONSTRAINT "employees_pkey" PRIMARY KEY (id);
ALTER TABLE employees ADD CONSTRAINT "employees_user_id_key" UNIQUE (user_id);
ALTER TABLE feed_audio_transcriptions ADD CONSTRAINT "feed_audio_transcriptions_pkey" PRIMARY KEY (id);
ALTER TABLE feed_audio_transcriptions ADD CONSTRAINT "feed_audio_transcriptions_tenant_id_attachment_url_key" UNIQUE (tenant_id, attachment_url);
ALTER TABLE feed_comments ADD CONSTRAINT "feed_comments_pkey" PRIMARY KEY (id);
ALTER TABLE feed_posts ADD CONSTRAINT "feed_posts_pkey" PRIMARY KEY (id);
ALTER TABLE feed_reactions ADD CONSTRAINT "feed_reactions_feed_post_id_employee_id_reaction_key" UNIQUE (feed_post_id, employee_id, reaction);
ALTER TABLE feed_reactions ADD CONSTRAINT "feed_reactions_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_resource_type_resource_id_grant_type__key" UNIQUE (resource_type, resource_id, grant_type, target_id);
ALTER TABLE knowledge_base_documents ADD CONSTRAINT "knowledge_base_documents_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_base_folders ADD CONSTRAINT "knowledge_base_folders_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_document_id_shared_with_key" UNIQUE (document_id, shared_with);
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_pkey" PRIMARY KEY (id);
ALTER TABLE meeting_ai_jobs ADD CONSTRAINT "meeting_ai_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE meeting_approved_items ADD CONSTRAINT "meeting_approved_items_pkey" PRIMARY KEY (id);
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_meeting_employee_unique" UNIQUE (meeting_id, employee_id);
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_meeting_id_email_key" UNIQUE (meeting_id, email);
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY (id);
ALTER TABLE meeting_guest_requests ADD CONSTRAINT "meeting_guest_requests_guest_token_key" UNIQUE (guest_token);
ALTER TABLE meeting_guest_requests ADD CONSTRAINT "meeting_guest_requests_pkey" PRIMARY KEY (id);
ALTER TABLE meeting_recording_events ADD CONSTRAINT "meeting_recording_events_pkey" PRIMARY KEY (id);
ALTER TABLE meetings ADD CONSTRAINT "meetings_pkey" PRIMARY KEY (id);
ALTER TABLE notes ADD CONSTRAINT "notes_pkey" PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE positions ADD CONSTRAINT "positions_pkey" PRIMARY KEY (id);
ALTER TABLE process_areas ADD CONSTRAINT "process_areas_pkey" PRIMARY KEY (id);
ALTER TABLE process_areas ADD CONSTRAINT "process_areas_process_id_area_id_subarea_id_key" UNIQUE (process_id, area_id, subarea_id);
ALTER TABLE process_comments ADD CONSTRAINT "process_comments_pkey" PRIMARY KEY (id);
ALTER TABLE process_doc_folders ADD CONSTRAINT "process_doc_folders_pkey" PRIMARY KEY (id);
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_pkey" PRIMARY KEY (id);
ALTER TABLE process_folders ADD CONSTRAINT "process_folders_pkey" PRIMARY KEY (id);
ALTER TABLE process_positions ADD CONSTRAINT "process_positions_pkey" PRIMARY KEY (id);
ALTER TABLE process_positions ADD CONSTRAINT "process_positions_process_id_position_id_key" UNIQUE (process_id, position_id);
ALTER TABLE process_steps ADD CONSTRAINT "process_steps_pkey" PRIMARY KEY (id);
ALTER TABLE process_tag_assignments ADD CONSTRAINT "process_tag_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE process_tag_assignments ADD CONSTRAINT "process_tag_assignments_process_id_tag_id_key" UNIQUE (process_id, tag_id);
ALTER TABLE process_tags ADD CONSTRAINT "process_tags_pkey" PRIMARY KEY (id);
ALTER TABLE processes ADD CONSTRAINT "processes_pkey" PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_user_id_key" UNIQUE (user_id);
ALTER TABLE project_doc_folders ADD CONSTRAINT "project_doc_folders_pkey" PRIMARY KEY (id);
ALTER TABLE project_documents ADD CONSTRAINT "project_documents_pkey" PRIMARY KEY (id);
ALTER TABLE projects ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE push_subscriptions ADD CONSTRAINT "push_subscriptions_employee_id_endpoint_key" UNIQUE (employee_id, endpoint);
ALTER TABLE push_subscriptions ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE scheduled_messages ADD CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY (id);
ALTER TABLE subareas ADD CONSTRAINT "subareas_pkey" PRIMARY KEY (id);
ALTER TABLE task_assignees ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY (id);
ALTER TABLE task_assignees ADD CONSTRAINT "task_assignees_task_id_employee_id_key" UNIQUE (task_id, employee_id);
ALTER TABLE task_comments ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY (id);
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_pkey" PRIMARY KEY (id);
ALTER TABLE task_dependencies ADD CONSTRAINT "task_deps_unique" UNIQUE (task_id, depends_on_task_id, dependency_type);
ALTER TABLE task_history ADD CONSTRAINT "task_history_pkey" PRIMARY KEY (id);
ALTER TABLE task_recurrence ADD CONSTRAINT "task_recurrence_pkey" PRIMARY KEY (id);
ALTER TABLE task_recurrence_comments ADD CONSTRAINT "task_recurrence_comments_pkey" PRIMARY KEY (id);
ALTER TABLE task_recurrence_completions ADD CONSTRAINT "task_recurrence_completions_pkey" PRIMARY KEY (id);
ALTER TABLE task_recurrence_completions ADD CONSTRAINT "task_recurrence_completions_recurrence_id_completion_date_key" UNIQUE (recurrence_id, completion_date);
ALTER TABLE task_time_entries ADD CONSTRAINT "task_time_entries_pkey" PRIMARY KEY (id);
ALTER TABLE tasks ADD CONSTRAINT "tasks_pkey" PRIMARY KEY (id);
ALTER TABLE tenant_platforms ADD CONSTRAINT "tenant_platforms_pkey" PRIMARY KEY (id);
ALTER TABLE tenants ADD CONSTRAINT "tenants_pkey" PRIMARY KEY (id);
ALTER TABLE tenants ADD CONSTRAINT "tenants_slug_key" UNIQUE (slug);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_key" UNIQUE (user_id);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE webhook_logs ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY (id);
ALTER TABLE webhooks ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY (id);

ALTER TABLE announcement_comments ADD CONSTRAINT "announcement_comments_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE announcement_comments ADD CONSTRAINT "announcement_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE announcement_comments ADD CONSTRAINT "announcement_comments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE announcement_reactions ADD CONSTRAINT "announcement_reactions_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE announcement_reactions ADD CONSTRAINT "announcement_reactions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE announcement_reactions ADD CONSTRAINT "announcement_reactions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE announcement_visibility ADD CONSTRAINT "announcement_visibility_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE announcement_visibility ADD CONSTRAINT "announcement_visibility_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chat_channel_members ADD CONSTRAINT "chat_channel_members_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_channel_mutes ADD CONSTRAINT "chat_channel_mutes_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_channels ADD CONSTRAINT "chat_channels_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE SET NULL;
ALTER TABLE chat_channels ADD CONSTRAINT "chat_channels_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chat_huddles ADD CONSTRAINT "chat_huddles_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_huddles ADD CONSTRAINT "chat_huddles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chat_pinned_messages ADD CONSTRAINT "chat_pinned_messages_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_pinned_messages ADD CONSTRAINT "chat_pinned_messages_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_poll_votes ADD CONSTRAINT "chat_poll_votes_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES chat_polls(id) ON DELETE CASCADE;
ALTER TABLE chat_polls ADD CONSTRAINT "chat_polls_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_polls ADD CONSTRAINT "chat_polls_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_polls ADD CONSTRAINT "chat_polls_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chat_reactions ADD CONSTRAINT "chat_reactions_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_starred_messages ADD CONSTRAINT "chat_starred_messages_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE company_areas ADD CONSTRAINT "company_areas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY (position_id) REFERENCES positions(id);
ALTER TABLE employee_projects ADD CONSTRAINT "employee_projects_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE employee_projects ADD CONSTRAINT "employee_projects_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE employee_projects ADD CONSTRAINT "employee_projects_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE employee_status_history ADD CONSTRAINT "employee_status_history_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE employee_status_history ADD CONSTRAINT "employee_status_history_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE employees ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES employees(id);
ALTER TABLE employees ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE employees ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE feed_audio_transcriptions ADD CONSTRAINT "feed_audio_transcriptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feed_comments ADD CONSTRAINT "feed_comments_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE feed_comments ADD CONSTRAINT "feed_comments_feed_post_id_fkey" FOREIGN KEY (feed_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;
ALTER TABLE feed_comments ADD CONSTRAINT "feed_comments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feed_posts ADD CONSTRAINT "feed_posts_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE feed_posts ADD CONSTRAINT "feed_posts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feed_reactions ADD CONSTRAINT "feed_reactions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE feed_reactions ADD CONSTRAINT "feed_reactions_feed_post_id_fkey" FOREIGN KEY (feed_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;
ALTER TABLE feed_reactions ADD CONSTRAINT "feed_reactions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_documents ADD CONSTRAINT "knowledge_base_documents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE knowledge_base_documents ADD CONSTRAINT "knowledge_base_documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES knowledge_base_folders(id) ON DELETE SET NULL;
ALTER TABLE knowledge_base_documents ADD CONSTRAINT "knowledge_base_documents_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE knowledge_base_documents ADD CONSTRAINT "knowledge_base_documents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_folders ADD CONSTRAINT "knowledge_base_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE knowledge_base_folders ADD CONSTRAINT "knowledge_base_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES knowledge_base_folders(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_folders ADD CONSTRAINT "knowledge_base_folders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_document_id_fkey" FOREIGN KEY (document_id) REFERENCES knowledge_base_documents(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_shared_by_fkey" FOREIGN KEY (shared_by) REFERENCES auth.users(id);
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_shared_with_fkey" FOREIGN KEY (shared_with) REFERENCES auth.users(id);
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE meeting_ai_jobs ADD CONSTRAINT "meeting_ai_jobs_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE meeting_ai_jobs ADD CONSTRAINT "meeting_ai_jobs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE meeting_approved_items ADD CONSTRAINT "meeting_approved_items_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE meeting_approved_items ADD CONSTRAINT "meeting_approved_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE meeting_guest_requests ADD CONSTRAINT "meeting_guest_requests_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE meeting_recording_events ADD CONSTRAINT "meeting_recording_events_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE meetings ADD CONSTRAINT "meetings_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD CONSTRAINT "meetings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE notifications ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE notifications ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE positions ADD CONSTRAINT "positions_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id);
ALTER TABLE positions ADD CONSTRAINT "positions_reports_to_id_fkey" FOREIGN KEY (reports_to_id) REFERENCES positions(id) ON DELETE SET NULL;
ALTER TABLE positions ADD CONSTRAINT "positions_subarea_id_fkey" FOREIGN KEY (subarea_id) REFERENCES subareas(id) ON DELETE CASCADE;
ALTER TABLE positions ADD CONSTRAINT "positions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE process_areas ADD CONSTRAINT "process_areas_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE CASCADE;
ALTER TABLE process_areas ADD CONSTRAINT "process_areas_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_areas ADD CONSTRAINT "process_areas_subarea_id_fkey" FOREIGN KEY (subarea_id) REFERENCES subareas(id) ON DELETE SET NULL;
ALTER TABLE process_comments ADD CONSTRAINT "process_comments_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_comments ADD CONSTRAINT "process_comments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE process_doc_folders ADD CONSTRAINT "process_doc_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE process_doc_folders ADD CONSTRAINT "process_doc_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES process_doc_folders(id) ON DELETE CASCADE;
ALTER TABLE process_doc_folders ADD CONSTRAINT "process_doc_folders_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_doc_folders ADD CONSTRAINT "process_doc_folders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES process_doc_folders(id) ON DELETE SET NULL;
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE process_folders ADD CONSTRAINT "process_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE process_folders ADD CONSTRAINT "process_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES process_folders(id) ON DELETE CASCADE;
ALTER TABLE process_folders ADD CONSTRAINT "process_folders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE process_positions ADD CONSTRAINT "process_positions_position_id_fkey" FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
ALTER TABLE process_positions ADD CONSTRAINT "process_positions_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_steps ADD CONSTRAINT "process_steps_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_steps ADD CONSTRAINT "process_steps_responsible_position_id_fkey" FOREIGN KEY (responsible_position_id) REFERENCES positions(id);
ALTER TABLE process_steps ADD CONSTRAINT "process_steps_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE process_tag_assignments ADD CONSTRAINT "process_tag_assignments_process_id_fkey" FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE process_tag_assignments ADD CONSTRAINT "process_tag_assignments_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES process_tags(id) ON DELETE CASCADE;
ALTER TABLE process_tags ADD CONSTRAINT "process_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE process_tags ADD CONSTRAINT "process_tags_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE processes ADD CONSTRAINT "processes_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id);
ALTER TABLE processes ADD CONSTRAINT "processes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE processes ADD CONSTRAINT "processes_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES process_folders(id) ON DELETE SET NULL;
ALTER TABLE processes ADD CONSTRAINT "processes_position_id_fkey" FOREIGN KEY (position_id) REFERENCES positions(id);
ALTER TABLE processes ADD CONSTRAINT "processes_subarea_id_fkey" FOREIGN KEY (subarea_id) REFERENCES subareas(id);
ALTER TABLE processes ADD CONSTRAINT "processes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE project_doc_folders ADD CONSTRAINT "project_doc_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES project_doc_folders(id) ON DELETE CASCADE;
ALTER TABLE project_doc_folders ADD CONSTRAINT "project_doc_folders_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_doc_folders ADD CONSTRAINT "project_doc_folders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE project_documents ADD CONSTRAINT "project_documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES project_doc_folders(id) ON DELETE CASCADE;
ALTER TABLE project_documents ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_documents ADD CONSTRAINT "project_documents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE projects ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE projects ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE subareas ADD CONSTRAINT "subareas_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE CASCADE;
ALTER TABLE subareas ADD CONSTRAINT "subareas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE task_assignees ADD CONSTRAINT "task_assignees_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE task_assignees ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_assignees ADD CONSTRAINT "task_assignees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE task_comments ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE task_comments ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE task_history ADD CONSTRAINT "task_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE task_history ADD CONSTRAINT "task_history_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_history ADD CONSTRAINT "task_history_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE task_recurrence ADD CONSTRAINT "task_recurrence_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_recurrence ADD CONSTRAINT "task_recurrence_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE task_recurrence_comments ADD CONSTRAINT "task_recurrence_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES employees(id);
ALTER TABLE task_recurrence_comments ADD CONSTRAINT "task_recurrence_comments_recurrence_id_fkey" FOREIGN KEY (recurrence_id) REFERENCES task_recurrence(id) ON DELETE CASCADE;
ALTER TABLE task_recurrence_comments ADD CONSTRAINT "task_recurrence_comments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE task_recurrence_completions ADD CONSTRAINT "task_recurrence_completions_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES employees(id);
ALTER TABLE task_recurrence_completions ADD CONSTRAINT "task_recurrence_completions_recurrence_id_fkey" FOREIGN KEY (recurrence_id) REFERENCES task_recurrence(id) ON DELETE CASCADE;
ALTER TABLE task_recurrence_completions ADD CONSTRAINT "task_recurrence_completions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE task_time_entries ADD CONSTRAINT "task_time_entries_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE task_time_entries ADD CONSTRAINT "task_time_entries_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES employees(id);
ALTER TABLE tasks ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE tasks ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT "tasks_source_meeting_id_fkey" FOREIGN KEY (source_meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE tenant_platforms ADD CONSTRAINT "tenant_platforms_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE webhook_logs ADD CONSTRAINT "webhook_logs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE webhook_logs ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE;
ALTER TABLE webhooks ADD CONSTRAINT "webhooks_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE announcement_comments ADD CONSTRAINT "announcement_comments_content_check" CHECK ((length(TRIM(BOTH FROM content)) > 0));
ALTER TABLE announcement_visibility ADD CONSTRAINT "announcement_visibility_target_type_check" CHECK ((target_type = ANY (ARRAY['all'::text, 'position'::text, 'employee'::text, 'area'::text, 'subarea'::text])));
ALTER TABLE announcements ADD CONSTRAINT "announcements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE announcements ADD CONSTRAINT "announcements_title_check" CHECK ((char_length(title) > 0));
ALTER TABLE announcements ADD CONSTRAINT "announcements_type_check" CHECK ((type = ANY (ARRAY['announcement'::text, 'post'::text])));
ALTER TABLE chat_channel_members ADD CONSTRAINT "chat_channel_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
ALTER TABLE company_areas ADD CONSTRAINT "company_areas_position_check" CHECK (("position" = ANY (ARRAY['left'::text, 'right'::text, 'bottom'::text])));
ALTER TABLE company_areas ADD CONSTRAINT "company_areas_type_check" CHECK ((type = ANY (ARRAY['acquisition'::text, 'delivery'::text, 'operation'::text])));
ALTER TABLE feed_comments ADD CONSTRAINT "feed_comments_content_check" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)));
ALTER TABLE feed_posts ADD CONSTRAINT "feed_posts_content_check" CHECK ((char_length(content) <= 2000));
ALTER TABLE feed_posts ADD CONSTRAINT "feed_posts_visibility_type_check" CHECK ((visibility_type = ANY (ARRAY['all'::text, 'specific'::text])));
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_grant_type_check" CHECK ((grant_type = ANY (ARRAY['user'::text, 'role'::text, 'all'::text])));
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_permission_check" CHECK ((permission = ANY (ARRAY['read'::text, 'write'::text])));
ALTER TABLE knowledge_base_access ADD CONSTRAINT "knowledge_base_access_resource_type_check" CHECK ((resource_type = ANY (ARRAY['folder'::text, 'document'::text])));
ALTER TABLE knowledge_base_shares ADD CONSTRAINT "knowledge_base_shares_permission_check" CHECK ((permission = ANY (ARRAY['read'::text, 'write'::text])));
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_attendance_status_check" CHECK ((attendance_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'attended'::text])));
ALTER TABLE meeting_attendees ADD CONSTRAINT "meeting_attendees_role_check" CHECK ((role = ANY (ARRAY['organizer'::text, 'required'::text, 'optional'::text])));
ALTER TABLE meeting_guest_requests ADD CONSTRAINT "meeting_guest_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE meeting_recording_events ADD CONSTRAINT "meeting_recording_events_event_type_check" CHECK ((event_type = ANY (ARRAY['participant_joined'::text, 'participant_left'::text, 'egress_started'::text, 'egress_updated'::text, 'egress_ended'::text, 'room_started'::text, 'room_finished'::text, 'recording_failed'::text])));
ALTER TABLE meetings ADD CONSTRAINT "meetings_meeting_mode_check" CHECK ((meeting_mode = ANY (ARRAY['in_person'::text, 'external_link'::text, 'livekit'::text])));
ALTER TABLE meetings ADD CONSTRAINT "meetings_recording_status_check" CHECK ((recording_status = ANY (ARRAY['pending'::text, 'recording'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE positions ADD CONSTRAINT "positions_area_or_subarea_check" CHECK (((level = 0) OR (area_id IS NOT NULL) OR (subarea_id IS NOT NULL)));
ALTER TABLE positions ADD CONSTRAINT "positions_no_self_reference" CHECK (((reports_to_id IS NULL) OR (reports_to_id <> id)));
ALTER TABLE process_documents ADD CONSTRAINT "process_documents_type_check" CHECK ((type = ANY (ARRAY['document'::text, 'file'::text])));
ALTER TABLE projects ADD CONSTRAINT "projects_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE projects ADD CONSTRAINT "projects_progress_check" CHECK (((progress >= 0) AND (progress <= 100)));
ALTER TABLE scheduled_messages ADD CONSTRAINT "scheduled_messages_target_chk" CHECK (((channel_id IS NOT NULL) OR (recipient_user_id IS NOT NULL)));
ALTER TABLE task_dependencies ADD CONSTRAINT "task_dependencies_dependency_type_check" CHECK ((dependency_type = ANY (ARRAY['blocks'::text, 'related_to'::text])));
ALTER TABLE task_dependencies ADD CONSTRAINT "task_deps_no_self" CHECK ((task_id <> depends_on_task_id));
ALTER TABLE task_recurrence ADD CONSTRAINT "task_recurrence_frequency_check" CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'custom'::text, 'weekdays'::text, 'specific_days'::text])));

CREATE INDEX idx_ann_comments_ann ON public.announcement_comments USING btree (announcement_id);
CREATE INDEX idx_ann_comments_author ON public.announcement_comments USING btree (author_id);
CREATE INDEX idx_ann_comments_tenant ON public.announcement_comments USING btree (tenant_id);
CREATE INDEX idx_ann_reactions_ann ON public.announcement_reactions USING btree (announcement_id);
CREATE INDEX idx_ann_reactions_tenant ON public.announcement_reactions USING btree (tenant_id);
CREATE INDEX announcement_visibility_ann_idx ON public.announcement_visibility USING btree (announcement_id);
CREATE INDEX announcement_visibility_tid_idx ON public.announcement_visibility USING btree (tenant_id);
CREATE INDEX announcements_author_id_idx ON public.announcements USING btree (author_id);
CREATE INDEX announcements_published_at_idx ON public.announcements USING btree (published_at DESC);
CREATE INDEX announcements_status_idx ON public.announcements USING btree (status);
CREATE INDEX announcements_tenant_id_idx ON public.announcements USING btree (tenant_id);
CREATE INDEX idx_chat_channel_members_user ON public.chat_channel_members USING btree (user_id);
CREATE INDEX idx_chat_channel_mutes_expires ON public.chat_channel_mutes USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX idx_chat_channels_area_id ON public.chat_channels USING btree (area_id);
CREATE INDEX idx_chat_channels_tenant ON public.chat_channels USING btree (tenant_id);
CREATE INDEX idx_chat_huddles_active ON public.chat_huddles USING btree (channel_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_chat_messages_channel ON public.chat_messages USING btree (channel_id, created_at DESC);
CREATE INDEX idx_chat_messages_content_trgm ON public.chat_messages USING gin (content gin_trgm_ops);
CREATE INDEX idx_chat_messages_tenant ON public.chat_messages USING btree (tenant_id);
CREATE INDEX idx_chat_pinned_channel ON public.chat_pinned_messages USING btree (channel_id);
CREATE INDEX idx_chat_polls_message ON public.chat_polls USING btree (message_id);
CREATE INDEX idx_chat_reactions_msg ON public.chat_reactions USING btree (message_id);
CREATE INDEX chat_user_favorites_user_idx ON public.chat_user_favorites USING btree (user_id);
CREATE INDEX idx_company_areas_tenant ON public.company_areas USING btree (tenant_id);
CREATE INDEX idx_employee_positions_employee ON public.employee_positions USING btree (employee_id);
CREATE INDEX idx_employee_status_history_employee ON public.employee_status_history USING btree (employee_id);
CREATE INDEX idx_employee_status_history_tenant ON public.employee_status_history USING btree (tenant_id);
CREATE INDEX idx_employees_manager ON public.employees USING btree (manager_id);
CREATE INDEX idx_employees_status ON public.employees USING btree (status);
CREATE INDEX idx_employees_tenant ON public.employees USING btree (tenant_id);
CREATE INDEX idx_feed_audio_transcriptions_tenant ON public.feed_audio_transcriptions USING btree (tenant_id);
CREATE INDEX idx_feed_audio_transcriptions_url ON public.feed_audio_transcriptions USING btree (attachment_url);
CREATE INDEX idx_kb_access_resource ON public.knowledge_base_access USING btree (resource_type, resource_id);
CREATE INDEX idx_kb_access_tenant ON public.knowledge_base_access USING btree (tenant_id);
CREATE INDEX idx_kb_docs_folder ON public.knowledge_base_documents USING btree (folder_id);
CREATE INDEX idx_kb_docs_owner ON public.knowledge_base_documents USING btree (owner_id);
CREATE INDEX idx_kb_docs_tenant ON public.knowledge_base_documents USING btree (tenant_id);
CREATE INDEX idx_kb_folders_parent ON public.knowledge_base_folders USING btree (parent_id);
CREATE INDEX idx_kb_folders_tenant ON public.knowledge_base_folders USING btree (tenant_id);
CREATE INDEX idx_kb_shares_doc ON public.knowledge_base_shares USING btree (document_id);
CREATE INDEX idx_kb_shares_with ON public.knowledge_base_shares USING btree (shared_with);
CREATE INDEX meeting_ai_jobs_meeting_idx ON public.meeting_ai_jobs USING btree (meeting_id, created_at DESC);
CREATE INDEX meeting_ai_jobs_tenant_status_idx ON public.meeting_ai_jobs USING btree (tenant_id, status);
CREATE INDEX idx_meeting_attendees_employee_id ON public.meeting_attendees USING btree (employee_id);
CREATE INDEX idx_meeting_attendees_meeting_id ON public.meeting_attendees USING btree (meeting_id);
CREATE INDEX idx_meeting_attendees_tenant_id ON public.meeting_attendees USING btree (tenant_id);
CREATE INDEX idx_meeting_guest_requests_meeting ON public.meeting_guest_requests USING btree (meeting_id, status);
CREATE INDEX idx_meeting_guest_requests_room ON public.meeting_guest_requests USING btree (livekit_room_name, status);
CREATE INDEX idx_meeting_guest_requests_token ON public.meeting_guest_requests USING btree (guest_token);
CREATE INDEX rec_events_huddle_idx ON public.meeting_recording_events USING btree (huddle_id, created_at DESC);
CREATE INDEX rec_events_meeting_idx ON public.meeting_recording_events USING btree (meeting_id, created_at DESC);
CREATE INDEX rec_events_tenant_idx ON public.meeting_recording_events USING btree (tenant_id);
CREATE INDEX idx_meetings_area_id ON public.meetings USING btree (area_id);
CREATE INDEX idx_meetings_project_id ON public.meetings USING btree (project_id);
CREATE INDEX idx_meetings_scheduled_date ON public.meetings USING btree (scheduled_date);
CREATE UNIQUE INDEX meetings_livekit_room_name_key ON public.meetings USING btree (livekit_room_name) WHERE (livekit_room_name IS NOT NULL);
CREATE INDEX meetings_next_occurrence_idx ON public.meetings USING btree (next_occurrence_at) WHERE (is_recurring = true);
CREATE INDEX meetings_recording_status_idx ON public.meetings USING btree (recording_status) WHERE (recording_status IS NOT NULL);
CREATE INDEX notes_pinned_idx ON public.notes USING btree (user_id, pinned) WHERE (archived = false);
CREATE INDEX notes_tags_gin_idx ON public.notes USING gin (tags);
CREATE INDEX notes_tenant_idx ON public.notes USING btree (tenant_id);
CREATE INDEX notes_user_idx ON public.notes USING btree (user_id);
CREATE INDEX idx_notifications_tenant ON public.notifications USING btree (tenant_id);
CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE UNIQUE INDEX notifications_no_dup ON public.notifications USING btree (user_id, type, source_id) WHERE (source_id IS NOT NULL);
CREATE INDEX idx_positions_area_id ON public.positions USING btree (area_id);
CREATE INDEX idx_positions_reports_to ON public.positions USING btree (reports_to_id);
CREATE INDEX idx_positions_subarea ON public.positions USING btree (subarea_id);
CREATE INDEX idx_process_comments_process ON public.process_comments USING btree (process_id, created_at DESC);
CREATE INDEX idx_process_comments_tenant ON public.process_comments USING btree (tenant_id);
CREATE INDEX idx_process_doc_folders_process ON public.process_doc_folders USING btree (process_id);
CREATE INDEX idx_process_doc_folders_tenant ON public.process_doc_folders USING btree (tenant_id);
CREATE INDEX idx_process_documents_folder ON public.process_documents USING btree (folder_id);
CREATE INDEX idx_process_documents_process ON public.process_documents USING btree (process_id);
CREATE INDEX idx_process_documents_tenant ON public.process_documents USING btree (tenant_id);
CREATE INDEX idx_process_documents_token ON public.process_documents USING btree (public_token) WHERE (public_token IS NOT NULL);
CREATE INDEX idx_process_positions_position ON public.process_positions USING btree (position_id);
CREATE INDEX idx_process_positions_process ON public.process_positions USING btree (process_id);
CREATE INDEX idx_process_steps_process ON public.process_steps USING btree (process_id);
CREATE INDEX idx_processes_area ON public.processes USING btree (area_id);
CREATE INDEX idx_processes_subarea ON public.processes USING btree (subarea_id);
CREATE INDEX idx_profiles_tenant ON public.profiles USING btree (tenant_id);
CREATE INDEX profiles_system_bot_idx ON public.profiles USING btree (tenant_id) WHERE (is_system_bot = true);
CREATE INDEX idx_project_doc_folders_parent ON public.project_doc_folders USING btree (parent_id);
CREATE INDEX idx_project_doc_folders_project ON public.project_doc_folders USING btree (project_id);
CREATE INDEX idx_project_doc_folders_tenant ON public.project_doc_folders USING btree (tenant_id);
CREATE INDEX idx_project_doc_folders_token ON public.project_doc_folders USING btree (public_token) WHERE (public_token IS NOT NULL);
CREATE INDEX idx_project_documents_folder ON public.project_documents USING btree (folder_id);
CREATE INDEX idx_project_documents_project ON public.project_documents USING btree (project_id);
CREATE INDEX idx_project_documents_tenant ON public.project_documents USING btree (tenant_id);
CREATE INDEX idx_project_documents_token ON public.project_documents USING btree (public_token) WHERE (public_token IS NOT NULL);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);
CREATE INDEX idx_projects_tenant ON public.projects USING btree (tenant_id);
CREATE INDEX push_subs_employee_idx ON public.push_subscriptions USING btree (employee_id);
CREATE INDEX push_subs_tenant_idx ON public.push_subscriptions USING btree (tenant_id);
CREATE INDEX scheduled_messages_creator_idx ON public.scheduled_messages USING btree (created_by, status);
CREATE INDEX scheduled_messages_pending_idx ON public.scheduled_messages USING btree (send_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_subareas_area ON public.subareas USING btree (area_id);
CREATE INDEX idx_task_assignees_employee ON public.task_assignees USING btree (employee_id);
CREATE INDEX idx_task_assignees_task ON public.task_assignees USING btree (task_id);
CREATE INDEX idx_task_assignees_tenant ON public.task_assignees USING btree (tenant_id);
CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_comments_tenant_id ON public.task_comments USING btree (tenant_id);
CREATE INDEX task_comments_task_id_idx ON public.task_comments USING btree (task_id);
CREATE INDEX task_comments_tenant_id_idx ON public.task_comments USING btree (tenant_id);
CREATE INDEX idx_task_deps_depends_on ON public.task_dependencies USING btree (depends_on_task_id);
CREATE INDEX idx_task_deps_task ON public.task_dependencies USING btree (task_id);
CREATE INDEX idx_task_deps_tenant ON public.task_dependencies USING btree (tenant_id);
CREATE INDEX idx_task_history_task ON public.task_history USING btree (task_id, changed_at DESC);
CREATE INDEX idx_task_history_tenant ON public.task_history USING btree (tenant_id, changed_at DESC);
CREATE INDEX idx_task_recurrence_next ON public.task_recurrence USING btree (next_occurrence) WHERE (is_active = true);
CREATE INDEX idx_task_recurrence_task ON public.task_recurrence USING btree (task_id);
CREATE INDEX idx_task_recurrence_tenant ON public.task_recurrence USING btree (tenant_id);
CREATE INDEX idx_rec_comments_recurrence ON public.task_recurrence_comments USING btree (recurrence_id);
CREATE INDEX idx_rec_comments_tenant ON public.task_recurrence_comments USING btree (tenant_id);
CREATE INDEX idx_rec_completions_date ON public.task_recurrence_completions USING btree (completion_date);
CREATE INDEX idx_rec_completions_recurrence ON public.task_recurrence_completions USING btree (recurrence_id);
CREATE INDEX idx_tte_employee ON public.task_time_entries USING btree (employee_id, started_at DESC);
CREATE INDEX idx_tte_open ON public.task_time_entries USING btree (tenant_id, employee_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_tte_task ON public.task_time_entries USING btree (task_id, started_at DESC);
CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assignee_id);
CREATE INDEX idx_tasks_parent_task ON public.tasks USING btree (parent_task_id) WHERE (parent_task_id IS NOT NULL);
CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_sort ON public.tasks USING btree (status, sort_order);
CREATE INDEX idx_tasks_source_meeting ON public.tasks USING btree (source_meeting_id) WHERE (source_meeting_id IS NOT NULL);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_tenant ON public.tasks USING btree (tenant_id);
CREATE UNIQUE INDEX tenants_custom_domain_key ON public.tenants USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs USING btree (created_at DESC);
CREATE INDEX idx_webhook_logs_webhook_id ON public.webhook_logs USING btree (webhook_id);
CREATE INDEX idx_webhooks_tenant_id ON public.webhooks USING btree (tenant_id);

CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.area_employee_ids(p_area_id uuid)
 RETURNS TABLE(emp_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT e.id
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id);
$function$
;

CREATE OR REPLACE FUNCTION public.chat_my_conversation_ids()
 RETURNS TABLE(conversation_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cp.conversation_id
  FROM public.chat_participants cp
  WHERE cp.employee_id = public.chat_my_employee_id();
$function$
;

CREATE OR REPLACE FUNCTION public.chat_my_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT tenant_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_presence_my_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_user_created_conversation(p_conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conv_id
      AND created_by = public.chat_my_employee_id()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.check_employee_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_position_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE     visited_ids UUID[];     current_id UUID; BEGIN     IF NEW.reports_to_id IS NULL THEN         RETURN NEW;     END IF;     IF NEW.reports_to_id = NEW.id THEN         RAISE EXCEPTION 'Um cargo nao pode reportar para si mesmo';     END IF;     visited_ids := ARRAY[NEW.id];     current_id := NEW.reports_to_id;     WHILE current_id IS NOT NULL LOOP         IF current_id = ANY(visited_ids) THEN             RAISE EXCEPTION 'Ciclo detectado na hierarquia de cargos';         END IF;         visited_ids := array_append(visited_ids, current_id);         SELECT reports_to_id INTO current_id         FROM public.positions         WHERE id = current_id;     END LOOP;     RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.compute_next_meeting_occurrence(p_pattern jsonb, p_after timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_freq text;
  v_byday text[];
  v_time text;
  v_tz text;
  v_end_date date;
  v_candidate timestamptz;
  v_local_date date;
  v_dow text;
  v_dows text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF p_pattern IS NULL THEN RETURN NULL; END IF;
  v_freq := COALESCE(p_pattern->>'freq', 'weekly');
  v_byday := CASE
    WHEN p_pattern->'byday' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_pattern->'byday'))
    ELSE ARRAY['MO','TU','WE','TH','FR']
  END;
  v_time := COALESCE(p_pattern->>'time', '09:00');
  v_tz := COALESCE(p_pattern->>'tz', 'America/Sao_Paulo');
  v_end_date := NULLIF(p_pattern->>'end_date','')::date;
  FOR i IN 0..60 LOOP
    v_local_date := (timezone(v_tz, p_after))::date + i;
    IF v_end_date IS NOT NULL AND v_local_date > v_end_date THEN RETURN NULL; END IF;
    v_dow := v_dows[EXTRACT(DOW FROM v_local_date)::int + 1];
    IF v_freq = 'daily' OR v_dow = ANY(v_byday) THEN
      v_candidate := timezone(v_tz, (v_local_date::text || ' ' || v_time)::timestamp);
      IF v_candidate > p_after THEN RETURN v_candidate; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_director_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only insert if a director position doesn't already exist for this area
  INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
  SELECT 'Diretor', NEW.id, NULL, NEW.tenant_id, 1, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM positions 
    WHERE area_id = NEW.id 
    AND title = 'Diretor' 
    AND subarea_id IS NULL
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_bot_id uuid;
BEGIN
  v_bot_id := public.ensure_omnx_bot(NEW.id);
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
          false, true, v_bot_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.diagnostico_feed_posts_raw()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid := public.get_user_tenant_id();
  v_posts     jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  fp.id,
      'visibility_type',     fp.visibility_type,
      'visibility_targets',  fp.visibility_targets,
      'tenant_id',           fp.tenant_id,
      'created_at',          fp.created_at
    )
    ORDER BY fp.created_at DESC
  )
  INTO v_posts
  FROM public.feed_posts fp
  WHERE fp.tenant_id = v_tenant_id
  LIMIT 5;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'posts',     COALESCE(v_posts, '[]'::jsonb)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.diagnostico_feed_visibilidade()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid  := auth.uid();
  v_tenant_id   uuid  := public.get_user_tenant_id();
  v_employee    jsonb;
  v_positions   jsonb;
  v_ultimo_post jsonb;
  v_can_read    boolean;
BEGIN
  -- 1. Employee do usuário atual
  SELECT to_jsonb(e) INTO v_employee
  FROM public.employees e
  WHERE e.user_id = v_uid
    AND e.tenant_id = v_tenant_id
  LIMIT 1;

  -- 2. Posições via employee_positions com subarea/area resolvidos
  SELECT jsonb_agg(row_to_json(x)) INTO v_positions
  FROM (
    SELECT
      ep.employee_id,
      ep.position_id,
      ep.is_primary,
      pos.title          AS position_title,
      pos.subarea_id,
      pos.area_id        AS position_area_id,
      sa.name            AS subarea_name,
      sa.area_id         AS subarea_parent_area_id,
      COALESCE(pos.area_id, sa.area_id) AS resolved_area_id
    FROM public.employee_positions ep
    JOIN public.employees e   ON e.id  = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
    WHERE e.user_id = v_uid
      AND e.tenant_id = v_tenant_id
  ) x;

  -- 3. Último post com visibility_type = 'specific' e target subarea
  SELECT to_jsonb(p) INTO v_ultimo_post
  FROM public.feed_posts p
  WHERE p.tenant_id = v_tenant_id
    AND p.visibility_type = 'specific'
    AND p.visibility_targets::text LIKE '%subarea%'
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- 4. Resultado da função de visibilidade para esse post
  IF v_ultimo_post IS NOT NULL THEN
    SELECT public.user_can_read_feed_post((v_ultimo_post->>'id')::uuid)
    INTO v_can_read;
  END IF;

  RETURN jsonb_build_object(
    'uid',            v_uid,
    'tenant_id',      v_tenant_id,
    'employee',       v_employee,
    'positions',      COALESCE(v_positions, '[]'::jsonb),
    'ultimo_post_subarea', v_ultimo_post,
    'user_can_read',  v_can_read
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.employees_by_area(p_area_id uuid)
 RETURNS TABLE(employee_id uuid, user_id uuid, full_name text, work_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    e.id AS employee_id,
    e.user_id,
    p.full_name,
    e.work_email
  FROM public.employees e
  JOIN public.profiles p ON p.user_id = e.user_id
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions pos ON pos.id = ep.position_id
  JOIN public.subareas sa ON sa.id = pos.subarea_id
  WHERE sa.area_id = p_area_id
    AND e.status = 'active'
    AND e.user_id IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_subtasks_single_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'Tarefa não pode ser sua própria mãe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = NEW.parent_task_id
      AND parent_task_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Subtarefa não pode ter sub-subtarefa (apenas 1 nível permitido)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE parent_task_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta tarefa já tem subtarefas — não pode virar subtarefa';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_area_channel(p_area_id uuid, p_tenant_id uuid, p_area_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE area_id = p_area_id
  LIMIT 1;

  IF v_channel_id IS NOT NULL THEN RETURN v_channel_id; END IF;

  INSERT INTO public.chat_channels (tenant_id, name, area_id, is_dm)
  VALUES (p_tenant_id, p_area_name, p_area_id, false)
  RETURNING id INTO v_channel_id;

  -- Adiciona todos os colaboradores ativos da area como membros
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_channel_id, e.user_id, 'member'
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND e.user_id IS NOT NULL
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_dm_conversation(p_tenant_id uuid, p_user_a uuid, p_user_b uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_a uuid;
  v_emp_b uuid;
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_emp_a FROM public.employees
    WHERE user_id = p_user_a AND tenant_id = p_tenant_id LIMIT 1;
  SELECT id INTO v_emp_b FROM public.employees
    WHERE user_id = p_user_b AND tenant_id = p_tenant_id LIMIT 1;

  IF v_emp_a IS NULL OR v_emp_b IS NULL THEN RETURN NULL; END IF;

  SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.tenant_id = p_tenant_id
      AND c.type = 'direct'
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = v_emp_a)
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = v_emp_b)
    LIMIT 1;

  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO public.chat_conversations (tenant_id, type, created_by)
  VALUES (p_tenant_id, 'direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id)
  VALUES (v_conv_id, v_emp_a), (v_conv_id, v_emp_b);

  RETURN v_conv_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_omnx_bot(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_bot_user_id uuid;
BEGIN
  -- Procura por email único de OMNX bot deste tenant
  SELECT u.id INTO v_bot_user_id
    FROM auth.users u
   WHERE u.email = 'omnx-bot+' || p_tenant_id::text || '@omnx.system'
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'omnx-bot+' || p_tenant_id::text || '@omnx.system',
    now(),
    jsonb_build_object('full_name', 'OMNX Bot', 'is_bot', true, 'is_omnx_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'OMNX Bot', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'omnx-bot+' || p_tenant_id::text || '@omnx.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_system_bot(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_bot_user_id uuid;
BEGIN
  SELECT user_id INTO v_bot_user_id
    FROM public.profiles
   WHERE tenant_id = p_tenant_id AND is_system_bot = true
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN RETURN v_bot_user_id; END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bot+' || p_tenant_id::text || '@empire.system',
    jsonb_build_object('full_name', 'Empire Bot', 'is_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now(), now()
  );

  -- UPSERT: trigger handle_new_user pode já ter criado o profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'Empire Bot', true)
  ON CONFLICT (user_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        full_name = EXCLUDED.full_name,
        is_system_bot = true;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'bot+' || p_tenant_id::text || '@empire.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_conversations_overview()
 RETURNS TABLE(id uuid, tenant_id uuid, type text, name text, description text, avatar_url text, area_id uuid, project_id uuid, topic text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, participant_ids uuid[], my_role text, my_last_read_at timestamp with time zone, pinned_at timestamp with time zone, muted_until timestamp with time zone, archived_at timestamp with time zone, last_message_id uuid, last_message_content text, last_message_type text, last_message_at timestamp with time zone, last_message_employee_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT public.chat_my_employee_id() AS emp_id),
  my_convs AS (
    SELECT cp.conversation_id, cp.role AS my_role, cp.last_read_at AS my_last_read_at,
           cp.pinned_at, cp.muted_until, cp.archived_at
    FROM public.chat_participants cp, me WHERE cp.employee_id = me.emp_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.id AS last_message_id, m.content AS last_message_content,
      m.type AS last_message_type, m.created_at AS last_message_at,
      m.employee_id AS last_message_employee_id
    FROM public.chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    WHERE m.deleted_at IS NULL AND m.thread_root_id IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.conversation_id, COUNT(*)::bigint AS unread_count
    FROM public.chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    JOIN me ON true
    WHERE m.deleted_at IS NULL AND m.employee_id <> me.emp_id
      AND (mc.my_last_read_at IS NULL OR m.created_at > mc.my_last_read_at)
    GROUP BY m.conversation_id
  ),
  parts AS (
    SELECT cp.conversation_id, ARRAY_AGG(cp.employee_id ORDER BY cp.joined_at) AS participant_ids
    FROM public.chat_participants cp
    JOIN my_convs mc ON mc.conversation_id = cp.conversation_id
    GROUP BY cp.conversation_id
  )
  SELECT
    c.id, c.tenant_id, c.type, c.name, c.description, c.avatar_url,
    c.area_id, c.project_id, c.topic, c.created_by, c.created_at, c.updated_at,
    COALESCE(p.participant_ids, ARRAY[]::uuid[]),
    mc.my_role, mc.my_last_read_at, mc.pinned_at, mc.muted_until, mc.archived_at,
    lm.last_message_id, lm.last_message_content, lm.last_message_type,
    lm.last_message_at, lm.last_message_employee_id,
    COALESCE(u.unread_count, 0)
  FROM public.chat_conversations c
  JOIN my_convs mc ON mc.conversation_id = c.id
  LEFT JOIN last_msgs lm ON lm.conversation_id = c.id
  LEFT JOIN unread u ON u.conversation_id = c.id
  LEFT JOIN parts p ON p.conversation_id = c.id
  ORDER BY
    CASE WHEN mc.pinned_at IS NOT NULL THEN 0 ELSE 1 END,
    mc.pinned_at DESC NULLS LAST,
    COALESCE(lm.last_message_at, c.updated_at) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_meeting_created_by(p_meeting_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT created_by FROM public.meetings WHERE id = p_meeting_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_project_created_by(p_project_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT created_by FROM public.projects WHERE id = p_project_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tenant_by_domain(p_domain text)
 RETURNS TABLE(id uuid, name text, slug text, logo_url text, logo_dark_url text, favicon_url text, primary_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.logo_url,
    t.logo_dark_url,
    t.favicon_url,
    t.primary_color
  FROM public.tenants t
  WHERE LOWER(t.custom_domain) = LOWER(p_domain)
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id UUID;
  _invited_tenant_id UUID;
  _role app_role;
  _slug TEXT;
BEGIN
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;

  IF _invited_tenant_id IS NOT NULL THEN
    -- Usuário convidado: entra no tenant existente como member
    _tenant_id := _invited_tenant_id;
    _role := 'member';
  ELSE
    -- Usuário se cadastrou sozinho → cria tenant novo, vira admin
    -- Slug derivado de NEW.id (UUID) garante unicidade
    _slug := NEW.id::text;

    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1),
        'Meu Workspace'
      ),
      _slug
    )
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO _tenant_id;

    -- Se o tenant não foi criado (slug colidiu), busca o existente
    IF _tenant_id IS NULL THEN
      SELECT id INTO _tenant_id FROM public.tenants WHERE slug = _slug;
    END IF;

    _role := 'admin';
  END IF;

  -- Profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  -- Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Employee (faltava — sem isso o user some do organograma/Kanban)
  INSERT INTO public.employees (user_id, tenant_id, status)
  VALUES (NEW.id, _tenant_id, 'active')
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin')
$function$
;

CREATE OR REPLACE FUNCTION public.is_chat_channel_member(_channel_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_meeting_host(p_meeting_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND m.created_by = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.kb_user_has_access(p_resource_type text, p_resource_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_user_role text;
BEGIN
  -- Get user tenant
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE user_id = p_user_id;
  IF v_tenant_id IS NULL THEN RETURN false; END IF;

  -- Check if admin/manager (they see everything)
  SELECT role INTO v_user_role FROM user_roles WHERE user_id = p_user_id AND tenant_id = v_tenant_id LIMIT 1;
  IF v_user_role IN ('admin', 'manager') THEN RETURN true; END IF;

  -- Check 'all' grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id
      AND grant_type = 'all' AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check user-specific grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id
      AND grant_type = 'user' AND target_id = p_user_id::text AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check role-based grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access kba
    JOIN user_roles ur ON ur.role = kba.target_id AND ur.tenant_id = kba.tenant_id AND ur.user_id = p_user_id
    WHERE kba.resource_type = p_resource_type AND kba.resource_id = p_resource_id
      AND kba.grant_type = 'role' AND kba.tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check parent folder access (inherit)
  IF p_resource_type = 'document' THEN
    DECLARE v_folder_id uuid;
    BEGIN
      SELECT folder_id INTO v_folder_id FROM knowledge_base_documents WHERE id = p_resource_id;
      IF v_folder_id IS NOT NULL THEN
        RETURN kb_user_has_access('folder', v_folder_id, p_user_id);
      END IF;
    END;
  END IF;

  -- No access grants found = check if resource has NO access rules (open to all by default)
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'created', NULL, NEW.title, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'status', OLD.status::text, NEW.status::text, auth.uid());
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'priority', OLD.priority, NEW.priority, auth.uid());
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'assignee', OLD.assignee_id::text, NEW.assignee_id::text, auth.uid());
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'due_date', OLD.due_date::text, NEW.due_date::text, auth.uid());
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'title', OLD.title, NEW.title, auth.uid());
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.meetings_recurrence_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.is_recurring THEN
    NEW.next_occurrence_at := public.compute_next_meeting_occurrence(NEW.recurrence_pattern, now());
  ELSE
    IF NEW.scheduled_date IS NOT NULL THEN
      NEW.next_occurrence_at := (NEW.scheduled_date::text || ' ' ||
        COALESCE(NEW.scheduled_time::text, '09:00')
      )::timestamp AT TIME ZONE 'America/Sao_Paulo';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.next_occurrence_at IS DISTINCT FROM NEW.next_occurrence_at
    OR OLD.recurrence_pattern IS DISTINCT FROM NEW.recurrence_pattern
    OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time
  ) THEN
    NEW.last_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.migrate_manager_to_position_hierarchy()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE     emp RECORD;     manager_position_id UUID;     employee_primary_position_id UUID; BEGIN     FOR emp IN         SELECT e.id as employee_id, e.manager_id, e.tenant_id         FROM public.employees e         WHERE e.manager_id IS NOT NULL     LOOP         SELECT ep.position_id INTO manager_position_id         FROM public.employee_positions ep         WHERE ep.employee_id = emp.manager_id AND ep.is_primary = TRUE LIMIT 1;         SELECT ep.position_id INTO employee_primary_position_id         FROM public.employee_positions ep         WHERE ep.employee_id = emp.employee_id AND ep.is_primary = TRUE LIMIT 1;         IF manager_position_id IS NOT NULL AND employee_primary_position_id IS NOT NULL THEN             UPDATE public.positions SET reports_to_id = manager_position_id WHERE id = employee_primary_position_id AND reports_to_id IS NULL;         END IF;     END LOOP; END; $function$
;

CREATE OR REPLACE FUNCTION public.notes_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id  uuid;
  v_task_title text;
  v_project_id uuid;
  v_tenant_id  uuid;
BEGIN
  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.employee_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT t.title, t.project_id, t.tenant_id
  INTO v_task_title, v_project_id, v_tenant_id
  FROM tasks t WHERE t.id = NEW.task_id;

  IF v_task_title IS NULL THEN RETURN NEW; END IF;
  IF v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    COALESCE(v_tenant_id, NEW.tenant_id), v_user_id, 'task_assigned',
    'Nova tarefa atribuída', v_task_title,
    CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END,
    NEW.task_id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_task_assignee_direct()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.assignee_id = NEW.assignee_id THEN RETURN NEW; END IF;

  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.assignee_id;

  IF v_user_id IS NULL OR v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    NEW.tenant_id, v_user_id, 'task_assigned',
    'Nova tarefa atribuída', NEW.title,
    CASE WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id::text ELSE '/tarefas' END,
    NEW.id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_task_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_task_title text;
  v_project_id uuid;
  v_assignee_employee_id uuid;
  v_assignee_user_id uuid;
  v_author_name text;
  v_created_by uuid;
BEGIN
  -- Get task info
  SELECT t.title, t.project_id, t.assignee_id, t.created_by
  INTO v_task_title, v_project_id, v_assignee_employee_id, v_created_by
  FROM tasks t WHERE t.id = NEW.task_id;

  -- Get author name
  SELECT e.full_name INTO v_author_name FROM employees e WHERE e.id = NEW.author_id;

  -- Notify task assignee (if not the commenter)
  IF v_assignee_employee_id IS NOT NULL THEN
    SELECT e.user_id INTO v_assignee_user_id FROM employees e WHERE e.id = v_assignee_employee_id;
    IF v_assignee_user_id IS NOT NULL AND v_assignee_user_id != auth.uid() THEN
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (
        NEW.tenant_id, v_assignee_user_id, 'task_comment',
        'Novo comentário na tarefa',
        COALESCE(v_author_name, 'Alguém') || ': ' || LEFT(NEW.content, 100),
        CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END
      );
    END IF;
  END IF;

  -- Notify task creator (if different from assignee and commenter)
  IF v_created_by IS NOT NULL AND v_created_by != auth.uid() AND v_created_by != COALESCE(v_assignee_user_id, '00000000-0000-0000-0000-000000000000') THEN
    INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
    VALUES (
      NEW.tenant_id, v_created_by, 'task_comment',
      'Novo comentário na tarefa',
      COALESCE(v_author_name, 'Alguém') || ': ' || LEFT(NEW.content, 100),
      CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_task_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_creator_id uuid;
BEGIN
  -- Only fire when status changes to 'done'
  IF NEW.status != 'done' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'done' THEN
    RETURN NEW;
  END IF;

  v_creator_id := NEW.created_by;
  
  IF v_creator_id IS NULL OR v_creator_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
  VALUES (
    NEW.tenant_id,
    v_creator_id,
    'task_completed',
    'Tarefa concluída',
    NEW.title,
    CASE 
      WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id::text
      ELSE '/tarefas'
    END
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_auto_link_structure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.position_id IS NOT NULL THEN
    SELECT s.id, s.area_id 
    INTO NEW.subarea_id, NEW.area_id
    FROM public.positions p
    JOIN public.subareas s ON s.id = p.subarea_id
    WHERE p.id = NEW.position_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_task_recurrences()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  new_task_id UUID;
  tasks_created INT := 0;
  recurrences_deactivated INT := 0;
  next_date DATE;
BEGIN
  FOR rec IN
    SELECT
      tr.*,
      t.title,
      t.description,
      t.project_id,
      t.assignee_id,
      t.created_by,
      t.priority,
      t.checklist_items,
      t.labels
    FROM task_recurrence tr
    JOIN tasks t ON t.id = tr.task_id
    WHERE tr.is_active = true
      AND tr.next_occurrence <= CURRENT_DATE
  LOOP
    -- Criar nova tarefa copiando da original
    INSERT INTO tasks (
      tenant_id, project_id, assignee_id, created_by,
      title, description, status, priority,
      due_date, checklist_items, labels
    ) VALUES (
      rec.tenant_id,
      rec.project_id,
      rec.assignee_id,
      rec.created_by,
      rec.title,
      rec.description,
      'todo',
      rec.priority,
      rec.next_occurrence::timestamptz,
      CASE
        WHEN rec.checklist_items IS NOT NULL AND jsonb_array_length(rec.checklist_items) > 0
        THEN (
          SELECT jsonb_agg(
            jsonb_set(item, '{checked}', 'false'::jsonb)
          )
          FROM jsonb_array_elements(rec.checklist_items) AS item
        )
        ELSE '[]'::jsonb
      END,
      rec.labels
    )
    RETURNING id INTO new_task_id;

    tasks_created := tasks_created + 1;

    -- Calcular próxima ocorrência de acordo com a frequência
    next_date := CASE rec.frequency
      WHEN 'daily' THEN
        rec.next_occurrence + INTERVAL '1 day'

      WHEN 'weekly' THEN
        rec.next_occurrence + INTERVAL '7 days'

      WHEN 'biweekly' THEN
        rec.next_occurrence + INTERVAL '14 days'

      WHEN 'monthly' THEN
        rec.next_occurrence + INTERVAL '1 month'

      WHEN 'custom' THEN
        rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL

      -- Apenas dias úteis (seg-sex): avança para o próximo dia que não seja sábado ou domingo
      WHEN 'weekdays' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
        ORDER BY d
        LIMIT 1
      )

      -- Dias específicos: avança para o próximo dia da semana que esteja em days_of_week[]
      -- EXTRACT(DOW): 0=Dom, 1=Seg, ..., 6=Sáb
      WHEN 'specific_days' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d)::INT = ANY(COALESCE(rec.days_of_week, ARRAY[1,2,3,4,5]))
        ORDER BY d
        LIMIT 1
      )

      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Desativar se passou da data limite, senão avançar
    IF rec.end_date IS NOT NULL AND next_date > rec.end_date THEN
      UPDATE task_recurrence SET is_active = false WHERE id = rec.id;
      recurrences_deactivated := recurrences_deactivated + 1;
    ELSE
      UPDATE task_recurrence SET next_occurrence = next_date WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_created', tasks_created,
    'recurrences_deactivated', recurrences_deactivated,
    'processed_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_announcements_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.set_meeting_attendee_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM meetings
    WHERE id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_process_comments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_area_channel_create()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.ensure_area_channel(NEW.id, NEW.tenant_id, NEW.name);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_area_channel_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE public.chat_channels
    SET name = NEW.name
    WHERE area_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_employee_area_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_area_id   UUID;
  v_channel_id UUID;
  v_user_id   UUID;
BEGIN
  SELECT COALESCE(p.area_id, sa.area_id) INTO v_area_id
  FROM public.positions p
  LEFT JOIN public.subareas sa ON sa.id = p.subarea_id
  WHERE p.id = NEW.position_id;

  IF v_area_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE id = NEW.employee_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE area_id = v_area_id
  LIMIT 1;

  IF v_channel_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_chat_presence_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_meeting_attendee_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_task_time_duration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::integer);
  ELSE
    NEW.duration_seconds := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_platforms_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_can_read_feed_post(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.feed_posts fp
    WHERE fp.id = p_post_id
      AND fp.tenant_id = public.get_user_tenant_id()
      AND (
        -- Visível para todos
        fp.visibility_type = 'all'

        -- Admin sempre vê tudo
        OR public.is_admin()

        -- Autor sempre vê o próprio post
        OR EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = fp.employee_id
            AND e.user_id = auth.uid()
        )

        -- Visibilidade específica
        OR (
          fp.visibility_type = 'specific'
          AND (
            -- Por employee direto
            EXISTS (
              SELECT 1 FROM public.employees e
              WHERE e.user_id = auth.uid()
                AND e.tenant_id = public.get_user_tenant_id()
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                  WHERE t->>'type' = 'employee'
                    AND t->>'id' = e.id::text
                )
            )

            -- Por cargo / área / subárea
            OR EXISTS (
              -- Resolve todas as posições do usuário com area_id e subarea_id
              WITH current_positions AS (
                SELECT
                  pos.id        AS position_id,
                  pos.subarea_id,
                  COALESCE(pos.area_id, sa.area_id) AS area_id
                FROM public.employee_positions ep
                JOIN public.employees e   ON e.id  = ep.employee_id
                JOIN public.positions pos ON pos.id = ep.position_id
                LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
                WHERE e.user_id = auth.uid()
                  AND e.tenant_id = public.get_user_tenant_id()
                  AND pos.tenant_id = public.get_user_tenant_id()
              )
              SELECT 1
              FROM current_positions cp
              WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                WHERE
                  -- Cargo exato
                  (t->>'type' = 'position' AND t->>'id' = cp.position_id::text)
                  -- Área: area_id do cargo (direto ou via subárea)
                  OR (
                    t->>'type' = 'area'
                    AND cp.area_id IS NOT NULL
                    AND t->>'id' = cp.area_id::text
                  )
                  -- Subárea: subarea_id direto do cargo
                  OR (
                    t->>'type' = 'subarea'
                    AND cp.subarea_id IS NOT NULL
                    AND t->>'id' = cp.subarea_id::text
                  )
              )
            )
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_can_read_process(p_process_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_process_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_process_matches_position_or_area(p.id)
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: criou, é membro direto, tem tarefa atribuída, ou coincide área
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            -- 1. Criou o projeto
            p.created_by = auth.uid()
            -- 2. Adicionado como membro direto
            OR EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            -- 3a. Tem tarefa atribuída via assignee_id (legado)
            OR public.user_has_project_assigned_task(p.id)
            -- 3b. Tem tarefa atribuída via task_assignees (múltiplos assignees)
            OR EXISTS (
              SELECT 1
              FROM public.tasks t
              JOIN public.task_assignees ta ON ta.task_id = t.id
              JOIN public.employees e ON e.id = ta.employee_id
              WHERE t.project_id = p.id
                AND t.tenant_id = public.get_user_tenant_id()
                AND e.user_id = auth.uid()
                AND ta.tenant_id = public.get_user_tenant_id()
            )
            -- 4. Coincide posição/subárea com membros do projeto
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_process_access(p_process_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.user_process_matches_position_or_area(p_process_id);
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_project_assigned_task(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.employees e ON e.id = t.assignee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    JOIN public.employees e ON e.id = ta.employee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND ta.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_owns_or_member_of_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employee_projects ep
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.project_id = p_project_id AND e.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employees proj_owner ON proj_owner.id = p.owner_id
    JOIN public.employee_positions ep_proj ON ep_proj.employee_id = proj_owner.id
    JOIN public.positions pos_proj ON pos_proj.id = ep_proj.position_id
    JOIN public.subareas sa_proj ON sa_proj.id = pos_proj.subarea_id
    JOIN public.employees member ON member.user_id = auth.uid()
    JOIN public.employee_positions ep_mem ON ep_mem.employee_id = member.id
    JOIN public.positions pos_mem ON pos_mem.id = ep_mem.position_id
    JOIN public.subareas sa_mem ON sa_mem.id = pos_mem.subarea_id
    WHERE p.id = p_project_id AND sa_proj.area_id = sa_mem.area_id
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employees proj_owner ON proj_owner.id = p.owner_id
    JOIN public.employees member ON member.manager_id = proj_owner.id
    WHERE p.id = p_project_id AND member.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH current_positions AS (
    SELECT DISTINCT
      current_pos.position_id,
      current_pos.subarea_id,
      current_pos.area_id
    FROM (
      SELECT
        ep.position_id,
        pos.subarea_id,
        COALESCE(pos.area_id, current_sa.area_id) AS area_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()

      UNION

      SELECT
        ehv.primary_position_id AS position_id,
        ehv.subarea_id,
        ehv.area_id
      FROM public.employees_hierarchy_view ehv
      WHERE ehv.user_id = auth.uid()
        AND ehv.tenant_id = public.get_user_tenant_id()
        AND ehv.primary_position_id IS NOT NULL

      UNION

      SELECT
        ov.primary_position_id AS position_id,
        ov.subarea_id,
        ov.area_id
      FROM public.organograma_view ov
      WHERE ov.user_id = auth.uid()
        AND ov.tenant_id = public.get_user_tenant_id()
        AND ov.primary_position_id IS NOT NULL
    ) AS current_pos
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.user_project_matches_area(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin vê tudo
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN true;
  END IF;
  -- Member: é membro direto do projeto
  IF EXISTS (
    SELECT 1 FROM public.employee_projects ep
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.project_id = p_project_id AND e.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  -- Member: owner do projeto é da mesma área
  IF EXISTS (
    WITH member_areas AS (
      SELECT DISTINCT sa.area_id
      FROM public.employees e
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      JOIN public.subareas sa ON sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
    ),
    owner_areas AS (
      SELECT DISTINCT sa.area_id
      FROM public.employees e
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      JOIN public.subareas sa ON sa.id = pos.subarea_id
      WHERE e.id = (SELECT owner_id FROM public.projects WHERE id = p_project_id)
    )
    SELECT 1 FROM member_areas m
    INTERSECT
    SELECT 1 FROM owner_areas o
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_project_matches_position_or_area(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH current_positions AS (
      SELECT
        ep.position_id,
        pos.subarea_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()
    ),
    project_positions AS (
      SELECT
        ep.position_id,
        pos.subarea_id
      FROM public.employee_projects epr
      JOIN public.employees e ON e.id = epr.employee_id
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      WHERE epr.project_id = p_project_id
        AND epr.tenant_id = public.get_user_tenant_id()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()
    )
    SELECT EXISTS (
      SELECT 1
      FROM current_positions cur
      JOIN project_positions proj
        ON proj.position_id = cur.position_id
        OR (
          proj.subarea_id IS NOT NULL
          AND cur.subarea_id IS NOT NULL
          AND proj.subarea_id = cur.subarea_id
        )
    );
  $function$
;

CREATE OR REPLACE VIEW public."employees_hierarchy_view" AS
 SELECT e.id AS employee_id,
    e.user_id,
    p.full_name,
    p.avatar_url,
    e.status,
    e.admission_date,
    e.is_ceo,
    ep.position_id AS primary_position_id,
    pos.title AS position_title,
    pos.level AS position_level,
    COALESCE(sa.id, pos.subarea_id) AS subarea_id,
    sa.name AS subarea_name,
    COALESCE(ca.id, sa.area_id, pos.area_id) AS area_id,
    COALESCE(ca.name, ca_direct.name) AS area_name,
    COALESCE(ca.type, ca_direct.type) AS area_type,
    COALESCE(ca.color, ca_direct.color) AS area_color,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status <> 'done'::task_status))) AS pending_tasks,
    ( SELECT count(*) AS count
           FROM (employee_projects epj
             JOIN projects pr ON ((pr.id = epj.project_id)))
          WHERE ((epj.employee_id = e.id) AND (pr.status = 'active'::project_status))) AS active_projects,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status = 'done'::task_status) AND (t.updated_at > (now() - '7 days'::interval)))) AS tasks_completed_this_week,
    e.tenant_id
   FROM ((((((employees e
     JOIN profiles p ON ((p.user_id = e.user_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.position_id
           FROM employee_positions
          WHERE ((employee_positions.employee_id = e.id) AND (employee_positions.is_primary = true))
         LIMIT 1) ep ON (true))
     LEFT JOIN positions pos ON ((pos.id = ep.position_id)))
     LEFT JOIN subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN company_areas ca ON ((ca.id = sa.area_id)))
     LEFT JOIN company_areas ca_direct ON ((ca_direct.id = pos.area_id)))
  WHERE ((e.status = 'active'::employee_status) AND (e.is_test IS NOT TRUE));

CREATE OR REPLACE VIEW public."organograma_view" AS
 SELECT e.id AS employee_id,
    e.tenant_id,
    e.user_id,
    p.full_name,
    p.avatar_url,
    pos.title AS position_title,
    pos.level,
    pos.reports_to_id AS position_reports_to_id,
    parent_pos.title AS manager_position_title,
    sa.id AS subarea_id,
    sa.name AS subarea_name,
    sa.color AS subarea_color,
    ca.id AS area_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    e.manager_id,
    e.status,
    e.is_ceo,
    ep.position_id AS primary_position_id,
    manager_emp.id AS manager_employee_id,
    manager_profile.full_name AS manager_name,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status <> 'done'::task_status))) AS pending_tasks,
    ( SELECT count(*) AS count
           FROM (employee_projects ep2
             JOIN projects pr ON ((pr.id = ep2.project_id)))
          WHERE ((ep2.employee_id = e.id) AND (pr.status = 'active'::project_status))) AS active_projects,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status = 'done'::task_status) AND (t.updated_at >= date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone)))) AS tasks_completed_this_week
   FROM (((((((((employees e
     LEFT JOIN profiles p ON ((p.user_id = e.user_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.position_id
           FROM employee_positions
          WHERE ((employee_positions.employee_id = e.id) AND (employee_positions.is_primary = true))
         LIMIT 1) ep ON (true))
     LEFT JOIN positions pos ON ((pos.id = ep.position_id)))
     LEFT JOIN subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN company_areas ca ON ((ca.id = COALESCE(pos.area_id, sa.area_id))))
     LEFT JOIN positions parent_pos ON ((parent_pos.id = pos.reports_to_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.employee_id
           FROM employee_positions
          WHERE ((employee_positions.position_id = pos.reports_to_id) AND (employee_positions.is_primary = true))
         LIMIT 1) manager_ep ON ((pos.reports_to_id IS NOT NULL)))
     LEFT JOIN employees manager_emp ON ((manager_emp.id = manager_ep.employee_id)))
     LEFT JOIN profiles manager_profile ON ((manager_profile.user_id = manager_emp.user_id)))
  WHERE (e.status = 'active'::employee_status);

CREATE OR REPLACE VIEW public."position_hierarchy_view" AS
 SELECT pos.id AS position_id,
    pos.tenant_id,
    pos.title AS position_title,
    pos.description,
    pos.level,
    pos.reports_to_id,
    parent_pos.title AS reports_to_title,
    pos.subarea_id,
    sa.name AS subarea_name,
    sa.color AS subarea_color,
    pos.area_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    pos.sort_order,
    emp.id AS employee_id,
    p.full_name AS employee_name,
    p.avatar_url AS employee_avatar_url,
    e.is_ceo AS is_employee_ceo,
    e.status AS employee_status,
    ( SELECT count(*) AS count
           FROM employee_positions ep2
          WHERE (ep2.position_id = pos.id)) AS employee_count
   FROM (((((((positions pos
     LEFT JOIN subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN company_areas ca ON ((ca.id = COALESCE(pos.area_id, sa.area_id))))
     LEFT JOIN positions parent_pos ON ((parent_pos.id = pos.reports_to_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.employee_id
           FROM employee_positions
          WHERE ((employee_positions.position_id = pos.id) AND (employee_positions.is_primary = true))
         LIMIT 1) primary_ep ON (true))
     LEFT JOIN employees emp ON ((emp.id = primary_ep.employee_id)))
     LEFT JOIN profiles p ON ((p.user_id = emp.user_id)))
     LEFT JOIN employees e ON ((e.id = emp.id)));

CREATE OR REPLACE VIEW public."processes_hierarchy_view" AS
 SELECT proc.id AS process_id,
    proc.tenant_id,
    proc.name,
    proc.status,
    proc.process_markdown,
    proc.flow_data,
    proc.original_prompt,
    proc.created_at,
    proc.created_by,
    proc.area_id,
    proc.subarea_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    sa.name AS subarea_name,
    proc.position_id AS primary_position_id,
    pos.title AS primary_position_title,
    ( SELECT count(*) AS count
           FROM process_positions pp
          WHERE (pp.process_id = proc.id)) AS linked_positions_count
   FROM (((processes proc
     LEFT JOIN company_areas ca ON ((ca.id = proc.area_id)))
     LEFT JOIN subareas sa ON ((sa.id = proc.subarea_id)))
     LEFT JOIN positions pos ON ((pos.id = proc.position_id)));

CREATE OR REPLACE VIEW public."projects_hierarchy_view" AS
 SELECT id AS project_id,
    tenant_id,
    name,
    description,
    status,
    priority,
    progress,
    start_date,
    end_date,
    created_at,
    created_by,
    ( SELECT count(*) AS count
           FROM employee_projects ep
          WHERE (ep.project_id = pr.id)) AS members_count,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE (t.project_id = pr.id)) AS tasks_count,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE ((t.project_id = pr.id) AND (t.status = 'done'::task_status))) AS completed_tasks_count
   FROM projects pr;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Trigger em auth.* requer privilégio: %', SQLERRM;
END $$;
CREATE TRIGGER trigger_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_announcements_updated_at();
CREATE TRIGGER area_channel_create AFTER INSERT ON company_areas FOR EACH ROW EXECUTE FUNCTION trg_area_channel_create();
CREATE TRIGGER area_channel_rename AFTER UPDATE ON company_areas FOR EACH ROW EXECUTE FUNCTION trg_area_channel_rename();
CREATE TRIGGER trigger_create_director AFTER INSERT ON company_areas FOR EACH ROW EXECUTE FUNCTION create_director_position();
CREATE TRIGGER update_company_areas_updated_at BEFORE UPDATE ON company_areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sync_employee_area_channel AFTER INSERT ON employee_positions FOR EACH ROW EXECUTE FUNCTION trg_sync_employee_area_channel();
CREATE TRIGGER prevent_self_management BEFORE INSERT OR UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION check_employee_hierarchy();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER meeting_ai_jobs_updated_at BEFORE UPDATE ON meeting_ai_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_set_meeting_attendee_tenant BEFORE INSERT ON meeting_attendees FOR EACH ROW EXECUTE FUNCTION set_meeting_attendee_tenant();
CREATE TRIGGER trg_update_meeting_attendee_timestamp BEFORE UPDATE ON meeting_attendees FOR EACH ROW EXECUTE FUNCTION update_meeting_attendee_timestamp();
CREATE TRIGGER trg_meeting_guest_requests_updated_at BEFORE UPDATE ON meeting_guest_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER meetings_recurrence_recompute_trg BEFORE INSERT OR UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION meetings_recurrence_recompute();
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER notes_touch BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION notes_touch_updated_at();
CREATE TRIGGER trigger_check_position_cycle BEFORE INSERT OR UPDATE OF reports_to_id ON positions FOR EACH ROW EXECUTE FUNCTION check_position_cycle();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_process_comments_updated_at BEFORE UPDATE ON process_comments FOR EACH ROW EXECUTE FUNCTION set_process_comments_updated_at();
CREATE TRIGGER update_process_positions_updated_at BEFORE UPDATE ON process_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_process_steps_updated_at BEFORE UPDATE ON process_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER process_auto_link BEFORE INSERT OR UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION process_auto_link_structure();
CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER add_user_to_omnx_bot_trg AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION add_user_to_omnx_bot();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_project_doc_folders_updated_at BEFORE UPDATE ON project_doc_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON project_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subareas_updated_at BEFORE UPDATE ON subareas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_notify_task_assigned AFTER INSERT ON task_assignees FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();
CREATE TRIGGER trg_tte_duration BEFORE INSERT OR UPDATE ON task_time_entries FOR EACH ROW EXECUTE FUNCTION update_task_time_duration();
CREATE TRIGGER trg_enforce_subtasks_single_level BEFORE INSERT OR UPDATE OF parent_task_id ON tasks FOR EACH ROW EXECUTE FUNCTION enforce_subtasks_single_level();
CREATE TRIGGER trg_log_task_change AFTER INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION log_task_change();
CREATE TRIGGER trg_notify_task_assignee_direct AFTER INSERT OR UPDATE OF assignee_id ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_assignee_direct();
CREATE TRIGGER trg_notify_task_completed AFTER UPDATE OF status ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_completed();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tenant_platforms_updated_at BEFORE UPDATE ON tenant_platforms FOR EACH ROW EXECUTE FUNCTION update_tenant_platforms_updated_at();
CREATE TRIGGER create_omnx_bot_on_tenant AFTER INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION create_omnx_bot_channel();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public."announcement_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."announcement_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."announcement_visibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_channel_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_channel_mutes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_huddles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_pinned_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_poll_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_polls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_presence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_starred_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_user_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."company_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feed_audio_transcriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feed_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feed_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feed_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."knowledge_base_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."knowledge_base_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."knowledge_base_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."knowledge_base_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_ai_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_approved_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_attendees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_guest_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_recording_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_doc_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_tag_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."processes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_doc_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subareas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_assignees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_recurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_recurrence_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_recurrence_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_platforms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."webhook_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."webhooks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_comments_delete" ON public."announcement_comments" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND ((author_id IN ( SELECT employees.id
   FROM employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = get_user_tenant_id())))) OR is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "ann_comments_insert" ON public."announcement_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "ann_comments_select" ON public."announcement_comments" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "ann_comments_update" ON public."announcement_comments" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND ((author_id IN ( SELECT employees.id
   FROM employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = get_user_tenant_id())))) OR is_admin())));
CREATE POLICY "ann_reactions_delete" ON public."announcement_reactions" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND (employee_id IN ( SELECT employees.id
   FROM employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = get_user_tenant_id()))))));
CREATE POLICY "ann_reactions_insert" ON public."announcement_reactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND (employee_id IN ( SELECT employees.id
   FROM employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = get_user_tenant_id()))))));
CREATE POLICY "ann_reactions_select" ON public."announcement_reactions" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "announcement_visibility_delete" ON public."announcement_visibility" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "announcement_visibility_insert" ON public."announcement_visibility" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "announcement_visibility_select" ON public."announcement_visibility" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "announcements_delete" ON public."announcements" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR (author_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))))));
CREATE POLICY "announcements_insert" ON public."announcements" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "announcements_select" ON public."announcements" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "announcements_update" ON public."announcements" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR (author_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))))));
CREATE POLICY "members can be added by self, creator or admin" ON public."chat_channel_members" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_channels c
  WHERE ((c.id = chat_channel_members.channel_id) AND (c.created_by = auth.uid())))) OR is_admin()));
CREATE POLICY "members can be removed by self, creator or admin" ON public."chat_channel_members" AS PERMISSIVE FOR DELETE TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_channels c
  WHERE ((c.id = chat_channel_members.channel_id) AND (c.created_by = auth.uid())))) OR is_admin()));
CREATE POLICY "user reads channel membership" ON public."chat_channel_members" AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR is_chat_channel_member(channel_id, auth.uid())));
CREATE POLICY "user updates own membership" ON public."chat_channel_members" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "user creates own mute" ON public."chat_channel_mutes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "user reads own mutes" ON public."chat_channel_mutes" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "user removes own mute" ON public."chat_channel_mutes" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "creator can delete own channel" ON public."chat_channels" AS PERMISSIVE FOR DELETE TO public USING ((created_by = auth.uid()));
CREATE POLICY "creator can update own channel" ON public."chat_channels" AS PERMISSIVE FOR UPDATE TO public USING ((created_by = auth.uid()));
CREATE POLICY "tenant members create channels" ON public."chat_channels" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (created_by = auth.uid())));
CREATE POLICY "tenant members read channels" ON public."chat_channels" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "members end huddle" ON public."chat_huddles" AS PERMISSIVE FOR UPDATE TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "members read huddles" ON public."chat_huddles" AS PERMISSIVE FOR SELECT TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "members start huddle" ON public."chat_huddles" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((started_by = auth.uid()) AND is_chat_channel_member(channel_id, auth.uid())));
CREATE POLICY "author deletes own message" ON public."chat_messages" AS PERMISSIVE FOR DELETE TO public USING ((author_id = auth.uid()));
CREATE POLICY "author edits own message" ON public."chat_messages" AS PERMISSIVE FOR UPDATE TO public USING ((author_id = auth.uid()));
CREATE POLICY "members read channel messages" ON public."chat_messages" AS PERMISSIVE FOR SELECT TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "members send messages" ON public."chat_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((author_id = auth.uid()) AND is_chat_channel_member(channel_id, auth.uid()) AND (tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid())))));
CREATE POLICY "members create pins" ON public."chat_pinned_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((pinned_by = auth.uid()) AND is_chat_channel_member(channel_id, auth.uid())));
CREATE POLICY "members read pins" ON public."chat_pinned_messages" AS PERMISSIVE FOR SELECT TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "members remove pins" ON public."chat_pinned_messages" AS PERMISSIVE FOR DELETE TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "members read poll votes" ON public."chat_poll_votes" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM chat_polls p
  WHERE ((p.id = chat_poll_votes.poll_id) AND is_chat_channel_member(p.channel_id, auth.uid())))));
CREATE POLICY "user removes own vote" ON public."chat_poll_votes" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "user votes own" ON public."chat_poll_votes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "members create polls" ON public."chat_polls" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = auth.uid()) AND is_chat_channel_member(channel_id, auth.uid())));
CREATE POLICY "members read polls" ON public."chat_polls" AS PERMISSIVE FOR SELECT TO public USING (is_chat_channel_member(channel_id, auth.uid()));
CREATE POLICY "tenant reads presence" ON public."chat_presence" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "user updates own presence" ON public."chat_presence" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "user upserts own presence" ON public."chat_presence" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "members add own reaction" ON public."chat_reactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "members read reactions" ON public."chat_reactions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_reactions.message_id) AND is_chat_channel_member(m.channel_id, auth.uid())))));
CREATE POLICY "members remove own reaction" ON public."chat_reactions" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "user creates own star" ON public."chat_starred_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "user reads own stars" ON public."chat_starred_messages" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "user removes own star" ON public."chat_starred_messages" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "chat_user_favorites_delete" ON public."chat_user_favorites" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "chat_user_favorites_insert" ON public."chat_user_favorites" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "chat_user_favorites_select" ON public."chat_user_favorites" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "areas_delete_admin" ON public."company_areas" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "areas_insert_admin" ON public."company_areas" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "areas_select" ON public."company_areas" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "areas_update_admin" ON public."company_areas" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "Admins can manage positions in their tenant" ON public."employee_positions" AS PERMISSIVE FOR ALL TO public USING ((employee_id IN ( SELECT e.id
   FROM ((employees e
     JOIN profiles p ON ((p.user_id = auth.uid())))
     JOIN user_roles ur ON ((ur.user_id = auth.uid())))
  WHERE ((e.tenant_id = p.tenant_id) AND (ur.role = 'admin'::app_role)))));
CREATE POLICY "Users can view positions in their tenant" ON public."employee_positions" AS PERMISSIVE FOR SELECT TO public USING ((employee_id IN ( SELECT e.id
   FROM (employees e
     JOIN profiles p ON ((p.user_id = auth.uid())))
  WHERE (e.tenant_id = p.tenant_id))));
CREATE POLICY "emp_projects_delete_admin" ON public."employee_projects" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "emp_projects_insert_admin" ON public."employee_projects" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "emp_projects_select" ON public."employee_projects" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "status_history_delete_admin" ON public."employee_status_history" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "status_history_insert_admin" ON public."employee_status_history" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "status_history_select" ON public."employee_status_history" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "employees_delete_admin" ON public."employees" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "employees_insert_admin" ON public."employees" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "employees_select" ON public."employees" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "employees_update_admin" ON public."employees" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "admins can delete transcriptions" ON public."feed_audio_transcriptions" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "admins can update transcriptions" ON public."feed_audio_transcriptions" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin())) WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "tenant members can insert transcriptions" ON public."feed_audio_transcriptions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "tenant members can read transcriptions" ON public."feed_audio_transcriptions" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "feed_comments_delete" ON public."feed_comments" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role) OR (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_comments.employee_id) AND (e.user_id = auth.uid())))))));
CREATE POLICY "feed_comments_insert" ON public."feed_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_comments.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "feed_comments_select" ON public."feed_comments" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "feed_posts_delete" ON public."feed_posts" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role) OR (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid())))))));
CREATE POLICY "feed_posts_insert" ON public."feed_posts" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = get_user_tenant_id()))))));
CREATE POLICY "feed_posts_select" ON public."feed_posts" AS PERMISSIVE FOR SELECT TO authenticated USING (user_can_read_feed_post(id));
CREATE POLICY "feed_posts_update" ON public."feed_posts" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "feed_reactions_delete" ON public."feed_reactions" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_reactions.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "feed_reactions_insert" ON public."feed_reactions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = feed_reactions.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "feed_reactions_select" ON public."feed_reactions" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "kb_access_select" ON public."knowledge_base_access" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "kb_access_write" ON public."knowledge_base_access" AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "kb_docs_delete" ON public."knowledge_base_documents" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "kb_docs_insert" ON public."knowledge_base_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "kb_docs_select" ON public."knowledge_base_documents" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND ((is_personal = false) OR (owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM knowledge_base_shares s
  WHERE ((s.document_id = knowledge_base_documents.id) AND (s.shared_with = auth.uid())))))));
CREATE POLICY "kb_docs_update" ON public."knowledge_base_documents" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "kb_folders_delete" ON public."knowledge_base_folders" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "kb_folders_insert" ON public."knowledge_base_folders" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "kb_folders_select" ON public."knowledge_base_folders" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND kb_user_has_access('folder'::text, id, auth.uid())));
CREATE POLICY "kb_folders_update" ON public."knowledge_base_folders" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "kb_shares_delete" ON public."knowledge_base_shares" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (shared_by = auth.uid())));
CREATE POLICY "kb_shares_insert" ON public."knowledge_base_shares" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (shared_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM knowledge_base_documents
  WHERE ((knowledge_base_documents.id = knowledge_base_shares.document_id) AND (knowledge_base_documents.is_personal = true) AND (knowledge_base_documents.owner_id = auth.uid()))))));
CREATE POLICY "kb_shares_select" ON public."knowledge_base_shares" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((shared_by = auth.uid()) OR (shared_with = auth.uid()))));
CREATE POLICY "meeting_ai_jobs_delete_admin" ON public."meeting_ai_jobs" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "meeting_ai_jobs_insert_admin" ON public."meeting_ai_jobs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "meeting_ai_jobs_select" ON public."meeting_ai_jobs" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "meeting_ai_jobs_update_admin" ON public."meeting_ai_jobs" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "mai_delete" ON public."meeting_approved_items" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "mai_insert" ON public."meeting_approved_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "mai_select" ON public."meeting_approved_items" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "Users can delete attendees from their tenant meetings" ON public."meeting_attendees" AS PERMISSIVE FOR DELETE TO public USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can insert attendees in their tenant meetings" ON public."meeting_attendees" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can update attendees in their tenant meetings" ON public."meeting_attendees" AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "meeting_attendees_select" ON public."meeting_attendees" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = meeting_attendees.employee_id) AND (e.user_id = auth.uid())))) OR (get_meeting_created_by(meeting_id) = auth.uid()))));
CREATE POLICY "Host can update guest requests" ON public."meeting_guest_requests" AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_meeting_host(meeting_id) OR is_admin())) WITH CHECK ((is_meeting_host(meeting_id) OR is_admin()));
CREATE POLICY "Host can view guest requests" ON public."meeting_guest_requests" AS PERMISSIVE FOR SELECT TO authenticated USING ((is_meeting_host(meeting_id) OR is_admin()));
CREATE POLICY "No one can delete guest requests" ON public."meeting_guest_requests" AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "Public can insert guest request for active rooms" ON public."meeting_guest_requests" AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (((status = 'pending'::text) AND (decided_at IS NULL) AND (decided_by IS NULL) AND (EXISTS ( SELECT 1
   FROM meetings m
  WHERE ((m.id = meeting_guest_requests.meeting_id) AND (m.tenant_id = meeting_guest_requests.tenant_id) AND ((m.status = ANY (ARRAY['scheduled'::text, 'recording'::text])) OR (m.recording_status = 'recording'::text)))))));
CREATE POLICY "rec_events_select_tenant" ON public."meeting_recording_events" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "Users can update meetings in their tenant" ON public."meetings" AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "meetings_delete" ON public."meetings" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "meetings_insert" ON public."meetings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (created_by = auth.uid())));
CREATE POLICY "meetings_recurring_host_or_admin" ON public."meetings" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT is_recurring) OR is_admin() OR (created_by = auth.uid())))) WITH CHECK (((tenant_id = get_user_tenant_id()) AND ((NOT is_recurring) OR is_admin() OR (created_by = auth.uid()))));
CREATE POLICY "meetings_select" ON public."meetings" AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (meeting_attendees ma
     JOIN employees e ON ((e.id = ma.employee_id)))
  WHERE ((ma.meeting_id = meetings.id) AND (e.user_id = auth.uid())))) OR ((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (employee_projects ep
     JOIN employees e ON ((e.id = ep.employee_id)))
  WHERE ((ep.project_id = meetings.project_id) AND (e.user_id = auth.uid()))))) OR ((area_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (((employees e
     JOIN employee_positions ep ON ((ep.employee_id = e.id)))
     JOIN positions pos ON ((pos.id = ep.position_id)))
     LEFT JOIN subareas sa ON ((sa.id = pos.subarea_id)))
  WHERE ((e.user_id = auth.uid()) AND (COALESCE(sa.area_id, pos.area_id) = meetings.area_id))))))));
CREATE POLICY "meetings_update" ON public."meetings" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role) OR (created_by = auth.uid()))));
CREATE POLICY "notes_delete" ON public."notes" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "notes_insert" ON public."notes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
CREATE POLICY "notes_select" ON public."notes" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "notes_update" ON public."notes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "notifications_delete" ON public."notifications" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "notifications_insert" ON public."notifications" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "notifications_select" ON public."notifications" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "notifications_update" ON public."notifications" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "positions_delete_admin" ON public."positions" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "positions_insert_admin" ON public."positions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "positions_select" ON public."positions" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "positions_update_admin" ON public."positions" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "admin_manage_process_areas" ON public."process_areas" AS PERMISSIVE FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_areas.process_id) AND (p.tenant_id = get_user_tenant_id())))) AND is_admin()));
CREATE POLICY "tenant_select_process_areas" ON public."process_areas" AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR user_can_read_process(process_id)));
CREATE POLICY "author can delete own process_comments" ON public."process_comments" AS PERMISSIVE FOR DELETE TO public USING ((author_id = auth.uid()));
CREATE POLICY "author can update own process_comments" ON public."process_comments" AS PERMISSIVE FOR UPDATE TO public USING ((author_id = auth.uid()));
CREATE POLICY "tenant members can insert own process_comments" ON public."process_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((author_id = auth.uid()) AND (tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid())))));
CREATE POLICY "tenant members can read process_comments" ON public."process_comments" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "pf_proc_public" ON public."process_doc_folders" AS PERMISSIVE FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));
CREATE POLICY "pf_proc_select" ON public."process_doc_folders" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "pf_proc_write" ON public."process_doc_folders" AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)))) WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pd_proc_public" ON public."process_documents" AS PERMISSIVE FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));
CREATE POLICY "pd_proc_select" ON public."process_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "pd_proc_write" ON public."process_documents" AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)))) WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "process_folders_tenant_isolation" ON public."process_folders" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "admin_manage_process_positions" ON public."process_positions" AS PERMISSIVE FOR ALL TO authenticated USING (((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id())))) AND is_admin()));
CREATE POLICY "process_positions_delete_admin_manager" ON public."process_positions" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "process_positions_insert_admin_manager" ON public."process_positions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "process_positions_select" ON public."process_positions" AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR user_can_read_process(process_id)));
CREATE POLICY "process_positions_update_admin_manager" ON public."process_positions" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "tenant_select_process_positions" ON public."process_positions" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = get_user_tenant_id())))));
CREATE POLICY "steps_delete_admin" ON public."process_steps" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "steps_insert_admin" ON public."process_steps" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "steps_select" ON public."process_steps" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR user_can_read_process(process_id))));
CREATE POLICY "steps_update_admin" ON public."process_steps" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "process_tag_assignments_tenant_isolation" ON public."process_tag_assignments" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_tag_assignments.process_id) AND (p.tenant_id = ( SELECT profiles.tenant_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())))))));
CREATE POLICY "process_tags_tenant_isolation" ON public."process_tags" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "processes_delete_admin" ON public."processes" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "processes_insert_admin" ON public."processes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "processes_select" ON public."processes" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR user_can_read_process(id))));
CREATE POLICY "processes_update_admin" ON public."processes" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "profiles_insert" ON public."profiles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "profiles_select" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "profiles_update_own" ON public."profiles" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "pf_delete" ON public."project_doc_folders" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pf_insert" ON public."project_doc_folders" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pf_public_select" ON public."project_doc_folders" AS PERMISSIVE FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));
CREATE POLICY "pf_select" ON public."project_doc_folders" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "pf_update" ON public."project_doc_folders" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pd_delete" ON public."project_documents" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pd_folder_public_select" ON public."project_documents" AS PERMISSIVE FOR SELECT TO anon USING ((folder_id IN ( SELECT project_doc_folders.id
   FROM project_doc_folders
  WHERE ((project_doc_folders.is_public = true) AND (project_doc_folders.public_token IS NOT NULL)))));
CREATE POLICY "pd_insert" ON public."project_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "pd_public_select" ON public."project_documents" AS PERMISSIVE FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));
CREATE POLICY "pd_select" ON public."project_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "pd_update" ON public."project_documents" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "projects_delete_admin" ON public."projects" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "projects_insert_admin" ON public."projects" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "projects_select" ON public."projects" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR (has_role(auth.uid(), 'manager'::app_role) AND user_can_read_project(id)) OR (has_role(auth.uid(), 'member'::app_role) AND (user_has_project_assigned_task(id) OR (EXISTS ( SELECT 1
   FROM (employee_projects ep
     JOIN employees e ON ((e.id = ep.employee_id)))
  WHERE ((ep.project_id = projects.id) AND (ep.tenant_id = get_user_tenant_id()) AND (e.tenant_id = get_user_tenant_id()) AND (e.user_id = auth.uid())))))))));
CREATE POLICY "projects_update_admin" ON public."projects" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "push_subs_own_delete" ON public."push_subscriptions" AS PERMISSIVE FOR DELETE TO public USING ((employee_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))));
CREATE POLICY "push_subs_own_insert" ON public."push_subscriptions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((employee_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))));
CREATE POLICY "push_subs_own_select" ON public."push_subscriptions" AS PERMISSIVE FOR SELECT TO public USING ((employee_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))));
CREATE POLICY "push_subs_own_update" ON public."push_subscriptions" AS PERMISSIVE FOR UPDATE TO public USING ((employee_id = chat_my_employee_id())) WITH CHECK ((employee_id = chat_my_employee_id()));
CREATE POLICY "scheduled_messages_delete" ON public."scheduled_messages" AS PERMISSIVE FOR DELETE TO authenticated USING ((created_by = auth.uid()));
CREATE POLICY "scheduled_messages_insert" ON public."scheduled_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
CREATE POLICY "scheduled_messages_select" ON public."scheduled_messages" AS PERMISSIVE FOR SELECT TO authenticated USING ((created_by = auth.uid()));
CREATE POLICY "scheduled_messages_update" ON public."scheduled_messages" AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "subareas_delete_admin" ON public."subareas" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "subareas_insert_admin" ON public."subareas" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "subareas_select" ON public."subareas" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "subareas_update_admin" ON public."subareas" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "task_assignees_delete" ON public."task_assignees" AS PERMISSIVE FOR DELETE TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "task_assignees_insert" ON public."task_assignees" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "task_assignees_select" ON public."task_assignees" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "task_assignees_update" ON public."task_assignees" AS PERMISSIVE FOR UPDATE TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid())))) WITH CHECK ((tenant_id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "task_comments_delete" ON public."task_comments" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid())))));
CREATE POLICY "task_comments_insert" ON public."task_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_comments_select" ON public."task_comments" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_comments_update_own" ON public."task_comments" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid()))))) WITH CHECK (((tenant_id = get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_id = auth.uid())))));
CREATE POLICY "task_deps_delete" ON public."task_dependencies" AS PERMISSIVE FOR DELETE TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_deps_insert" ON public."task_dependencies" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_deps_select" ON public."task_dependencies" AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_history_select" ON public."task_history" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "task_recurrence_delete" ON public."task_recurrence" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (task_assignees ta
     JOIN employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));
CREATE POLICY "task_recurrence_insert" ON public."task_recurrence" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (task_assignees ta
     JOIN employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));
CREATE POLICY "task_recurrence_select" ON public."task_recurrence" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "task_recurrence_update" ON public."task_recurrence" AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (task_assignees ta
     JOIN employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));
CREATE POLICY "rec_comments_delete" ON public."task_recurrence_comments" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))) AND (author_id IN ( SELECT emp.id
   FROM employees emp
  WHERE (emp.user_id = auth.uid())))));
CREATE POLICY "rec_comments_insert" ON public."task_recurrence_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "rec_comments_select" ON public."task_recurrence_comments" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "rec_completions_delete" ON public."task_recurrence_completions" AS PERMISSIVE FOR DELETE TO public USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "rec_completions_insert" ON public."task_recurrence_completions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "rec_completions_select" ON public."task_recurrence_completions" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM profiles prof
  WHERE (prof.user_id = auth.uid()))));
CREATE POLICY "tte_delete_self" ON public."task_time_entries" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "tte_insert_self" ON public."task_time_entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "tte_select" ON public."task_time_entries" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "tte_update_self" ON public."task_time_entries" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "tasks_delete_admin" ON public."tasks" AS PERMISSIVE FOR DELETE TO authenticated USING (((tenant_id = get_user_tenant_id()) AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "tasks_insert" ON public."tasks" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "tasks_select" ON public."tasks" AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR is_admin() OR (has_role(auth.uid(), 'manager'::app_role) AND (((project_id IS NOT NULL) AND user_can_read_project(project_id)) OR (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = tasks.assignee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = get_user_tenant_id())))) OR (EXISTS ( SELECT 1
   FROM (task_assignees ta
     JOIN employees e ON ((e.id = ta.employee_id)))
  WHERE ((ta.task_id = tasks.id) AND (e.user_id = auth.uid()) AND (ta.tenant_id = get_user_tenant_id())))))) OR (has_role(auth.uid(), 'member'::app_role) AND ((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = tasks.assignee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = get_user_tenant_id())))) OR (EXISTS ( SELECT 1
   FROM (task_assignees ta
     JOIN employees e ON ((e.id = ta.employee_id)))
  WHERE ((ta.task_id = tasks.id) AND (e.user_id = auth.uid()) AND (ta.tenant_id = get_user_tenant_id())))))))));
CREATE POLICY "tasks_update" ON public."tasks" AS PERMISSIVE FOR UPDATE TO authenticated USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "admins can delete platforms" ON public."tenant_platforms" AS PERMISSIVE FOR DELETE TO public USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "admins can insert platforms" ON public."tenant_platforms" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "admins can update platforms" ON public."tenant_platforms" AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "tenant members can view platforms" ON public."tenant_platforms" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM user_roles
  WHERE (user_roles.user_id = auth.uid()))));
CREATE POLICY "tenant_select" ON public."tenants" AS PERMISSIVE FOR SELECT TO authenticated USING ((id = get_user_tenant_id()));
CREATE POLICY "tenant_update_admin" ON public."tenants" AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "roles_admin_delete" ON public."user_roles" AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY "roles_admin_insert" ON public."user_roles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "roles_admin_select" ON public."user_roles" AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "roles_select_own" ON public."user_roles" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "webhook_logs_insert" ON public."webhook_logs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "webhook_logs_select" ON public."webhook_logs" AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "webhooks_delete_admin" ON public."webhooks" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "webhooks_insert_admin" ON public."webhooks" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_user_tenant_id()) AND is_admin()));
CREATE POLICY "webhooks_select" ON public."webhooks" AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "webhooks_update_admin" ON public."webhooks" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND is_admin()));

-- GRANTs essenciais pro service_role (Edge Functions)
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
-- Garantia pra tabelas/funções criadas no futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role, postgres;
