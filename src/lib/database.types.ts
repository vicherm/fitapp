export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: number
          user_id: string
          gym_detection_radius: number
          theme: 'dark'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          gym_detection_radius?: number
          theme?: 'dark'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          gym_detection_radius?: number
          theme?: 'dark'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      body_part_groups: {
        Row: {
          id: number
          user_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      gyms: {
        Row: {
          id: number
          user_id: string
          name: string
          abbreviation: string
          latitude: number
          longitude: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          name: string
          abbreviation: string
          latitude: number
          longitude: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          name?: string
          abbreviation?: string
          latitude?: number
          longitude?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: number
          user_id: string
          body_part_group_id: number
          name: string
          machine: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          body_part_group_id: number
          name: string
          machine?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          body_part_group_id?: number
          name?: string
          machine?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'exercises_body_part_group_id_user_id_fkey'
            columns: ['body_part_group_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'body_part_groups'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workouts: {
        Row: {
          id: number
          user_id: string
          gym_id: number | null
          start_time: string
          end_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          gym_id?: number | null
          start_time: string
          end_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          gym_id?: number | null
          start_time?: string
          end_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workouts_gym_id_user_id_fkey'
            columns: ['gym_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'gyms'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_exercises: {
        Row: {
          id: number
          user_id: string
          workout_id: number
          exercise_id: number
          exercise_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          workout_id: number
          exercise_id: number
          exercise_order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          workout_id?: number
          exercise_id?: number
          exercise_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_id_user_id_fkey'
            columns: ['workout_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'workout_exercises_exercise_id_user_id_fkey'
            columns: ['exercise_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'exercises'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_sets: {
        Row: {
          id: number
          user_id: string
          workout_exercise_id: number
          set_number: number
          weight: number
          reps: number
          performed_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string
          workout_exercise_id: number
          set_number: number
          weight: number
          reps: number
          performed_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          workout_exercise_id?: number
          set_number?: number
          weight?: number
          reps?: number
          performed_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_sets_workout_exercise_id_user_id_fkey'
            columns: ['workout_exercise_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_allowed_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
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

type DefaultSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] & Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] & Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
