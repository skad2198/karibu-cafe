// ============================================
// Database Types for Karibu Café
// ============================================

export type AppRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'staff';

export type TableStatus = 'available' | 'occupied' | 'billing' | 'cleaning' | 'inactive';

export type OrderStatus =
  | 'draft' | 'submitted' | 'accepted_by_kitchen' | 'preparing'
  | 'ready' | 'served' | 'billed' | 'paid' | 'closed' | 'cancelled' | 'voided';

export type OrderItemStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'voided';

export type PaymentMethod = 'cash' | 'card' | 'mpesa' | 'other';

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export type InventoryCategory = 'raw_ingredient' | 'finished_good' | 'consumable' | 'cutlery_small_asset' | 'packaged_retail';

export type InventoryTxType =
  | 'purchase_receipt' | 'sale_deduction' | 'manual_adjustment'
  | 'waste_spoilage' | 'stock_count' | 'transfer' | 'opening_balance';

export type AssetStatus = 'active' | 'maintenance' | 'retired' | 'disposed' | 'lost';
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';
export type ReconciliationStatus = 'open' | 'closed';
export type AuditAction = 'create' | 'update' | 'delete' | 'void' | 'cancel' | 'discount' | 'complimentary' | 'status_change' | 'login' | 'logout';

// ============================================
// Table Row Types
// ============================================

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  locale: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  branch_id: string | null;
  is_active: boolean;
  staff_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  branch_id: string | null;
  granted_by: string | null;
  created_at: string;
}

export interface TaxSetting {
  id: string;
  branch_id: string | null;
  name: string;
  rate: number;
  is_inclusive: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestaurantTable {
  id: string;
  branch_id: string;
  table_number: string;
  capacity: number | null;
  status: TableStatus;
  qr_token: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuCategory {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  sku: string | null;
  is_available: boolean;
  is_active: boolean;
  is_taxable: boolean;
  prep_time_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  category?: MenuCategory;
}

export interface MenuItemModifier {
  id: string;
  menu_item_id: string | null;
  branch_id: string;
  name: string;
  price_adjustment: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: string;
  branch_id: string;
  table_id: string | null;
  order_number: number;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  discount_reason: string | null;
  is_complimentary: boolean;
  complimentary_reason: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  table?: RestaurantTable;
  items?: OrderItem[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_rate: number;
  tax_amount: number;
  status: OrderItemStatus;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  modifiers?: OrderItemModifier[];
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_id: string | null;
  name: string;
  price_adjustment: number;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  branch_id: string;
  amount: number;
  method: PaymentMethod;
  reference_number: string | null;
  receipt_number: string | null;
  status: PaymentStatus;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  branch_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unit_of_measure: string;
  current_quantity: number;
  reorder_level: number;
  cost_per_unit: number;
  supplier_id: string | null;
  sku: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
}

export interface InventoryTransaction {
  id: string;
  branch_id: string;
  inventory_item_id: string;
  transaction_type: InventoryTxType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number | null;
  total_cost: number | null;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  branch_id: string;
  supplier_id: string;
  po_number: number;
  status: PurchaseOrderStatus;
  total_amount: number;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
  inventory_item?: InventoryItem;
}

export interface FixedAsset {
  id: string;
  branch_id: string;
  name: string;
  category: string;
  description: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  supplier_id: string | null;
  serial_number: string | null;
  status: AssetStatus;
  condition: AssetCondition | null;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  branch_id: string;
  category_id: string | null;
  amount: number;
  description: string;
  expense_date: string;
  payment_method: PaymentMethod;
  supplier_id: string | null;
  receipt_url: string | null;
  status: ExpenseStatus;
  entered_by: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory;
}

export interface AttendanceLog {
  id: string;
  branch_id: string;
  user_id: string;
  check_in: string;
  check_out: string | null;
  total_hours: number | null;
  notes: string | null;
  is_manual_edit: boolean;
  edited_by: string | null;
  edit_reason: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface ReconciliationSession {
  id: string;
  branch_id: string;
  session_date: string;
  expected_cash: number;
  actual_cash: number;
  discrepancy: number;
  total_card: number;
  total_mpesa: number;
  total_other: number;
  total_sales: number;
  total_expenses: number;
  status: ReconciliationStatus;
  notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  branch_id: string | null;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  profile?: Profile;
}

// ============================================
// Auth / Session Types
// ============================================

export interface UserWithRoles extends Profile {
  roles: UserRole[];
}

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  branch_id: string | null;
  roles: AppRole[];
  avatar_url: string | null;
}
