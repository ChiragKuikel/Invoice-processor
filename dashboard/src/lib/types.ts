export interface Invoice {
  id: string;
  source_file_url: string | null;
  raw_ocr_text: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: { description: string; quantity: number; amount: number }[] | null;
  category: string | null;
  category_confidence: number | null;
  is_recurring: boolean | null;
  extraction_confidence: number | null;
  status: "pending" | "processing" | "auto_approved" | "flagged" | "reviewed" | "error";
  flags: string[];
  anomaly_note: string | null;
  idempotency_key: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  invoice_id: string;
  actor: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  reasoning: string | null;
  created_at: string;
}
