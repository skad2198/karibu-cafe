'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui/core';
import { LoadingState, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import { useLang } from '@/lib/i18n/context';
import {
  Banknote, CreditCard, Smartphone, Check, Receipt, ShoppingBag,
  ChefHat, Plus, Minus, X, Lock, Coffee, Printer, Sparkles,
} from 'lucide-react';
import { cn, formatCDF, formatUSD, formatDate } from '@/lib/utils';
import type { Order, OrderItem, MenuItem, MenuCategory, MenuItemModifier, RestaurantTable } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const TVA_RATE = 0.16;
const DEFAULT_EXCHANGE_RATE = 2300;
const LS_EXCHANGE_KEY = 'kc_exchange_rate';

type PayMethod = 'cash' | 'card' | 'mpesa';

interface BilledOrder extends Order {
  items: (OrderItem & { order_item_modifiers?: { id: string; name: string }[] })[];
  table?: { table_number: string };
}

interface CartItem {
  tempId: string;
  menuItem: MenuItem;
  quantity: number;
  modifiers: MenuItemModifier[];
  notes: string;
  unitPriceUSD: number;
}

interface OrderPayState {
  method: PayMethod;
  cdfReceived: string;
  usdReceived: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safe date formatter for invoice — no locale dependency */
function invoiceDate(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** CDF string for use inside HTML strings */
function cdfStr(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')} FC`;
}

function printInvoice({
  orderNumber, tableLabel, cashierName, items, exchangeRate, method, amountReceivedCDF, changeDueCDF,
}: {
  orderNumber: number | string;
  tableLabel: string;
  cashierName: string;
  items: { name: string; quantity: number; unitPriceUSD: number; modifiers?: string[] }[];
  exchangeRate: number;
  method: string;
  amountReceivedCDF?: number;
  changeDueCDF?: number;
}) {
  const subtotalHT = items.reduce((s, i) => s + i.unitPriceUSD * i.quantity * exchangeRate, 0);
  const tvaAmount = Math.round(subtotalHT * TVA_RATE);
  const totalTTC = subtotalHT + tvaAmount;
  const totalUSD = totalTTC / exchangeRate;

  const itemRows = items.map(i => {
    const unitCDF = Math.round(i.unitPriceUSD * exchangeRate);
    const totalLineCDF = unitCDF * i.quantity;
    return `<tr>
      <td style="padding:3pt 4pt;vertical-align:top">
        ${i.name}${i.modifiers?.length ? `<br/><small style="color:#666">${i.modifiers.join(', ')}</small>` : ''}
      </td>
      <td style="padding:3pt 4pt;text-align:center">${i.quantity}</td>
      <td style="padding:3pt 4pt;text-align:right">${cdfStr(unitCDF)}</td>
      <td style="padding:3pt 4pt;text-align:right">${cdfStr(totalLineCDF)}</td>
    </tr>`;
  }).join('');

  const changeMaxUSD = changeDueCDF && changeDueCDF > 0 ? Math.floor(changeDueCDF / exchangeRate) : 0;
  const changeRemCDF = changeDueCDF && changeDueCDF > 0 ? Math.round(changeDueCDF - changeMaxUSD * exchangeRate) : 0;

  const win = window.open('', '_blank', 'width=620,height=900');
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Facture #${orderNumber}</title>
  <style>
    @page { size: A5; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
    .header { text-align: center; padding-bottom: 10pt; border-bottom: 2px solid #111; margin-bottom: 8pt; }
    .header h1 { font-size: 20pt; font-weight: 900; letter-spacing: 1px; }
    .header .addr { font-size: 8pt; color: #555; margin-top: 3pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3pt; font-size: 9pt; margin-bottom: 10pt; }
    .info-grid span { display: block; }
    .label { color: #777; font-size: 8pt; }
    .dashed { border: none; border-top: 1px dashed #aaa; margin: 8pt 0; }
    table.items { width: 100%; border-collapse: collapse; }
    table.items th { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; padding: 3pt 4pt; border-bottom: 1px solid #333; text-align: left; }
    table.items th.r { text-align: right; }
    table.items th.c { text-align: center; }
    table.items td { font-size: 9pt; }
    .totals { margin-top: 8pt; }
    .t-row { display: flex; justify-content: space-between; align-items: baseline; padding: 2pt 0; font-size: 9pt; }
    .t-row.tva { color: #555; }
    .t-row.grand { font-size: 14pt; font-weight: bold; border-top: 2px solid #111; padding-top: 6pt; margin-top: 4pt; }
    .usd-ref { text-align: right; font-size: 8pt; color: #888; margin-top: 4pt; }
    .payment-box { margin-top: 10pt; padding: 6pt; background: #f5f5f5; border-radius: 4pt; }
    .p-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 1.5pt 0; }
    .p-row.change { font-weight: bold; }
    .change-opts { font-size: 8pt; color: #555; margin-top: 3pt; padding-left: 4pt; }
    .sigs { display: flex; justify-content: space-between; margin-top: 28pt; }
    .sig { width: 45%; text-align: center; }
    .sig-line { border-top: 1px solid #333; padding-top: 4pt; font-size: 8pt; color: #555; margin-top: 24pt; }
    .footer { text-align: center; font-size: 8pt; color: #888; margin-top: 16pt; padding-top: 8pt; border-top: 1px dashed #ccc; }
    @media print { html, body { margin: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>KARIBU CAFÉ</h1>
    <div class="addr">Likasi, République Démocratique du Congo</div>
    <div class="addr">Tél: — &nbsp;|&nbsp; RCCM: — &nbsp;|&nbsp; NIF: —</div>
  </div>

  <div class="info-grid">
    <div>
      <span class="label">Facture / Invoice No.</span>
      <span><strong>#${orderNumber}</strong></span>
    </div>
    <div style="text-align:right">
      <span class="label">Date &amp; Heure</span>
      <span>${invoiceDate()}</span>
    </div>
    <div>
      <span class="label">Table / Client</span>
      <span>${tableLabel}</span>
    </div>
    <div style="text-align:right">
      <span class="label">Caissier / Cashier</span>
      <span>${cashierName}</span>
    </div>
  </div>

  <hr class="dashed">

  <table class="items">
    <thead>
      <tr>
        <th>Désignation</th>
        <th class="c">Qté</th>
        <th class="r">P.U. HT</th>
        <th class="r">Total HT</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="dashed">

  <div class="totals">
    <div class="t-row"><span>Sous-total HT</span><span>${cdfStr(subtotalHT)}</span></div>
    <div class="t-row tva"><span>TVA 16%</span><span>${cdfStr(tvaAmount)}</span></div>
    <div class="t-row grand"><span>TOTAL TTC</span><span>${cdfStr(totalTTC)}</span></div>
    <div class="usd-ref">≈ ${formatUSD(totalUSD)} &nbsp;@ ${cdfStr(exchangeRate).replace(' FC', '')} FC / $1 USD</div>
  </div>

  <div class="payment-box">
    <div class="p-row"><span>Mode de paiement</span><span>${method.toUpperCase()}</span></div>
    ${amountReceivedCDF != null ? `<div class="p-row"><span>Reçu / Received</span><span>${cdfStr(amountReceivedCDF)}</span></div>` : ''}
    ${changeDueCDF != null && changeDueCDF > 0 ? `
    <div class="p-row change"><span>Rendu / Change</span><span>${cdfStr(changeDueCDF)}</span></div>
    <div class="change-opts">
      Option 1: ${cdfStr(changeDueCDF)} en espèces<br>
      Option 2: ${changeMaxUSD} USD + ${cdfStr(changeRemCDF)}
    </div>` : ''}
  </div>

  <div class="sigs">
    <div class="sig"><div class="sig-line">Caissier / Cashier</div></div>
    <div class="sig"><div class="sig-line">Client / Customer</div></div>
  </div>

  <div class="footer">
    <p>Merci pour votre visite! &nbsp;·&nbsp; Thank you! &nbsp;·&nbsp; Asante kwa ujio wako!</p>
    <p style="margin-top:3pt">Ce document est une preuve de paiement valide / This is a valid proof of payment</p>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CashierPage() {
  const supabase = useSupabase();
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const { t } = useLang();

  const [tab, setTab] = useState<'bills' | 'takeaway' | 'reconciliation'>('bills');
  const [loading, setLoading] = useState(true);

  // Exchange rate — persisted in localStorage
  const [exchangeRate, setExchangeRateState] = useState<number>(DEFAULT_EXCHANGE_RATE);
  useEffect(() => {
    const stored = parseFloat(localStorage.getItem(LS_EXCHANGE_KEY) || '');
    if (stored > 0) setExchangeRateState(stored);
  }, []);
  const setExchangeRate = (v: number) => {
    setExchangeRateState(v);
    localStorage.setItem(LS_EXCHANGE_KEY, v.toString());
  };

  // ── Bills queue ────────────────────────────────────────────────────────────
  const [billedOrders, setBilledOrders] = useState<BilledOrder[]>([]);
  const [cleaningTables, setCleaningTables] = useState<RestaurantTable[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [payStates, setPayStates] = useState<Record<string, OrderPayState>>({});

  const setPayState = (orderId: string, patch: Partial<OrderPayState>) =>
    setPayStates(prev => ({ ...prev, [orderId]: { method: 'cash', cdfReceived: '', usdReceived: '', ...prev[orderId], ...patch } }));

  // ── Takeaway ───────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [modifiers, setModifiers] = useState<MenuItemModifier[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [customerName, setCustomerName] = useState('');
  const [takeawayMethod, setTakeawayMethod] = useState<PayMethod>('cash');
  const [submittingTakeaway, setSubmittingTakeaway] = useState(false);

  // ── Reconciliation ─────────────────────────────────────────────────────────
  const [expectedCash, setExpectedCash] = useState(0);
  const [totalCard, setTotalCard] = useState(0);
  const [totalMpesa, setTotalMpesa] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [actualCash, setActualCash] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [savingReconciliation, setSavingReconciliation] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadBilledOrders = useCallback(async () => {
    if (!user?.branch_id) return;
    const { data, error } = await supabase
      .from('orders')
      .select('*, table:restaurant_tables(table_number), items:order_items(*, order_item_modifiers(*))')
      .eq('branch_id', user.branch_id)
      .eq('status', 'billed')
      .order('updated_at', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load orders', description: error.message, variant: 'error' });
      return;
    }
    setBilledOrders((data || []).map((o: any) => ({
      ...o,
      table: Array.isArray(o.table) ? o.table[0] : o.table,
      items: (o.items || []).map((i: any) => ({ ...i, order_item_modifiers: i.order_item_modifiers || [] })),
    })));
  }, [supabase, user]);

  const loadCleaningTables = useCallback(async () => {
    if (!user?.branch_id) return;
    const { data } = await supabase.from('restaurant_tables')
      .select('*').eq('branch_id', user.branch_id).eq('status', 'cleaning').order('sort_order');
    setCleaningTables(data || []);
  }, [supabase, user]);

  const markTableAvailable = async (tableId: string, tableNumber: string) => {
    const { error } = await supabase.from('restaurant_tables')
      .update({ status: 'available' }).eq('id', tableId);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'error' });
    } else {
      toast({ title: `${t.cashier.tableMarkedAvailable} — ${tableNumber}`, variant: 'success' });
      loadCleaningTables();
    }
  };

  const loadMenuData = useCallback(async () => {
    if (!user?.branch_id) return;
    const [cRes, mRes, modRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('branch_id', user.branch_id).eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('*').eq('branch_id', user.branch_id).eq('is_active', true).eq('is_available', true).order('sort_order'),
      supabase.from('menu_item_modifiers').select('*').eq('branch_id', user.branch_id).eq('is_active', true).order('sort_order'),
    ]);
    setCategories(cRes.data || []);
    setMenuItems(mRes.data || []);
    setModifiers(modRes.data || []);
  }, [supabase, user]);

  const loadReconciliation = useCallback(async () => {
    if (!user?.branch_id) return;
    const [pRes, eRes, sRes] = await Promise.all([
      supabase.from('payments').select('amount, method').eq('branch_id', user.branch_id).gte('created_at', today + 'T00:00:00').eq('status', 'paid'),
      supabase.from('expenses').select('amount').eq('branch_id', user.branch_id).gte('created_at', today + 'T00:00:00'),
      supabase.from('reconciliation_sessions').select('*').eq('branch_id', user.branch_id).order('session_date', { ascending: false }).limit(10),
    ]);
    const payments = pRes.data || [];
    setExpectedCash(payments.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0));
    setTotalCard(payments.filter(p => p.method === 'card').reduce((s, p) => s + Number(p.amount), 0));
    setTotalMpesa(payments.filter(p => p.method === 'mpesa').reduce((s, p) => s + Number(p.amount), 0));
    setTotalSales(payments.reduce((s, p) => s + Number(p.amount), 0));
    setTotalExpenses((eRes.data || []).reduce((s, e) => s + Number(e.amount), 0));
    setSessions(sRes.data || []);
  }, [supabase, user, today]);

  useEffect(() => {
    if (!user?.branch_id) return;
    Promise.all([loadBilledOrders(), loadCleaningTables(), loadMenuData(), loadReconciliation()]).then(() => setLoading(false));
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user?.branch_id) return;
    const channel = supabase.channel('cashier-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${user.branch_id}` }, loadBilledOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `branch_id=eq.${user.branch_id}` }, loadCleaningTables)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user, loadBilledOrders, loadCleaningTables]);

  // ── Bill math ──────────────────────────────────────────────────────────────
  const getBillAmounts = (order: BilledOrder) => {
    const subtotalUSD = order.items.reduce((s, i) => s + Number(i.total_price || 0), 0);
    const subtotalHT = Math.round(subtotalUSD * exchangeRate);
    const tvaAmount = Math.round(subtotalHT * TVA_RATE);
    const totalTTC = subtotalHT + tvaAmount;
    const totalUSD = totalTTC / exchangeRate;
    return { subtotalHT, tvaAmount, totalTTC, totalUSD };
  };

  // ── Collect payment ────────────────────────────────────────────────────────
  const collectPayment = async (order: BilledOrder) => {
    if (!user) return;
    const state = payStates[order.id] || { method: 'cash', cdfReceived: '', usdReceived: '' };
    const { totalTTC } = getBillAmounts(order);
    const method = state.method;

    // For cash: validate received amount
    if (method === 'cash') {
      const received = (parseFloat(state.cdfReceived) || 0) + (parseFloat(state.usdReceived) || 0) * exchangeRate;
      if (received < totalTTC) {
        toast({ title: t.cashier.insufficientPayment, variant: 'error' });
        return;
      }
    }

    setProcessing(order.id);
    try {
      // 1. Record payment (amount in CDF)
      const { error: payErr } = await supabase.from('payments').insert({
        order_id: order.id,
        branch_id: user.branch_id,
        amount: totalTTC,
        method,
        status: 'paid',
        received_by: user.id,
      });
      if (payErr) throw payErr;

      // 2. Mark order paid
      const { error: orderErr } = await supabase.from('orders')
        .update({ status: 'paid', payment_status: 'paid', completed_at: new Date().toISOString(), updated_by: user.id })
        .eq('id', order.id);
      if (orderErr) throw orderErr;

      // 3. Log status change
      await supabase.from('order_status_history').insert({
        order_id: order.id, from_status: 'billed', to_status: 'paid', changed_by: user.id,
      });

      // 4. Free table
      if (order.table_id) {
        await supabase.from('restaurant_tables').update({ status: 'cleaning' }).eq('id', order.table_id);
      }

      // 5. Print invoice
      const state2 = payStates[order.id];
      const receivedCDF = (parseFloat(state2?.cdfReceived) || 0) + (parseFloat(state2?.usdReceived) || 0) * exchangeRate;
      const { totalTTC: ttc } = getBillAmounts(order);
      const changeDueCDF = method === 'cash' ? Math.round(receivedCDF - ttc) : undefined;

      printInvoice({
        orderNumber: order.order_number,
        tableLabel: order.table?.table_number ?? t.cashier.takeawayLabel,
        cashierName: user.full_name,
        items: order.items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unitPriceUSD: Number(i.unit_price),
          modifiers: (i.order_item_modifiers || []).map((m: any) => m.name),
        })),
        exchangeRate,
        method,
        amountReceivedCDF: method === 'cash' ? Math.round(receivedCDF) : undefined,
        changeDueCDF,
      });

      toast({ title: `Order #${order.order_number} — ${formatCDF(ttc)} collected`, variant: 'success' });
      loadReconciliation();
      loadCleaningTables();
    } catch (err: any) {
      toast({ title: t.cashier.paymentFailed, description: err.message, variant: 'error' });
    } finally {
      setProcessing(null);
    }
  };

  // ── Takeaway cart ──────────────────────────────────────────────────────────
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id && c.modifiers.length === 0);
      if (existing) return prev.map(c => c.tempId === existing.tempId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { tempId: Math.random().toString(36).slice(2), menuItem: item, quantity: 1, modifiers: [], notes: '', unitPriceUSD: Number(item.base_price) }];
    });
  };

  const updateQty = (tempId: string, delta: number) =>
    setCart(prev => prev.map(c => c.tempId !== tempId ? c : c.quantity + delta <= 0 ? c : { ...c, quantity: c.quantity + delta }));

  const removeFromCart = (tempId: string) => setCart(prev => prev.filter(c => c.tempId !== tempId));

  const cartSubtotalUSD = cart.reduce((s, c) => s + c.unitPriceUSD * c.quantity, 0);
  const cartSubtotalHT = Math.round(cartSubtotalUSD * exchangeRate);
  const cartTVA = Math.round(cartSubtotalHT * TVA_RATE);
  const cartTotalTTC = cartSubtotalHT + cartTVA;

  const submitTakeaway = async () => {
    if (!user || cart.length === 0) return;
    setSubmittingTakeaway(true);
    try {
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        branch_id: user.branch_id, order_type: 'takeaway', status: 'submitted',
        payment_status: 'paid', notes: customerName || null,
        created_by: user.id, updated_by: user.id,
        submitted_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).select().single();
      if (orderErr) throw orderErr;

      for (const c of cart) {
        const { data: orderItem, error: itemErr } = await supabase.from('order_items').insert({
          order_id: newOrder.id, menu_item_id: c.menuItem.id, name: c.menuItem.name,
          quantity: c.quantity, unit_price: c.unitPriceUSD,
          total_price: c.unitPriceUSD * c.quantity,
          tax_rate: TVA_RATE, tax_amount: c.unitPriceUSD * c.quantity * TVA_RATE,
          status: 'new', notes: c.notes || null, created_by: user.id,
        }).select().single();
        if (itemErr) throw itemErr;

        if (c.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            c.modifiers.map(m => ({ order_item_id: orderItem.id, modifier_id: m.id, name: m.name, price_adjustment: m.price_adjustment }))
          );
        }
      }

      const { error: payErr } = await supabase.from('payments').insert({
        order_id: newOrder.id, branch_id: user.branch_id,
        amount: cartTotalTTC, method: takeawayMethod, status: 'paid', received_by: user.id,
      });
      if (payErr) throw payErr;

      await supabase.from('order_status_history').insert({ order_id: newOrder.id, to_status: 'submitted', changed_by: user.id });

      printInvoice({
        orderNumber: newOrder.order_number,
        tableLabel: customerName || t.cashier.takeawayLabel,
        cashierName: user.full_name,
        items: cart.map(c => ({ name: c.menuItem.name, quantity: c.quantity, unitPriceUSD: c.unitPriceUSD })),
        exchangeRate, method: takeawayMethod,
      });

      toast({ title: t.cashier.orderCreated, variant: 'success' });
      setCart([]); setCustomerName('');
      loadReconciliation();
    } catch (err: any) {
      toast({ title: t.cashier.paymentFailed, description: err.message, variant: 'error' });
    } finally {
      setSubmittingTakeaway(false);
    }
  };

  // ── Reconciliation ─────────────────────────────────────────────────────────
  const closeSession = async () => {
    if (!user?.branch_id) return;
    setSavingReconciliation(true);
    const actual = parseFloat(actualCash) || 0;
    const { error } = await supabase.from('reconciliation_sessions').insert({
      branch_id: user.branch_id, session_date: today, expected_cash: expectedCash,
      actual_cash: actual, discrepancy: actual - expectedCash,
      total_card: totalCard, total_mpesa: totalMpesa,
      total_sales: totalSales, total_expenses: totalExpenses,
      status: 'closed', notes: reconcileNotes || null,
      closed_by: user.id, closed_at: new Date().toISOString(), created_by: user.id,
    });
    if (error) {
      toast({ title: 'Failed to close session', description: error.message, variant: 'error' });
    } else {
      toast({ title: t.cashier.reconciliationClosed, variant: 'success' });
      setActualCash(''); setReconcileNotes('');
      loadReconciliation();
    }
    setSavingReconciliation(false);
  };

  if (userLoading || loading) return <LoadingState />;

  const methodOptions: { value: PayMethod; label: string; icon: React.ReactNode }[] = [
    { value: 'cash', label: t.cashier.cash, icon: <Banknote className="h-4 w-4" /> },
    { value: 'card', label: t.cashier.card, icon: <CreditCard className="h-4 w-4" /> },
    { value: 'mpesa', label: t.cashier.mpesa, icon: <Smartphone className="h-4 w-4" /> },
  ];

  const filteredItems = selectedCat === 'all' ? menuItems : menuItems.filter(i => i.category_id === selectedCat);
  const discrepancy = (parseFloat(actualCash) || 0) - expectedCash;

  const tabs = [
    { key: 'bills', label: t.cashier.billsTab, icon: <Receipt className="h-4 w-4" /> },
    { key: 'takeaway', label: t.cashier.takeawayTab, icon: <ShoppingBag className="h-4 w-4" /> },
    { key: 'reconciliation', label: t.cashier.reconciliationTab, icon: <Lock className="h-4 w-4" /> },
  ] as const;

  return (
    <div>
      <PageHeader title={t.cashier.title} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b mb-6 -mt-2">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tb.icon} {tb.label}
          </button>
        ))}
      </div>

      {/* ── Bills Queue ────────────────────────────────────────────────────── */}
      {tab === 'bills' && (
        <>
          {/* Exchange rate bar */}
          <div className="flex items-center gap-3 mb-5 p-3 bg-muted/50 rounded-lg border text-sm flex-wrap">
            <span className="font-medium text-muted-foreground">{t.cashier.exchangeRate}:</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={exchangeRate}
                onChange={e => setExchangeRate(Math.max(1, parseFloat(e.target.value) || DEFAULT_EXCHANGE_RATE))}
                className="w-28 h-8 text-sm"
                min={1}
              />
              <span className="text-muted-foreground">{t.cashier.perUSD}</span>
            </div>
          </div>

          {billedOrders.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8 text-muted-foreground" />}
              title={t.cashier.noBills}
              description={t.cashier.noBillsDesc}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {billedOrders.map(order => {
                const { subtotalHT, tvaAmount, totalTTC, totalUSD } = getBillAmounts(order);
                const state = payStates[order.id] || { method: 'cash', cdfReceived: '', usdReceived: '' };
                const method = state.method;
                const isPaying = processing === order.id;

                // Change calculator
                const receivedCDF = parseFloat(state.cdfReceived) || 0;
                const receivedUSD = parseFloat(state.usdReceived) || 0;
                const totalReceivedCDF = Math.round(receivedCDF + receivedUSD * exchangeRate);
                const changeDueCDF = totalReceivedCDF > 0 ? Math.round(totalReceivedCDF - totalTTC) : null;
                const changeMaxUSD = changeDueCDF && changeDueCDF > 0 ? Math.floor(changeDueCDF / exchangeRate) : 0;
                const changeRemCDF = changeDueCDF && changeDueCDF > 0 ? Math.round(changeDueCDF - changeMaxUSD * exchangeRate) : 0;
                const canCollect = method !== 'cash' || totalReceivedCDF >= totalTTC;

                return (
                  <Card key={order.id} className="border-warning/50">
                    {/* Header */}
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl">
                          {order.table?.table_number ?? t.cashier.takeawayLabel}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground font-mono">#{order.order_number}</span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Items */}
                      <div className="space-y-1 text-sm">
                        {order.items.map(item => (
                          <div key={item.id} className="flex justify-between gap-2">
                            <span className="text-muted-foreground">
                              {item.quantity}× {item.name}
                              {item.order_item_modifiers && item.order_item_modifiers.length > 0 && (
                                <span className="text-xs opacity-60 ml-1">
                                  ({item.order_item_modifiers.map((m: any) => m.name).join(', ')})
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-xs">
                              {formatCDF(Number(item.total_price) * exchangeRate)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Totals — CDF primary */}
                      <div className="rounded-md bg-muted/40 p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t.cashier.subtotalHT}</span>
                          <span className="font-mono">{formatCDF(subtotalHT)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t.cashier.tva}</span>
                          <span className="font-mono">{formatCDF(tvaAmount)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-base border-t pt-1.5 mt-1">
                          <span>{t.cashier.totalTTC}</span>
                          <span className="font-mono text-lg">{formatCDF(totalTTC)}</span>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {t.cashier.approxUSD} {formatUSD(totalUSD)} @ {exchangeRate.toLocaleString()} FC
                        </div>
                      </div>

                      {/* Payment method */}
                      <div className="flex gap-2">
                        {methodOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setPayState(order.id, { method: opt.value })}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-colors',
                              method === opt.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                            )}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Cash: amount received + change */}
                      {method === 'cash' && (
                        <div className="space-y-3 rounded-md border p-3 bg-card">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">{t.cashier.receivedCDF}</Label>
                              <Input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={state.cdfReceived}
                                onChange={e => setPayState(order.id, { cdfReceived: e.target.value })}
                                className="mt-1 font-mono"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{t.cashier.receivedUSD}</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={state.usdReceived}
                                onChange={e => setPayState(order.id, { usdReceived: e.target.value })}
                                className="mt-1 font-mono"
                              />
                            </div>
                          </div>

                          {/* Change display */}
                          {changeDueCDF !== null && (
                            <div className={cn(
                              'rounded-md p-2.5 text-sm space-y-1',
                              changeDueCDF < 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10'
                            )}>
                              <div className="flex justify-between font-bold">
                                <span>{t.cashier.changeDue}</span>
                                <span className="font-mono">{changeDueCDF < 0 ? '—' : formatCDF(changeDueCDF)}</span>
                              </div>
                              {changeDueCDF > 0 && (
                                <>
                                  <div className="text-xs text-muted-foreground pt-1 border-t border-success/20">
                                    Option 1: {formatCDF(changeDueCDF)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {t.cashier.changeMaxUSD}: {changeMaxUSD} USD + {formatCDF(changeRemCDF)}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const { subtotalHT: sHT, tvaAmount: tv, totalTTC: ttc } = getBillAmounts(order);
                            const s = payStates[order.id];
                            const recCDF = (parseFloat(s?.cdfReceived) || 0) + (parseFloat(s?.usdReceived) || 0) * exchangeRate;
                            printInvoice({
                              orderNumber: order.order_number,
                              tableLabel: order.table?.table_number ?? t.cashier.takeawayLabel,
                              cashierName: user?.full_name || '',
                              items: order.items.map(i => ({
                                name: i.name, quantity: i.quantity,
                                unitPriceUSD: Number(i.unit_price),
                                modifiers: (i.order_item_modifiers || []).map((m: any) => m.name),
                              })),
                              exchangeRate,
                              method: s?.method || 'cash',
                              amountReceivedCDF: recCDF > 0 ? Math.round(recCDF) : undefined,
                              changeDueCDF: recCDF > ttc ? Math.round(recCDF - ttc) : undefined,
                            });
                          }}
                        >
                          <Printer className="h-4 w-4 mr-1.5" />
                          {t.cashier.printInvoice}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => collectPayment(order)}
                          disabled={isPaying || !canCollect}
                          className={cn(!canCollect && 'opacity-50')}
                        >
                          <Check className="h-4 w-4 mr-1.5" />
                          {isPaying ? t.cashier.processing : t.cashier.collect}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── Cleaning Tables ──────────────────────────────────────────── */}
          {cleaningTables.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t.cashier.cleaningTables}
                </h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {cleaningTables.map(table => (
                  <div key={table.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
                    <div>
                      <p className="font-bold text-lg leading-none">{table.table_number}</p>
                      {table.capacity && (
                        <p className="text-xs text-muted-foreground mt-0.5">{table.capacity} seats</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-success text-success hover:bg-success hover:text-success-foreground"
                      onClick={() => markTableAvailable(table.id, table.table_number)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      {t.cashier.markAvailable}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Takeaway tab ────────────────────────────────────────────────────── */}
      {tab === 'takeaway' && (
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-12rem)]">
          {/* Menu panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-3">
              <Input
                placeholder={t.cashier.customerNamePlaceholder}
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">
              <Button variant={selectedCat === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCat('all')} className="shrink-0">
                {t.common.all}
              </Button>
              {categories.map(cat => (
                <Button key={cat.id} variant={selectedCat === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCat(cat.id)} className="shrink-0">
                  {cat.name}
                </Button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="rounded-lg border bg-card p-4 text-left hover:border-primary/50 hover:shadow-sm transition-all active:scale-[0.98] touch-target"
                  >
                    <p className="font-medium text-sm line-clamp-2">{item.name}</p>
                    <p className="text-primary font-bold mt-1">{formatCDF(Number(item.base_price) * exchangeRate)}</p>
                    <p className="text-muted-foreground text-xs">{formatUSD(Number(item.base_price))}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cart panel */}
          <div className="w-full lg:w-80 xl:w-96 border rounded-lg bg-card flex flex-col shrink-0">
            <div className="p-4 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" /> {t.cashier.takeawayLabel}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {cart.length === 0 ? (
                <EmptyState icon={<Coffee className="h-6 w-6 text-muted-foreground" />} title={t.cashier.noItemsInCart} description={t.cashier.noItemsInCartDesc} />
              ) : (
                cart.map(item => (
                  <div key={item.tempId} className="flex items-start gap-2 py-2 border-b">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.menuItem.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => updateQty(item.tempId, -1)} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.tempId, 1)} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                        <button onClick={() => removeFromCart(item.tempId)} className="ml-auto text-destructive hover:text-destructive/80"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="font-mono text-sm">{formatCDF(item.unitPriceUSD * item.quantity * exchangeRate)}</p>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="bg-muted/40 rounded-md p-2.5 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t.cashier.subtotalHT}</span><span className="font-mono">{formatCDF(cartSubtotalHT)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t.cashier.tva}</span><span className="font-mono">{formatCDF(cartTVA)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1.5 mt-1">
                    <span>{t.cashier.totalTTC}</span><span className="font-mono">{formatCDF(cartTotalTTC)}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {t.cashier.approxUSD} {formatUSD(cartTotalTTC / exchangeRate)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {methodOptions.map(opt => (
                    <button key={opt.value} onClick={() => setTakeawayMethod(opt.value)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1 rounded-md border py-2 text-xs font-medium transition-colors',
                        takeawayMethod === opt.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                      )}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
                <Button onClick={submitTakeaway} className="w-full" size="touch" disabled={submittingTakeaway}>
                  <ChefHat className="h-4 w-4 mr-2" />
                  {submittingTakeaway ? t.cashier.processing : t.cashier.payAndSend}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reconciliation tab ───────────────────────────────────────────────── */}
      {tab === 'reconciliation' && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title={t.cashier.expectedCash} value={formatCDF(expectedCash)} />
            <StatCard title={t.cashier.cardTotal} value={formatCDF(totalCard)} />
            <StatCard title={t.cashier.mpesaTotal} value={formatCDF(totalMpesa)} />
            <StatCard title={t.cashier.totalSales} value={formatCDF(totalSales)} />
          </div>

          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">{t.cashier.closeRegister}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t.cashier.actualCash}</Label>
                  <Input type="number" step="1" value={actualCash} onChange={e => setActualCash(e.target.value)} className="mt-1 text-lg font-mono" placeholder="0" />
                  <p className="text-xs text-muted-foreground mt-1">FC</p>
                </div>
                <div>
                  <Label>{t.cashier.discrepancy}</Label>
                  <div className={cn('mt-1 text-2xl font-bold font-mono', discrepancy === 0 ? 'text-success' : discrepancy > 0 ? 'text-info' : 'text-destructive')}>
                    {actualCash ? formatCDF(discrepancy) : '—'}
                  </div>
                  {discrepancy !== 0 && actualCash && (
                    <p className="text-xs text-muted-foreground">{discrepancy > 0 ? t.cashier.over : t.cashier.short}</p>
                  )}
                </div>
              </div>
              <div>
                <Label>{t.common.notes}</Label>
                <Textarea value={reconcileNotes} onChange={e => setReconcileNotes(e.target.value)} className="mt-1" rows={2} />
              </div>
              <Button onClick={closeSession} disabled={savingReconciliation || !actualCash} size="touch">
                <Lock className="h-4 w-4 mr-2" />
                {savingReconciliation ? t.cashier.closing : t.cashier.closeRegister}
              </Button>
            </CardContent>
          </Card>

          {sessions.length > 0 && (
            <>
              <h3 className="font-semibold mb-3">{t.cashier.recentSessions}</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3">{t.common.date}</th>
                      <th className="text-right p-3">{t.cashier.expectedCash}</th>
                      <th className="text-right p-3">{t.cashier.actualCash}</th>
                      <th className="text-right p-3">{t.cashier.discrepancy}</th>
                      <th className="text-center p-3">{t.common.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sessions.map(s => (
                      <tr key={s.id}>
                        <td className="p-3">{formatDate(s.session_date)}</td>
                        <td className="p-3 text-right font-mono">{formatCDF(Number(s.expected_cash))}</td>
                        <td className="p-3 text-right font-mono">{formatCDF(Number(s.actual_cash))}</td>
                        <td className={cn('p-3 text-right font-mono font-medium', Number(s.discrepancy) === 0 ? 'text-success' : 'text-destructive')}>
                          {formatCDF(Number(s.discrepancy))}
                        </td>
                        <td className="p-3 text-center"><StatusBadge status={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
