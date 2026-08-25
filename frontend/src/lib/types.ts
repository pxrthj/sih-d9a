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

export interface ExtractedData {
  manufacturer_packer_importer: string | null
  net_quantity: NetQuantity | null
  mrp: MRP | null
  mfg_or_pack_date: string | null
  consumer_care: string | null
  declarations_present: string[]
}

export interface Violation {
  field: string
  issue: string
  rule_ref: string
}

export interface ScanResponse {
  extracted: ExtractedData
  violations: Violation[]
  status: string | null
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
  status: string | null
  user_id?: string | null
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
