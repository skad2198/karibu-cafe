import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a Congolese Franc amount: "15 000 FC" — no locale dependency */
export function formatCDF(amount: number): string {
  const rounded = Math.round(amount);
  const str = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${str} FC`;
}

/** Format a USD amount: "$15.00" */
export function formatUSD(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-KE', options || {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function elapsedMinutes(fromDate: string | Date): number {
  const from = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
  return Math.floor((Date.now() - from.getTime()) / 60000);
}

export function elapsedTimeString(fromDate: string | Date): string {
  const mins = elapsedMinutes(fromDate);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hrs}h ${remaining}m`;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Table states
    available: 'bg-success/15 text-success border-success/30',
    occupied: 'bg-info/15 text-info border-info/30',
    billing: 'bg-warning/15 text-warning border-warning/30',
    cleaning: 'bg-muted text-muted-foreground border-border',
    inactive: 'bg-muted text-muted-foreground border-border',
    // Order states
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-info/15 text-info',
    accepted_by_kitchen: 'bg-info/15 text-info',
    preparing: 'bg-warning/15 text-warning',
    ready: 'bg-success/15 text-success',
    served: 'bg-success/15 text-success',
    billed: 'bg-primary/15 text-primary',
    paid: 'bg-success/15 text-success',
    closed: 'bg-muted text-muted-foreground',
    cancelled: 'bg-destructive/15 text-destructive',
    voided: 'bg-destructive/15 text-destructive',
    // Payment
    unpaid: 'bg-warning/15 text-warning',
    partially_paid: 'bg-warning/15 text-warning',
    refunded: 'bg-destructive/15 text-destructive',
    // Item states
    new: 'bg-info/15 text-info',
    // Inventory
    low_stock: 'bg-destructive/15 text-destructive',
    in_stock: 'bg-success/15 text-success',
    // Reconciliation
    open: 'bg-warning/15 text-warning',
    matched: 'bg-success/15 text-success',
    discrepancy: 'bg-destructive/15 text-destructive',
    // General
    active: 'bg-success/15 text-success',
    approved: 'bg-success/15 text-success',
    pending: 'bg-warning/15 text-warning',
    rejected: 'bg-destructive/15 text-destructive',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}

export function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
