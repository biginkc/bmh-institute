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
      answer_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          option_text: string
          question_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text: string
          question_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "answer_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          id: string
          lesson_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          submission_file_path: string | null
          submission_text: string | null
          submission_url: string | null
          submitted_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          id?: string
          lesson_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submission_file_path?: string | null
          submission_text?: string | null
          submission_url?: string | null
          submitted_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          id?: string
          lesson_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submission_file_path?: string | null
          submission_text?: string | null
          submission_url?: string | null
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          id: string
          instructions: string
          requires_review: boolean
          submission_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions: string
          requires_review?: boolean
          submission_type: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          requires_review?: boolean
          submission_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          count: number
          created_at: string
          expires_at: string
          key_type: Database["public"]["Enums"]["auth_rate_limit_key_type"]
          key_value: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          expires_at: string
          key_type: Database["public"]["Enums"]["auth_rate_limit_key_type"]
          key_value: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          expires_at?: string
          key_type?: Database["public"]["Enums"]["auth_rate_limit_key_type"]
          key_value?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      certificate_number_counters: {
        Row: {
          certificate_year: number
          next_number: number
          prefix: string
        }
        Insert: {
          certificate_year: number
          next_number?: number
          prefix: string
        }
        Update: {
          certificate_year?: number
          next_number?: number
          prefix?: string
        }
        Relationships: []
      }
      certificate_templates: {
        Row: {
          background_image_path: string | null
          body_html: string
          created_at: string
          id: string
          name: string
          scope: string
          updated_at: string
        }
        Insert: {
          background_image_path?: string | null
          body_html: string
          created_at?: string
          id?: string
          name: string
          scope?: string
          updated_at?: string
        }
        Update: {
          background_image_path?: string | null
          body_html?: string
          created_at?: string
          id?: string
          name?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string
          id: string
          issued_at: string
          pdf_path: string
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          id?: string
          issued_at?: string
          pdf_path?: string
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          id?: string
          issued_at?: string
          pdf_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          id: string
          is_required_for_completion: boolean
          lesson_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string
          id?: string
          is_required_for_completion?: boolean
          lesson_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          is_required_for_completion?: boolean
          lesson_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      course_access: {
        Row: {
          course_id: string
          id: string
          role_group_id: string
        }
        Insert: {
          course_id: string
          id?: string
          role_group_id: string
        }
        Update: {
          course_id?: string
          id?: string
          role_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_access_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_access_role_group_id_fkey"
            columns: ["role_group_id"]
            isOneToOne: false
            referencedRelation: "role_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          certificate_enabled: boolean
          certificate_template_id: string | null
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          certificate_enabled?: boolean
          certificate_template_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          certificate_enabled?: boolean
          certificate_template_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_certificate_template_id_fkey"
            columns: ["certificate_template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role_group_ids: string[]
          system_role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_group_ids?: string[]
          system_role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_group_ids?: string[]
          system_role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          assignment_id: string | null
          created_at: string
          description: string | null
          id: string
          is_required_for_completion: boolean
          lesson_type: string
          module_id: string
          prerequisite_lesson_id: string | null
          prerequisite_quiz_min_score: number | null
          quiz_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required_for_completion?: boolean
          lesson_type: string
          module_id: string
          prerequisite_lesson_id?: string | null
          prerequisite_quiz_min_score?: number | null
          quiz_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required_for_completion?: boolean
          lesson_type?: string
          module_id?: string
          prerequisite_lesson_id?: string | null
          prerequisite_quiz_min_score?: number | null
          quiz_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_prerequisite_lesson_id_fkey"
            columns: ["prerequisite_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          status: string
          system_role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          status?: string
          system_role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          status?: string
          system_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_access: {
        Row: {
          id: string
          program_id: string
          role_group_id: string
        }
        Insert: {
          id?: string
          program_id: string
          role_group_id: string
        }
        Update: {
          id?: string
          program_id?: string
          role_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_access_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_access_role_group_id_fkey"
            columns: ["role_group_id"]
            isOneToOne: false
            referencedRelation: "role_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      program_certificates: {
        Row: {
          certificate_number: string
          id: string
          issued_at: string
          pdf_path: string
          program_id: string
          user_id: string
        }
        Insert: {
          certificate_number: string
          id?: string
          issued_at?: string
          pdf_path?: string
          program_id: string
          user_id: string
        }
        Update: {
          certificate_number?: string
          id?: string
          issued_at?: string
          pdf_path?: string
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_certificates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_courses: {
        Row: {
          course_id: string
          id: string
          program_id: string
          sort_order: number
        }
        Insert: {
          course_id: string
          id?: string
          program_id: string
          sort_order?: number
        }
        Update: {
          course_id?: string
          id?: string
          program_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          certificate_enabled: boolean
          certificate_template_id: string | null
          course_order_mode: string
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          certificate_enabled?: boolean
          certificate_template_id?: string | null
          course_order_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          certificate_enabled?: boolean
          certificate_template_id?: string | null
          course_order_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_certificate_template_id_fkey"
            columns: ["certificate_template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          points: number
          question_text: string
          question_type: string
          quiz_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          points?: number
          question_text: string
          question_type: string
          quiz_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          points?: number
          question_text?: string
          question_type?: string
          quiz_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_attempts: number | null
          passing_score: number
          questions_per_attempt: number | null
          randomize_answers: boolean
          randomize_questions: boolean
          retake_cooldown_hours: number
          show_correct_answers_after: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_attempts?: number | null
          passing_score?: number
          questions_per_attempt?: number | null
          randomize_answers?: boolean
          randomize_questions?: boolean
          retake_cooldown_hours?: number
          show_correct_answers_after?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_attempts?: number | null
          passing_score?: number
          questions_per_attempt?: number | null
          randomize_answers?: boolean
          randomize_questions?: boolean
          retake_cooldown_hours?: number
          show_correct_answers_after?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_play_results: {
        Row: {
          attempt_id: string
          block_id: string
          completed_at: string
          goals_met: Json
          id: string
          scenario_id: string
          score: number | null
          summary: Json
          user_id: string
        }
        Insert: {
          attempt_id: string
          block_id: string
          completed_at?: string
          goals_met?: Json
          id?: string
          scenario_id: string
          score?: number | null
          summary?: Json
          user_id: string
        }
        Update: {
          attempt_id?: string
          block_id?: string
          completed_at?: string
          goals_met?: Json
          id?: string
          scenario_id?: string
          score?: number | null
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_play_results_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_play_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_block_progress: {
        Row: {
          block_id: string
          completed_at: string
          id: string
          user_id: string
        }
        Insert: {
          block_id: string
          completed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          block_id?: string
          completed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_block_progress_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_block_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_course_resume: {
        Row: {
          course_id: string
          last_block_id: string | null
          last_lesson_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          last_block_id?: string | null
          last_lesson_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          last_block_id?: string | null
          last_lesson_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_course_resume_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_course_resume_last_block_id_fkey"
            columns: ["last_block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_course_resume_last_lesson_id_fkey"
            columns: ["last_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_course_resume_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_completions: {
        Row: {
          completed_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_completions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_lesson_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quiz_attempts: {
        Row: {
          answer_orders: Json
          completed_at: string | null
          id: string
          lesson_id: string
          passed: boolean | null
          question_order: Json
          quiz_id: string
          responses: Json
          score: number | null
          started_at: string
          user_id: string
        }
        Insert: {
          answer_orders?: Json
          completed_at?: string | null
          id?: string
          lesson_id: string
          passed?: boolean | null
          question_order?: Json
          quiz_id: string
          responses?: Json
          score?: number | null
          started_at?: string
          user_id: string
        }
        Update: {
          answer_orders?: Json
          completed_at?: string | null
          id?: string
          lesson_id?: string
          passed?: boolean | null
          question_order?: Json
          quiz_id?: string
          responses?: Json
          score?: number | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quiz_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_video_progress: {
        Row: {
          block_id: string
          duration_seconds: number
          last_observed_at: string | null
          last_observed_position_seconds: number
          position_seconds: number
          updated_at: string
          user_id: string
          watched_ranges: Json
        }
        Insert: {
          block_id: string
          duration_seconds: number
          last_observed_at?: string | null
          last_observed_position_seconds?: number
          position_seconds?: number
          updated_at?: string
          user_id: string
          watched_ranges?: Json
        }
        Update: {
          block_id?: string
          duration_seconds?: number
          last_observed_at?: string | null
          last_observed_position_seconds?: number
          position_seconds?: number
          updated_at?: string
          user_id?: string
          watched_ranges?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_video_progress_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_video_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_groups: {
        Row: {
          role_group_id: string
          user_id: string
        }
        Insert: {
          role_group_id: string
          user_id: string
        }
        Update: {
          role_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_groups_role_group_id_fkey"
            columns: ["role_group_id"]
            isOneToOne: false
            referencedRelation: "role_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      answer_options_public: {
        Row: {
          id: string | null
          option_text: string | null
          question_id: string | null
          sort_order: number | null
        }
        Insert: {
          id?: string | null
          option_text?: string | null
          question_id?: string | null
          sort_order?: number | null
        }
        Update: {
          id?: string | null
          option_text?: string | null
          question_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "answer_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_check_and_consume_rate_limit: {
        Args: {
          p_key_type: Database["public"]["Enums"]["auth_rate_limit_key_type"]
          p_key_value: string
          p_threshold: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      fn_course_completion_percent: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: number
      }
      fn_course_completed_at: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: string | null
      }
      fn_course_is_complete: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_issue_course_certificate_if_eligible: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: undefined
      }
      fn_issue_program_certificate_if_eligible: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      fn_lesson_is_complete: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_lesson_is_unlocked: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_move_module: {
        Args: { p_course_id: string; p_direction: string; p_module_id: string }
        Returns: undefined
      }
      fn_next_certificate_number: {
        Args: { p_prefix: string }
        Returns: string
      }
      fn_program_completion_percent: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: number
      }
      fn_save_user_settings: {
        Args: {
          p_role_group_ids: string[]
          p_status: string
          p_system_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      fn_set_user_role_groups: {
        Args: { p_role_group_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      fn_user_has_course_access: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_user_has_program_access: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      auth_rate_limit_key_type: "ip" | "email"
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
      auth_rate_limit_key_type: ["ip", "email"],
    },
  },
} as const
