export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type LedgerEntryType = 'sale' | 'payment_received' | 'expense' | 'adjustment';
export type EntrySource = 'manual' | 'voice';
export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'card' | 'credit' | 'other';
export type ReceiptStatus = 'issued' | 'void';
export type ReceiptKind = 'sale' | 'balance_payment';
export type DebtStatus = 'open' | 'partial' | 'settled' | 'void';
export type CreditorStatus = 'open' | 'partial' | 'settled';
export type ReceiptTemplateStyle = 'classic' | 'modern' | 'thermal';
export type VatMode = 'exclusive' | 'inclusive';

export interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
}

export interface ReceiptLineItem {
  item_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_kobo: number;
  discount_kobo?: number;
  line_total_kobo: number;
}

export interface PublicReceiptResponse {
  receipt: {
    public_id: string;
    receipt_code: string;
    receipt_number: number;
    receipt_kind: ReceiptKind;
    parent_receipt_code: string | null;
    parent_public_id: string | null;
    customer_name: string;
    line_items: ReceiptLineItem[];
    subtotal_kobo: number;
    discount_kobo: number;
    tax_kobo: number;
    total_kobo: number;
    amount_paid_kobo: number;
    balance_due_kobo: number;
    outstanding_balance_kobo: number;
    payment_method: PaymentMethod;
    status: ReceiptStatus;
    void_reason: string | null;
    voided_at: string | null;
    notes: string | null;
    sold_by: string | null;
    issued_at: string;
    entry_date: string;
  };
  business: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    rc_number: string | null;
    tax_id: string | null;
    logo_path: string | null;
    brand_color: string;
    receipt_template: ReceiptTemplateStyle;
    receipt_footer_note: string | null;
    currency: string;
    vat_enabled: boolean;
  };
}

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          rc_number: string | null;
          tax_id: string | null;
          logo_path: string | null;
          brand_color: string;
          receipt_prefix: string;
          invoice_prefix: string;
          quote_prefix: string;
          receipt_template: ReceiptTemplateStyle;
          receipt_footer_note: string | null;
          currency: string;
          timezone: string;
          vat_enabled: boolean;
          vat_mode: VatMode;
          vat_rate_bps: number;
          bank_accounts: BankAccount[];
          default_payment_terms: string | null;
          default_invoice_notes: string | null;
          opening_cash_balance_kobo: number;
          close_day_reminder_time: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          rc_number?: string | null;
          tax_id?: string | null;
          logo_path?: string | null;
          brand_color?: string;
          receipt_prefix?: string;
          invoice_prefix?: string;
          quote_prefix?: string;
          receipt_template?: ReceiptTemplateStyle;
          receipt_footer_note?: string | null;
          currency?: string;
          timezone?: string;
          vat_enabled?: boolean;
          vat_mode?: VatMode;
          vat_rate_bps?: number;
          bank_accounts?: BankAccount[];
          default_payment_terms?: string | null;
          default_invoice_notes?: string | null;
          opening_cash_balance_kobo?: number;
          close_day_reminder_time?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          rc_number?: string | null;
          tax_id?: string | null;
          logo_path?: string | null;
          brand_color?: string;
          receipt_prefix?: string;
          invoice_prefix?: string;
          quote_prefix?: string;
          receipt_template?: ReceiptTemplateStyle;
          receipt_footer_note?: string | null;
          currency?: string;
          timezone?: string;
          vat_enabled?: boolean;
          vat_mode?: VatMode;
          vat_rate_bps?: number;
          bank_accounts?: BankAccount[];
          default_payment_terms?: string | null;
          default_invoice_notes?: string | null;
          opening_cash_balance_kobo?: number;
          close_day_reminder_time?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      items: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          sku: string | null;
          unit: string;
          default_price_kobo: number;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          sku?: string | null;
          unit?: string;
          default_price_kobo?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          sku?: string | null;
          unit?: string;
          default_price_kobo?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'items_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      receipt_counters: {
        Row: {
          business_id: string;
          last_number: number;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          last_number?: number;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          last_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipt_counters_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: true;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      receipts: {
        Row: {
          id: string;
          business_id: string;
          public_id: string;
          receipt_number: number;
          receipt_code: string;
          parent_receipt_id: string | null;
          receipt_kind: ReceiptKind;
          debt_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          line_items: ReceiptLineItem[];
          subtotal_kobo: number;
          discount_kobo: number;
          tax_kobo: number;
          total_kobo: number;
          amount_paid_kobo: number;
          balance_due_kobo: number;
          payment_method: PaymentMethod;
          status: ReceiptStatus;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          notes: string | null;
          sold_by: string | null;
          source: EntrySource;
          issued_at: string;
          entry_date: string;
          created_by: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'receipts_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receipts_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receipts_parent_receipt_id_fkey';
            columns: ['parent_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'receipts';
            referencedColumns: ['id'];
          },
        ];
      };
      debts: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          receipt_id: string | null;
          original_amount_kobo: number;
          amount_paid_kobo: number;
          balance_kobo: number;
          status: DebtStatus;
          due_date: string | null;
          notes: string | null;
          sold_by: string | null;
          source: EntrySource;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          receipt_id?: string | null;
          original_amount_kobo: number;
          amount_paid_kobo?: number;
          status?: DebtStatus;
          due_date?: string | null;
          notes?: string | null;
          sold_by?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          receipt_id?: string | null;
          original_amount_kobo?: number;
          amount_paid_kobo?: number;
          status?: DebtStatus;
          due_date?: string | null;
          notes?: string | null;
          sold_by?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'debts_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'debts_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'debts_receipt_id_fkey';
            columns: ['receipt_id'];
            isOneToOne: true;
            referencedRelation: 'receipts';
            referencedColumns: ['id'];
          },
        ];
      };
      creditors: {
        Row: {
          id: string;
          business_id: string;
          supplier_name: string;
          supplier_phone: string | null;
          description: string | null;
          original_amount_kobo: number;
          amount_paid_kobo: number;
          balance_kobo: number;
          status: CreditorStatus;
          due_date: string | null;
          notes: string | null;
          source: EntrySource;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          supplier_name: string;
          supplier_phone?: string | null;
          description?: string | null;
          original_amount_kobo: number;
          amount_paid_kobo?: number;
          status?: CreditorStatus;
          due_date?: string | null;
          notes?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          supplier_name?: string;
          supplier_phone?: string | null;
          description?: string | null;
          original_amount_kobo?: number;
          amount_paid_kobo?: number;
          status?: CreditorStatus;
          due_date?: string | null;
          notes?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'creditors_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      ledger_entries: {
        Row: {
          id: string;
          business_id: string;
          type: LedgerEntryType;
          amount_kobo: number;
          payment_method: PaymentMethod;
          category: string | null;
          payee: string | null;
          description: string;
          customer_id: string | null;
          receipt_id: string | null;
          debt_id: string | null;
          creditor_id: string | null;
          related_entry_id: string | null;
          proof_path: string | null;
          is_credit_sale: boolean;
          occurred_at: string;
          entry_date: string;
          sold_by: string | null;
          source: EntrySource;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          type: LedgerEntryType;
          amount_kobo: number;
          payment_method?: PaymentMethod;
          category?: string | null;
          payee?: string | null;
          description: string;
          customer_id?: string | null;
          receipt_id?: string | null;
          debt_id?: string | null;
          creditor_id?: string | null;
          related_entry_id?: string | null;
          proof_path?: string | null;
          is_credit_sale?: boolean;
          occurred_at?: string;
          entry_date?: string;
          sold_by?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          type?: LedgerEntryType;
          amount_kobo?: number;
          payment_method?: PaymentMethod;
          category?: string | null;
          payee?: string | null;
          description?: string;
          customer_id?: string | null;
          receipt_id?: string | null;
          debt_id?: string | null;
          creditor_id?: string | null;
          related_entry_id?: string | null;
          proof_path?: string | null;
          is_credit_sale?: boolean;
          occurred_at?: string;
          entry_date?: string;
          sold_by?: string | null;
          source?: EntrySource;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_receipt_id_fkey';
            columns: ['receipt_id'];
            isOneToOne: false;
            referencedRelation: 'receipts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_debt_id_fkey';
            columns: ['debt_id'];
            isOneToOne: false;
            referencedRelation: 'debts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_creditor_id_fkey';
            columns: ['creditor_id'];
            isOneToOne: false;
            referencedRelation: 'creditors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_related_entry_id_fkey';
            columns: ['related_entry_id'];
            isOneToOne: false;
            referencedRelation: 'ledger_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      day_closures: {
        Row: {
          id: string;
          business_id: string;
          closure_date: string;
          total_sales_kobo: number;
          total_receipt_sales_kobo: number;
          total_quick_sales_kobo: number;
          total_credit_sales_kobo: number;
          total_payments_received_kobo: number;
          total_expenses_kobo: number;
          total_adjustments_kobo: number;
          opening_cash_kobo: number;
          cash_in_kobo: number;
          cash_out_kobo: number;
          transfer_in_kobo: number;
          pos_in_kobo: number;
          other_in_kobo: number;
          net_cash_book_kobo: number;
          expected_cash_kobo: number;
          actual_cash_counted_kobo: number | null;
          variance_kobo: number | null;
          notes: string | null;
          closed_by: string;
          closed_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          closure_date: string;
          total_sales_kobo?: number;
          total_receipt_sales_kobo?: number;
          total_quick_sales_kobo?: number;
          total_credit_sales_kobo?: number;
          total_payments_received_kobo?: number;
          total_expenses_kobo?: number;
          total_adjustments_kobo?: number;
          opening_cash_kobo?: number;
          cash_in_kobo?: number;
          cash_out_kobo?: number;
          transfer_in_kobo?: number;
          pos_in_kobo?: number;
          other_in_kobo?: number;
          net_cash_book_kobo?: number;
          expected_cash_kobo?: number;
          actual_cash_counted_kobo?: number | null;
          notes?: string | null;
          closed_by?: string;
          closed_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'day_closures_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_corrections: {
        Row: {
          id: string;
          business_id: string;
          original_entry_id: string;
          adjustment_entry_ids: string[];
          action: 'edit' | 'delete';
          reason: string;
          before_snapshot: Json;
          after_snapshot: Json | null;
          created_by: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'entry_corrections_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_corrections_original_entry_id_fkey';
            columns: ['original_entry_id'];
            isOneToOne: false;
            referencedRelation: 'ledger_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      analytics_events: {
        Row: {
          id: string;
          business_id: string | null;
          user_id: string | null;
          event_name: string;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id?: string | null;
          user_id?: string | null;
          event_name: string;
          properties?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'analytics_events_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      issue_receipt: {
        Args: {
          p_business_id: string;
          p_line_items: Json;
          p_customer_id?: string | null;
          p_customer_name?: string;
          p_customer_phone?: string | null;
          p_discount_kobo?: number;
          p_tax_kobo?: number;
          p_amount_paid_kobo?: number | null;
          p_payment_method?: PaymentMethod;
          p_notes?: string | null;
          p_sold_by?: string | null;
          p_source?: EntrySource;
          p_due_date?: string | null;
          p_issued_at?: string | null;
        };
        Returns: Database['public']['Tables']['receipts']['Row'];
      };
      record_payment: {
        Args: {
          p_receipt_id: string;
          p_amount_kobo: number;
          p_payment_method?: PaymentMethod;
          p_notes?: string | null;
          p_sold_by?: string | null;
          p_source?: EntrySource;
          p_paid_at?: string | null;
        };
        Returns: Database['public']['Tables']['receipts']['Row'];
      };
      void_receipt: {
        Args: {
          p_receipt_id: string;
          p_reason: string;
        };
        Returns: Database['public']['Tables']['receipts']['Row'];
      };
      get_public_receipt: {
        Args: {
          p_public_id: string;
        };
        Returns: PublicReceiptResponse | null;
      };
      delete_owner_data: {
        Args: {
          p_owner_id: string;
        };
        Returns: undefined;
      };
      create_quick_sale: {
        Args: {
          p_business_id: string;
          p_amount_kobo: number;
          p_payment_method?: PaymentMethod;
          p_description?: string | null;
          p_customer_id?: string | null;
          p_customer_name?: string | null;
          p_sold_by?: string | null;
          p_occurred_at?: string | null;
          p_source?: EntrySource;
        };
        Returns: Database['public']['Tables']['ledger_entries']['Row'];
      };
      create_quick_credit_sale: {
        Args: {
          p_business_id: string;
          p_amount_kobo: number;
          p_customer_name: string;
          p_customer_phone?: string | null;
          p_customer_id?: string | null;
          p_description?: string | null;
          p_due_date?: string | null;
          p_sold_by?: string | null;
          p_occurred_at?: string | null;
          p_source?: EntrySource;
        };
        Returns: Database['public']['Tables']['debts']['Row'];
      };
      issue_receipt_for_quick_sale: {
        Args: {
          p_ledger_entry_id: string;
          p_line_items: Json;
          p_customer_id?: string | null;
          p_customer_name?: string;
          p_customer_phone?: string | null;
          p_discount_kobo?: number;
          p_tax_kobo?: number;
          p_amount_paid_kobo?: number | null;
          p_payment_method?: PaymentMethod | null;
          p_notes?: string | null;
          p_sold_by?: string | null;
          p_due_date?: string | null;
        };
        Returns: Database['public']['Tables']['receipts']['Row'];
      };
      record_debt_payment: {
        Args: {
          p_debt_id: string;
          p_amount_kobo: number;
          p_payment_method?: PaymentMethod;
          p_notes?: string | null;
          p_sold_by?: string | null;
          p_source?: EntrySource;
          p_paid_at?: string | null;
        };
        Returns: Database['public']['Tables']['receipts']['Row'];
      };
      delete_open_expense: {
        Args: {
          p_entry_id: string;
        };
        Returns: undefined;
      };
      correct_closed_day_entry: {
        Args: {
          p_entry_id: string;
          p_action: 'edit' | 'delete';
          p_new_amount_kobo?: number | null;
          p_new_payment_method?: PaymentMethod | null;
          p_new_category?: string | null;
          p_new_payee?: string | null;
          p_new_description?: string | null;
          p_reason?: string | null;
        };
        Returns: Database['public']['Tables']['entry_corrections']['Row'];
      };
      close_day: {
        Args: {
          p_business_id: string;
          p_closure_date: string;
          p_actual_cash_counted_kobo: number;
          p_notes?: string | null;
        };
        Returns: Database['public']['Tables']['day_closures']['Row'];
      };
      pay_creditor: {
        Args: {
          p_creditor_id: string;
          p_amount_kobo: number;
          p_payment_method?: PaymentMethod;
          p_record_expense?: boolean;
          p_notes?: string | null;
          p_paid_at?: string | null;
        };
        Returns: Database['public']['Tables']['creditors']['Row'];
      };
    };
    Enums: {
      ledger_entry_type: LedgerEntryType;
      entry_source: EntrySource;
      payment_method: PaymentMethod;
      receipt_status: ReceiptStatus;
      debt_status: DebtStatus;
      creditor_status: CreditorStatus;
      receipt_template_style: ReceiptTemplateStyle;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Business = Database['public']['Tables']['businesses']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Item = Database['public']['Tables']['items']['Row'];
export type Receipt = Database['public']['Tables']['receipts']['Row'];
export type LedgerEntry = Database['public']['Tables']['ledger_entries']['Row'];
export type Debt = Database['public']['Tables']['debts']['Row'];
export type Creditor = Database['public']['Tables']['creditors']['Row'];
export type DayClosure = Database['public']['Tables']['day_closures']['Row'];
export type EntryCorrection = Database['public']['Tables']['entry_corrections']['Row'];
export type ReceiptCounter = Database['public']['Tables']['receipt_counters']['Row'];
export type AnalyticsEvent = Database['public']['Tables']['analytics_events']['Row'];
