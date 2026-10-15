export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          owner_id: string;
          logo_url: string | null;
          description: string | null;
          phone: string | null;
          address: string | null;
          theme_color: string | null;
          created_at: string;
          // Billing — only writable by the service role (trigger protect_tenant_billing)
          plan_id: string | null;
          subscription_status: string | null;
          subscription_plan: string | null;
          subscription_payment_id: string | null;
          subscription_updated_at: string | null;
          subscription_expires_at: string | null;
          trial_ends_at: string | null;
          // Bank transfer details shown to customers who choose "transferencia"
          transfer_bank: string | null;
          transfer_account_type: string | null;
          transfer_account_number: string | null;
          transfer_rut: string | null;
          transfer_email: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          owner_id: string;
          logo_url?: string | null;
          description?: string | null;
          phone?: string | null;
          address?: string | null;
          theme_color?: string | null;
          created_at?: string;
          plan_id?: string | null;
          subscription_status?: string | null;
          subscription_plan?: string | null;
          subscription_payment_id?: string | null;
          subscription_updated_at?: string | null;
          subscription_expires_at?: string | null;
          trial_ends_at?: string | null;
          transfer_bank?: string | null;
          transfer_account_type?: string | null;
          transfer_account_number?: string | null;
          transfer_rut?: string | null;
          transfer_email?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          owner_id?: string;
          logo_url?: string | null;
          description?: string | null;
          phone?: string | null;
          address?: string | null;
          theme_color?: string | null;
          plan_id?: string | null;
          subscription_status?: string | null;
          subscription_plan?: string | null;
          subscription_payment_id?: string | null;
          subscription_updated_at?: string | null;
          subscription_expires_at?: string | null;
          trial_ends_at?: string | null;
          transfer_bank?: string | null;
          transfer_account_type?: string | null;
          transfer_account_number?: string | null;
          transfer_rut?: string | null;
          transfer_email?: string | null;
        };
        Relationships: never[];
      };
      pending_activations: {
        Row: {
          id: string;
          email: string;
          plan_id: string;
          payment_id: string;
          annual: boolean;
          paid_at: string;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          plan_id: string;
          payment_id: string;
          annual?: boolean;
          paid_at?: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by?: string | null;
        };
        Relationships: never[];
      };
      cash_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          opened_by: string;
          opened_at: string;
          opening_amount: number;
          closed_at: string | null;
          closing_amount: number | null;
          notes: string;
          status: 'open' | 'closed';
        };
        Insert: {
          id?: string;
          tenant_id: string;
          opened_by: string;
          opened_at?: string;
          opening_amount?: number;
          closed_at?: string | null;
          closing_amount?: number | null;
          notes?: string;
          status?: 'open' | 'closed';
        };
        Update: {
          closed_at?: string | null;
          closing_amount?: number | null;
          notes?: string;
          status?: 'open' | 'closed';
        };
        Relationships: never[];
      };
      cash_withdrawals: {
        Row: {
          id: string;
          session_id: string;
          tenant_id: string;
          amount: number;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          tenant_id: string;
          amount: number;
          reason?: string;
        };
        Update: never;
        Relationships: never[];
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string;
          price: number;
          image_url: string;
          category: string;
          is_available: boolean;
          stock: number;
          ai_hint: string;
          created_at: string;
          is_archived: boolean;
          /** Unit cost (CLP). Pro: margin & restock estimates. */
          cost: number | null;
          /** Stock level to restock up to (Pro restock alerts). */
          restock_target: number | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          description: string;
          price: number;
          image_url?: string;
          category: string;
          is_available?: boolean;
          stock?: number;
          ai_hint?: string;
          created_at?: string;
          is_archived?: boolean;
          cost?: number | null;
          restock_target?: number | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          description?: string;
          price?: number;
          image_url?: string;
          category?: string;
          is_available?: boolean;
          stock?: number;
          ai_hint?: string;
          is_archived?: boolean;
          cost?: number | null;
          restock_target?: number | null;
        };
        Relationships: never[];
      };
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          nickname: string;
          pickup_code: string;
          payment_method: string;
          total: number;
          status: string;
          customer_id: string | null;
          created_at: string;
          short_id: number | null;
          order_type: 'aqui' | 'llevar';
          confirmed_at: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          delivered_at: string | null;
          paid_online: boolean;
          online_payment_id: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nickname: string;
          pickup_code: string;
          payment_method: string;
          total: number;
          status?: string;
          customer_id?: string | null;
          created_at?: string;
          short_id?: number | null;
          order_type?: 'aqui' | 'llevar';
        };
        Update: {
          id?: string;
          tenant_id?: string;
          nickname?: string;
          pickup_code?: string;
          payment_method?: string;
          total?: number;
          status?: string;
          customer_id?: string | null;
          short_id?: number | null;
          order_type?: 'aqui' | 'llevar';
        };
        Relationships: never[];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          price: number;
          quantity: number;
          /** Product cost frozen when the order was placed (Pro margin). */
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          price: number;
          quantity: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          price?: number;
          quantity?: number;
        };
        Relationships: never[];
      };
      product_modifier_groups: {
        Row: {
          id: string;
          product_id: string;
          tenant_id: string;
          name: string;
          type: 'checkbox' | 'radio';
          required: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          tenant_id: string;
          name: string;
          type?: 'checkbox' | 'radio';
          required?: boolean;
          sort_order?: number;
        };
        Update: {
          name?: string;
          type?: 'checkbox' | 'radio';
          required?: boolean;
          sort_order?: number;
        };
        Relationships: never[];
      };
      product_modifier_options: {
        Row: {
          id: string;
          group_id: string;
          tenant_id: string;
          name: string;
          price_delta: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          tenant_id: string;
          name: string;
          price_delta?: number;
          sort_order?: number;
        };
        Update: {
          name?: string;
          price_delta?: number;
          sort_order?: number;
        };
        Relationships: never[];
      };
      order_item_modifiers: {
        Row: {
          id: string;
          order_item_id: string;
          option_id: string | null;
          option_name: string;
          group_name: string;
          price_delta: number;
        };
        Insert: {
          id?: string;
          order_item_id: string;
          option_id?: string | null;
          option_name: string;
          group_name: string;
          price_delta?: number;
        };
        Update: never;
        Relationships: never[];
      };
    };
    Views: {
      /** Public storefront data of a tenant (no billing / bank data). See migration 013. */
      tenants_public: {
        Row: {
          id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          description: string | null;
          phone: string | null;
          address: string | null;
          effective_plan: string;
          online_payments: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** Creates an order server-side (prices, total, stock and plan limits come from the DB). */
      create_order: {
        Args: {
          p_tenant_slug: string;
          p_nickname: string;
          p_payment_method: string;
          p_order_type: string;
          p_items: Json;
        };
        Returns: Json;
      };
      /** Public tracking of ONE order by its UUID (null when it does not exist). */
      get_order_public: {
        Args: { p_order_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
