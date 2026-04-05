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
      account_members: {
        Row: {
          account_id: string
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          joined_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          applied_coupon_id: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          referral_enterprise_until: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at: string
          whatsapp_loan_template: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          applied_coupon_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          referral_enterprise_until?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
          whatsapp_loan_template?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          applied_coupon_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          referral_enterprise_until?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
          whatsapp_loan_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_applied_coupon_id_fkey"
            columns: ["applied_coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_invites: {
        Row: {
          business_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          role: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          role: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          role?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_invites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          permissions: Json
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          account_id: string
          created_at: string
          created_by: string
          currency: string
          fiscal_year_start: number
          id: string
          industry: string | null
          logo_url: string | null
          metadata: Json
          name: string
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          preferences: Json
          secondary_currency: string | null
          settings: Json | null
          status: Database["public"]["Enums"]["business_status"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by: string
          currency?: string
          fiscal_year_start?: number
          id?: string
          industry?: string | null
          logo_url?: string | null
          metadata?: Json
          name: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          preferences?: Json
          secondary_currency?: string | null
          settings?: Json | null
          status?: Database["public"]["Enums"]["business_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          fiscal_year_start?: number
          id?: string
          industry?: string | null
          logo_url?: string | null
          metadata?: Json
          name?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          preferences?: Json
          secondary_currency?: string | null
          settings?: Json | null
          status?: Database["public"]["Enums"]["business_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          color: string
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          sub_category: string | null
          type: string
        }
        Insert: {
          business_id: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          sub_category?: string | null
          type: string
        }
        Update: {
          business_id?: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          sub_category?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          discount_percent: number
          expires_at: string | null
          id: string
          max_uses: number
          stripe_coupon_id: string | null
          stripe_promotion_code: string | null
          trial_days: number
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          discount_percent?: number
          expires_at?: string | null
          id?: string
          max_uses?: number
          stripe_coupon_id?: string | null
          stripe_promotion_code?: string | null
          trial_days?: number
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          discount_percent?: number
          expires_at?: string | null
          id?: string
          max_uses?: number
          stripe_coupon_id?: string | null
          stripe_promotion_code?: string | null
          trial_days?: number
        }
        Relationships: []
      }
      crm_customers: {
        Row: {
          account_id: string
          address: string | null
          created_at: string
          dob: string | null
          email: string | null
          id: string
          license_plate: string | null
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          account_id: string
          address?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          id?: string
          license_plate?: string | null
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          account_id?: string
          address?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          id?: string
          license_plate?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          business_id: string
          customer_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          customer_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          customer_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_id: string | null
          address: string | null
          business_id: string
          created_at: string
          dob: string | null
          email: string | null
          id: string
          license_plate: string | null
          name: string
          notes: string | null
          phone: string | null
          preferred_language: string
          stripe_customer_id: string | null
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          business_id: string
          created_at?: string
          dob?: string | null
          email?: string | null
          id?: string
          license_plate?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          stripe_customer_id?: string | null
        }
        Update: {
          account_id?: string | null
          address?: string | null
          business_id?: string
          created_at?: string
          dob?: string | null
          email?: string | null
          id?: string
          license_plate?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          stripe_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          business_id: string
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          days_of_week?: number[]
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string
          friend_email: string
          id: string
          note: string | null
          status: string
          transaction_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by: string
          friend_email: string
          id?: string
          note?: string | null
          status?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string
          friend_email?: string
          id?: string
          note?: string | null
          status?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          business_id: string
          created_at: string
          credit_limit: number
          id: string
          institution: string | null
          is_active: boolean
          last_four: string | null
          name: string
          starting_balance: number
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          credit_limit?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four?: string | null
          name: string
          starting_balance?: number
          type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          credit_limit?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four?: string | null
          name?: string
          starting_balance?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_results: {
        Row: {
          account_id: string
          created_at: string
          id: string
          iterations_run: number
          lr_intercept: number | null
          lr_r_squared: number | null
          lr_slope: number | null
          max_drawdown: number | null
          monthly_results: Json
          p10_total_net: number | null
          p50_total_net: number | null
          p90_total_net: number | null
          prob_positive: number | null
          prob_ruin: number | null
          run_at: string
          scenario_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          iterations_run: number
          lr_intercept?: number | null
          lr_r_squared?: number | null
          lr_slope?: number | null
          max_drawdown?: number | null
          monthly_results?: Json
          p10_total_net?: number | null
          p50_total_net?: number | null
          p90_total_net?: number | null
          prob_positive?: number | null
          prob_ruin?: number | null
          run_at?: string
          scenario_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          iterations_run?: number
          lr_intercept?: number | null
          lr_r_squared?: number | null
          lr_slope?: number | null
          max_drawdown?: number | null
          monthly_results?: Json
          p10_total_net?: number | null
          p50_total_net?: number | null
          p90_total_net?: number | null
          prob_positive?: number | null
          prob_ruin?: number | null
          run_at?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_results_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "forecast_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_scenarios: {
        Row: {
          account_id: string
          business_id: string
          cash_floor_alert: number | null
          confidence_target: number
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          expense_growth_rate: number
          expense_mean: number
          expense_std_dev: number
          horizon_months: number | null
          id: string
          mc_iterations: number
          metadata: Json
          method: Database["public"]["Enums"]["forecast_method"]
          name: string
          revenue_growth_rate: number
          revenue_mean: number
          revenue_std_dev: number
          rv_exp_correlation: number
          seasonal_factors: number[]
          start_date: string
          status: Database["public"]["Enums"]["sim_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          business_id: string
          cash_floor_alert?: number | null
          confidence_target?: number
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          expense_growth_rate?: number
          expense_mean?: number
          expense_std_dev?: number
          horizon_months?: number | null
          id?: string
          mc_iterations?: number
          metadata?: Json
          method?: Database["public"]["Enums"]["forecast_method"]
          name: string
          revenue_growth_rate?: number
          revenue_mean?: number
          revenue_std_dev?: number
          rv_exp_correlation?: number
          seasonal_factors?: number[]
          start_date?: string
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          business_id?: string
          cash_floor_alert?: number | null
          confidence_target?: number
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          expense_growth_rate?: number
          expense_mean?: number
          expense_std_dev?: number
          horizon_months?: number | null
          id?: string
          mc_iterations?: number
          metadata?: Json
          method?: Database["public"]["Enums"]["forecast_method"]
          name?: string
          revenue_growth_rate?: number
          revenue_mean?: number
          revenue_std_dev?: number
          rv_exp_correlation?: number
          seasonal_factors?: number[]
          start_date?: string
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_scenarios_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_scenarios_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          business_id: string
          created_at: string
          current_amount: number
          icon: string | null
          id: string
          name: string
          notes: string | null
          status: string
          target_amount: number
          target_date: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_amount?: number
          icon?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_amount?: number
          icon?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_projections: {
        Row: {
          account_id: string
          benefits_cost: number
          created_at: string
          cumulative_cost: number
          employer_taxes: number
          gross_salary: number
          id: string
          is_ramp_period: boolean
          month_date: string
          month_index: number
          overhead_cost: number
          simulation_id: string
          total_cost: number
        }
        Insert: {
          account_id: string
          benefits_cost: number
          created_at?: string
          cumulative_cost: number
          employer_taxes: number
          gross_salary: number
          id?: string
          is_ramp_period?: boolean
          month_date: string
          month_index: number
          overhead_cost: number
          simulation_id: string
          total_cost: number
        }
        Update: {
          account_id?: string
          benefits_cost?: number
          created_at?: string
          cumulative_cost?: number
          employer_taxes?: number
          gross_salary?: number
          id?: string
          is_ramp_period?: boolean
          month_date?: string
          month_index?: number
          overhead_cost?: number
          simulation_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "hiring_projections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_projections_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "hiring_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_simulations: {
        Row: {
          account_id: string
          base_salary_annual: number
          business_id: string
          computed_annual_cost: number | null
          computed_effective_rate: number | null
          computed_total_cost_burden: number | null
          created_at: string
          created_by: string
          currency: string
          dental_vision_annual: number
          department: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          equipment_one_time: number
          equity_annual_value: number
          health_insurance_annual: number
          id: string
          local_payroll_tax_rate: number
          medicare_rate: number
          metadata: Json
          name: string
          notes: string | null
          office_space_monthly: number
          onboarding_cost_one_time: number
          projection_months: number
          pto_days: number
          ramp_months: number
          ramp_productivity_pct: number
          recruiting_fee_one_time: number
          retirement_match_rate: number
          role_title: string
          social_security_rate: number
          software_licenses_monthly: number
          start_date: string | null
          status: Database["public"]["Enums"]["sim_status"]
          training_budget_annual: number
          unemployment_rate: number
          updated_at: string
          workers_comp_rate: number
        }
        Insert: {
          account_id: string
          base_salary_annual: number
          business_id: string
          computed_annual_cost?: number | null
          computed_effective_rate?: number | null
          computed_total_cost_burden?: number | null
          created_at?: string
          created_by: string
          currency?: string
          dental_vision_annual?: number
          department?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          equipment_one_time?: number
          equity_annual_value?: number
          health_insurance_annual?: number
          id?: string
          local_payroll_tax_rate?: number
          medicare_rate?: number
          metadata?: Json
          name: string
          notes?: string | null
          office_space_monthly?: number
          onboarding_cost_one_time?: number
          projection_months?: number
          pto_days?: number
          ramp_months?: number
          ramp_productivity_pct?: number
          recruiting_fee_one_time?: number
          retirement_match_rate?: number
          role_title: string
          social_security_rate?: number
          software_licenses_monthly?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["sim_status"]
          training_budget_annual?: number
          unemployment_rate?: number
          updated_at?: string
          workers_comp_rate?: number
        }
        Update: {
          account_id?: string
          base_salary_annual?: number
          business_id?: string
          computed_annual_cost?: number | null
          computed_effective_rate?: number | null
          computed_total_cost_burden?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          dental_vision_annual?: number
          department?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          equipment_one_time?: number
          equity_annual_value?: number
          health_insurance_annual?: number
          id?: string
          local_payroll_tax_rate?: number
          medicare_rate?: number
          metadata?: Json
          name?: string
          notes?: string | null
          office_space_monthly?: number
          onboarding_cost_one_time?: number
          projection_months?: number
          pto_days?: number
          ramp_months?: number
          ramp_productivity_pct?: number
          recruiting_fee_one_time?: number
          retirement_match_rate?: number
          role_title?: string
          social_security_rate?: number
          software_licenses_monthly?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["sim_status"]
          training_budget_annual?: number
          unemployment_rate?: number
          updated_at?: string
          workers_comp_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "hiring_simulations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_simulations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_simulations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string
          amount_due: number
          amount_paid: number
          amount_remaining: number
          attempt_count: number
          auto_advance: boolean
          created_at: string
          currency: string
          customer_id: string
          description: string | null
          due_date: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          metadata: Json
          next_payment_attempt: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["stripe_invoice_status"]
          stripe_invoice_id: string
          stripe_price_id: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_due: number
          amount_paid?: number
          amount_remaining?: number
          attempt_count?: number
          auto_advance?: boolean
          created_at?: string
          currency?: string
          customer_id: string
          description?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          metadata?: Json
          next_payment_attempt?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["stripe_invoice_status"]
          stripe_invoice_id: string
          stripe_price_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_due?: number
          amount_paid?: number
          amount_remaining?: number
          attempt_count?: number
          auto_advance?: boolean
          created_at?: string
          currency?: string
          customer_id?: string
          description?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          metadata?: Json
          next_payment_attempt?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["stripe_invoice_status"]
          stripe_invoice_id?: string
          stripe_price_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_stripe_price_id_fkey"
            columns: ["stripe_price_id"]
            isOneToOne: false
            referencedRelation: "stripe_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_installments: {
        Row: {
          due_date: string
          expected_amount: number
          id: string
          installment_number: number
          lat: number | null
          lng: number | null
          loan_id: string
          paid_amount: number
          paid_at: string | null
          payment_history: Json
          status: Database["public"]["Enums"]["installment_status"]
        }
        Insert: {
          due_date: string
          expected_amount: number
          id?: string
          installment_number: number
          lat?: number | null
          lng?: number | null
          loan_id: string
          paid_amount?: number
          paid_at?: string | null
          payment_history?: Json
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Update: {
          due_date?: string
          expected_amount?: number
          id?: string
          installment_number?: number
          lat?: number | null
          lng?: number | null
          loan_id?: string
          paid_amount?: number
          paid_at?: string | null
          payment_history?: Json
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          business_id: string
          collector_id: string | null
          created_at: string
          customer_id: string | null
          frequency: string
          id: string
          interest_rate: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          is_interest_frozen: boolean
          late_fee_daily_pct: number
          late_fee_fixed: number
          late_fee_flat_daily: number
          principal_amount: number
          start_date: string
          status: Database["public"]["Enums"]["loan_status"]
          total_installments: number
        }
        Insert: {
          business_id: string
          collector_id?: string | null
          created_at?: string
          customer_id?: string | null
          frequency?: string
          id?: string
          interest_rate: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          is_interest_frozen?: boolean
          late_fee_daily_pct?: number
          late_fee_fixed?: number
          late_fee_flat_daily?: number
          principal_amount: number
          start_date: string
          status?: Database["public"]["Enums"]["loan_status"]
          total_installments: number
        }
        Update: {
          business_id?: string
          collector_id?: string | null
          created_at?: string
          customer_id?: string | null
          frequency?: string
          id?: string
          interest_rate?: number
          interest_type?: Database["public"]["Enums"]["interest_type"]
          is_interest_frozen?: boolean
          late_fee_daily_pct?: number
          late_fee_fixed?: number
          late_fee_flat_daily?: number
          principal_amount?: number
          start_date?: string
          status?: Database["public"]["Enums"]["loan_status"]
          total_installments?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          ref_transaction_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          ref_transaction_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          ref_transaction_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ref_transaction_id_fkey"
            columns: ["ref_transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ref_transaction_id_fkey"
            columns: ["ref_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_superadmin: boolean | null
          metadata: Json
          nav_preferences: Json
          preferred_language: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_superadmin?: boolean | null
          metadata?: Json
          nav_preferences?: Json
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_superadmin?: boolean | null
          metadata?: Json
          nav_preferences?: Json
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_items: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          description: string
          frequency: string
          id: string
          is_active: boolean
          next_date: string
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          description: string
          frequency: string
          id?: string
          is_active?: boolean
          next_date?: string
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          description?: string
          frequency?: string
          id?: string
          is_active?: boolean
          next_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      scenario_projections: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          source: string
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          source?: string
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          source?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_projections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_prices: {
        Row: {
          active: boolean
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at: string
          currency: string
          id: string
          interval_count: number
          metadata: Json
          plan_key: Database["public"]["Enums"]["subscription_plan"] | null
          product_id: string
          trial_period_days: number | null
          unit_amount: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at?: string
          currency?: string
          id: string
          interval_count?: number
          metadata?: Json
          plan_key?: Database["public"]["Enums"]["subscription_plan"] | null
          product_id: string
          trial_period_days?: number | null
          unit_amount?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at?: string
          currency?: string
          id?: string
          interval_count?: number
          metadata?: Json
          plan_key?: Database["public"]["Enums"]["subscription_plan"] | null
          product_id?: string
          trial_period_days?: number | null
          unit_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stripe_products"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          api_version: string | null
          created_at: string
          data: Json
          error_message: string | null
          id: string
          processed: boolean
          processed_at: string | null
          retry_count: number
          type: string
        }
        Insert: {
          api_version?: string | null
          created_at?: string
          data: Json
          error_message?: string | null
          id: string
          processed?: boolean
          processed_at?: string | null
          retry_count?: number
          type: string
        }
        Update: {
          api_version?: string | null
          created_at?: string
          data?: Json
          error_message?: string | null
          id?: string
          processed?: boolean
          processed_at?: string | null
          retry_count?: number
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          account_id: string
          cancel_at: string | null
          canceled_at: string | null
          collection_method: string
          created_at: string
          current_period_end: string
          current_period_start: string
          customer_id: string | null
          ended_at: string | null
          forecasting_enabled: boolean
          hiring_simulator_enabled: boolean
          id: string
          is_active: boolean | null
          kanban_enabled: boolean
          max_businesses: number
          max_transactions_monthly: number
          max_users: number
          metadata: Json
          plan_key: Database["public"]["Enums"]["subscription_plan"]
          shift_control_enabled: boolean | null
          status: Database["public"]["Enums"]["stripe_subscription_status"]
          stripe_latest_invoice_id: string | null
          stripe_price_id: string
          stripe_subscription_id: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          whatsapp_enabled: boolean | null
          white_label_enabled: boolean
        }
        Insert: {
          account_id: string
          cancel_at?: string | null
          canceled_at?: string | null
          collection_method?: string
          created_at?: string
          current_period_end: string
          current_period_start: string
          customer_id?: string | null
          ended_at?: string | null
          forecasting_enabled?: boolean
          hiring_simulator_enabled?: boolean
          id?: string
          is_active?: boolean | null
          kanban_enabled?: boolean
          max_businesses?: number
          max_transactions_monthly?: number
          max_users?: number
          metadata?: Json
          plan_key?: Database["public"]["Enums"]["subscription_plan"]
          shift_control_enabled?: boolean | null
          status?: Database["public"]["Enums"]["stripe_subscription_status"]
          stripe_latest_invoice_id?: string | null
          stripe_price_id: string
          stripe_subscription_id: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean | null
          white_label_enabled?: boolean
        }
        Update: {
          account_id?: string
          cancel_at?: string | null
          canceled_at?: string | null
          collection_method?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          customer_id?: string | null
          ended_at?: string | null
          forecasting_enabled?: boolean
          hiring_simulator_enabled?: boolean
          id?: string
          is_active?: boolean | null
          kanban_enabled?: boolean
          max_businesses?: number
          max_transactions_monthly?: number
          max_users?: number
          metadata?: Json
          plan_key?: Database["public"]["Enums"]["subscription_plan"]
          shift_control_enabled?: boolean | null
          status?: Database["public"]["Enums"]["stripe_subscription_status"]
          stripe_latest_invoice_id?: string | null
          stripe_price_id?: string
          stripe_subscription_id?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean | null
          white_label_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          business_id: string
          category: string
          created_at: string
          description: string
          id: string
          metadata: Json
          priority: string
          screenshot_url: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          category?: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json
          priority?: string
          screenshot_url?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          priority?: string
          screenshot_url?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_logs: {
        Row: {
          action_type: string
          business_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          user_id: string | null
        }
        Insert: {
          action_type: string
          business_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          user_id?: string | null
        }
        Update: {
          action_type?: string
          business_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          account_id: string
          attachment_type: Database["public"]["Enums"]["attachment_type"]
          created_at: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          storage_path: string
          transaction_id: string
          uploaded_by: string
        }
        Insert: {
          account_id: string
          attachment_type?: Database["public"]["Enums"]["attachment_type"]
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          transaction_id: string
          uploaded_by: string
        }
        Update: {
          account_id?: string
          attachment_type?: Database["public"]["Enums"]["attachment_type"]
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          transaction_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_categories: {
        Row: {
          account_id: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          metadata: Json
          name: string
          parent_id: string | null
          slug: string
          transaction_type:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at: string
        }
        Insert: {
          account_id: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name: string
          parent_id?: string | null
          slug: string
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name?: string
          parent_id?: string | null
          slug?: string
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_categories_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_requests: {
        Row: {
          business_id: string
          created_at: string
          id: string
          justification: string
          proposed_changes: Json
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          justification: string
          proposed_changes: Json
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          justification?: string
          proposed_changes?: Json
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          approved_at: string | null
          approved_by: string | null
          business_id: string
          category_id: string | null
          counterparty_name: string | null
          counterparty_tax_id: string | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          exchange_rate: number
          external_id: string | null
          financial_account_id: string | null
          id: string
          import_hash: string | null
          import_source: string | null
          is_reconciled: boolean
          is_recurring: boolean
          kanban_status: Database["public"]["Enums"]["kanban_status"]
          metadata: Json
          notes: string | null
          observations: string | null
          paid_at: string | null
          parent_transaction_id: string | null
          payment_source: string | null
          purchase_date: string | null
          recurrence_end_date: string | null
          recurrence_interval:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          split_parent_id: string | null
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          category_id?: string | null
          counterparty_name?: string | null
          counterparty_tax_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          exchange_rate?: number
          external_id?: string | null
          financial_account_id?: string | null
          id?: string
          import_hash?: string | null
          import_source?: string | null
          is_reconciled?: boolean
          is_recurring?: boolean
          kanban_status?: Database["public"]["Enums"]["kanban_status"]
          metadata?: Json
          notes?: string | null
          observations?: string | null
          paid_at?: string | null
          parent_transaction_id?: string | null
          payment_source?: string | null
          purchase_date?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          split_parent_id?: string | null
          tags?: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          category_id?: string | null
          counterparty_name?: string | null
          counterparty_tax_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          exchange_rate?: number
          external_id?: string | null
          financial_account_id?: string | null
          id?: string
          import_hash?: string | null
          import_source?: string | null
          is_reconciled?: boolean
          is_recurring?: boolean
          kanban_status?: Database["public"]["Enums"]["kanban_status"]
          metadata?: Json
          notes?: string | null
          observations?: string | null
          paid_at?: string | null
          parent_transaction_id?: string | null
          payment_source?: string | null
          purchase_date?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          split_parent_id?: string | null
          tags?: string[]
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      kanban_summary: {
        Row: {
          account_id: string | null
          business_id: string | null
          kanban_status: Database["public"]["Enums"]["kanban_status"] | null
          last_activity: string | null
          overdue_count: number | null
          total_amount: number | null
          transaction_count: number | null
          type: Database["public"]["Enums"]["transaction_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      overdue_transactions: {
        Row: {
          account_id: string | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          business_id: string | null
          category_id: string | null
          counterparty_name: string | null
          counterparty_tax_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          days_overdue: number | null
          description: string | null
          due_date: string | null
          exchange_rate: number | null
          external_id: string | null
          id: string | null
          import_hash: string | null
          import_source: string | null
          is_recurring: boolean | null
          kanban_status: Database["public"]["Enums"]["kanban_status"] | null
          metadata: Json | null
          notes: string | null
          paid_at: string | null
          parent_transaction_id: string | null
          recurrence_end_date: string | null
          recurrence_interval:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          tags: string[] | null
          type: Database["public"]["Enums"]["transaction_type"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          category_id?: string | null
          counterparty_name?: string | null
          counterparty_tax_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          days_overdue?: never
          description?: string | null
          due_date?: string | null
          exchange_rate?: number | null
          external_id?: string | null
          id?: string | null
          import_hash?: string | null
          import_source?: string | null
          is_recurring?: boolean | null
          kanban_status?: Database["public"]["Enums"]["kanban_status"] | null
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          parent_transaction_id?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          tags?: string[] | null
          type?: Database["public"]["Enums"]["transaction_type"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          category_id?: string | null
          counterparty_name?: string | null
          counterparty_tax_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          days_overdue?: never
          description?: string | null
          due_date?: string | null
          exchange_rate?: number | null
          external_id?: string | null
          id?: string | null
          import_hash?: string | null
          import_source?: string | null
          is_recurring?: boolean | null
          kanban_status?: Database["public"]["Enums"]["kanban_status"] | null
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          parent_transaction_id?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          tags?: string[] | null
          type?: Database["public"]["Enums"]["transaction_type"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "overdue_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_account_owner: {
        Args: { p_account_id: string; p_user_id: string }
        Returns: undefined
      }
      claim_invite: {
        Args: { p_code: string }
        Returns: {
          business_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          role: string
          used_at: string | null
          used_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "business_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_hiring_simulation: {
        Args: { p_simulation_id: string }
        Returns: undefined
      }
      create_coupon: {
        Args: {
          p_code: string
          p_discount_percent?: number
          p_expires_at?: string
          p_max_uses?: number
          p_trial_days?: number
        }
        Returns: {
          code: string
          created_at: string
          current_uses: number
          discount_percent: number
          expires_at: string | null
          id: string
          max_uses: number
          stripe_coupon_id: string | null
          stripe_promotion_code: string | null
          trial_days: number
        }
        SetofOptions: {
          from: "*"
          to: "coupons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invite_code: { Args: never; Returns: string }
      generate_loan_installments: {
        Args: { p_loan_id: string }
        Returns: number
      }
      generate_referral_code: { Args: never; Returns: string }
      get_my_account_ids: { Args: never; Returns: string[] }
      get_my_account_ids_with_min_role: {
        Args: { min_role: Database["public"]["Enums"]["user_role"] }
        Returns: string[]
      }
      get_my_business_ids: { Args: never; Returns: string[] }
      get_my_owned_business_ids: { Args: never; Returns: string[] }
      get_or_create_referral_code: {
        Args: { p_user_id?: string }
        Returns: string
      }
      get_subscription_limits: {
        Args: { p_account_id: string }
        Returns: {
          current_period_end: string
          forecasting_enabled: boolean
          hiring_simulator_enabled: boolean
          kanban_enabled: boolean
          max_businesses: number
          max_transactions_monthly: number
          max_users: number
          plan_key: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["stripe_subscription_status"]
          white_label_enabled: boolean
        }[]
      }
      grant_referral_trial: { Args: { p_user_id: string }; Returns: undefined }
      has_account_role: {
        Args: {
          min_role: Database["public"]["Enums"]["user_role"]
          p_account_id: string
        }
        Returns: boolean
      }
      is_account_member: { Args: { p_account_id: string }; Returns: boolean }
      process_recurring_items: {
        Args: { p_business_id: string }
        Returns: number
      }
      process_referral: { Args: { p_code: string }; Returns: undefined }
      refresh_kanban_summary: { Args: never; Returns: undefined }
      seed_system_categories: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      use_coupon: {
        Args: { p_code: string }
        Returns: {
          code: string
          created_at: string
          current_uses: number
          discount_percent: number
          expires_at: string | null
          id: string
          max_uses: number
          stripe_coupon_id: string | null
          stripe_promotion_code: string | null
          trial_days: number
        }
        SetofOptions: {
          from: "*"
          to: "coupons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_type: "personal" | "business" | "professional" | "enterprise"
      attachment_type: "invoice" | "receipt" | "contract" | "other"
      billing_interval: "month" | "year"
      business_status: "active" | "inactive" | "archived"
      employment_type: "full_time" | "part_time" | "contractor" | "intern"
      forecast_method:
        | "linear_regression"
        | "monte_carlo"
        | "seasonal_adjustment"
        | "hybrid"
      installment_status:
        | "pending"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      interest_type: "simple" | "compound"
      kanban_status: "pending" | "in_review" | "approved" | "paid" | "rejected"
      loan_status: "active" | "paid" | "defaulted" | "cancelled"
      recurrence_interval:
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "annually"
      scenario_outcome: "optimistic" | "base" | "pessimistic"
      sim_status: "draft" | "active" | "archived"
      stripe_invoice_status:
        | "draft"
        | "open"
        | "paid"
        | "uncollectible"
        | "void"
      stripe_payment_status:
        | "requires_payment_method"
        | "requires_confirmation"
        | "requires_action"
        | "processing"
        | "requires_capture"
        | "canceled"
        | "succeeded"
      stripe_subscription_status:
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused"
      subscription_plan: "freemium" | "professional" | "enterprise"
      transaction_type: "income" | "expense" | "transfer"
      user_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["personal", "business", "professional", "enterprise"],
      attachment_type: ["invoice", "receipt", "contract", "other"],
      billing_interval: ["month", "year"],
      business_status: ["active", "inactive", "archived"],
      employment_type: ["full_time", "part_time", "contractor", "intern"],
      forecast_method: [
        "linear_regression",
        "monte_carlo",
        "seasonal_adjustment",
        "hybrid",
      ],
      installment_status: [
        "pending",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      interest_type: ["simple", "compound"],
      kanban_status: ["pending", "in_review", "approved", "paid", "rejected"],
      loan_status: ["active", "paid", "defaulted", "cancelled"],
      recurrence_interval: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "annually",
      ],
      scenario_outcome: ["optimistic", "base", "pessimistic"],
      sim_status: ["draft", "active", "archived"],
      stripe_invoice_status: ["draft", "open", "paid", "uncollectible", "void"],
      stripe_payment_status: [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "processing",
        "requires_capture",
        "canceled",
        "succeeded",
      ],
      stripe_subscription_status: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
      subscription_plan: ["freemium", "professional", "enterprise"],
      transaction_type: ["income", "expense", "transfer"],
      user_role: ["owner", "admin", "member", "viewer"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

