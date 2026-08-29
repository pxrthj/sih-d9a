// Shapes mirror the FastAPI backend (backend/app/schemas/scan.py) and the
// Supabase "scans" / "profiles" tables. Nothing here is mock data — these are
// the contracts real responses conform to.

export interface NetQuantity {
  value: string
  unit: string
}

export interface MRP {
  value: string
  inclusive_of_taxes_stated: boolean
}

/** How the declarations are physically laid out — an observation, not a verdict. */
export interface DeclarationBlock {
  fields_in_block: string[]
  stacked_together: boolean
  print_size: string | null
  legible_in_photo: boolean | null
  location_note: string | null
}

export interface ExtractedData {
  product_name: string | null
  manufacturer_packer_importer: string | null
  net_quantity: NetQuantity | null
  mrp: MRP | null
  mfg_or_pack_date: string | null
  use_by_date: string | null
  lot_batch_number: string | null
  consumer_care: string | null
  declarations_present: string[]
  declaration_block: DeclarationBlock | null
}

export interface Violation {
  field: string
  issue: string
  rule_ref: string
}

/**
 * A finding the officer should verify by hand. Advisories are NOT rule
 * failures and never change the compliance status.
 */
export interface Advisory {
  field: string
  issue: string
  rule_ref: string
}

export interface ScanResponse {
  extracted: ExtractedData
  violations: Violation[]
  advisories?: Advisory[]
  status: string | null
}

/** Maximum label photos per scan; the backend enforces the same limit. */
export const MAX_LABEL_IMAGES = 4

/**
 * The public view of an inspection, returned to anyone holding the notice.
 * Deliberately narrower than a ScanRecord — no photos, no officer email.
 */
export interface Verification {
  notice_ref: string
  status: string | null
  inspection_date: string
  officer_name: string
  category: string
  product_name: string | null
  manufacturer: string | null
  violations: Violation[]
  advisories: Advisory[]
}

// A row from the Supabase "scans" table.
export interface ScanRecord {
  id: string | number
  created_at?: string | null
  front_path?: string | null
  back_path?: string | null
  storage_path?: string | null
  extracted: ExtractedData | null
  violations: Violation[] | null
  advisories?: Advisory[] | null
  status: string | null
  user_id?: string | null
  category?: string | null
}

export type Role = 'admin' | 'officer' | 'none'
export type ProfileStatus = 'active' | 'inactive'

// A row from the Supabase "profiles" table.
export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
  status: ProfileStatus
  created_at?: string | null
}
