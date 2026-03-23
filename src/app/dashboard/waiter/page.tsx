'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog-tabs';
import { StatusBadge, EmptyState, LoadingState, PageHeader } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import { useLang } from '@/lib/i18n/context';
import { Plus, Minus, Send, X, ShoppingCart, Coffee, CreditCard, ShoppingBag, Bell, Flame, Check, Sparkles } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { RestaurantTable, MenuItem, MenuCategory, MenuItemModifier, Order, OrderItem } from '@/types';

interface CartItem {
  tempId: string;
  menuItem: MenuItem;
  quantity: number;
  modifiers: MenuItemModifier[];
  notes: string;
  unitPrice: number;
}

type OrderMode = 'dine_in' | 'takeaway';

export default function WaiterPOSPage() {
  const supabase = useSupabase();
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const { t } = useLang();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [modifiers, setModifiers] = useState<MenuItemModifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(0.16);

  // View state
  const [view, setView] = useState<'floor' | 'menu'>('floor');
  const [orderMode, setOrderMode] = useState<OrderMode>('dine_in');

  // Table / order state
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [existingItems, setExistingItems] = useState<OrderItem[]>([]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showModifierDialog, setShowModifierDialog] = useState(false);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<MenuItemModifier[]>([]);
  const [pendingNotes, setPendingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load data
  useEffect(() => {
    if (!user?.branch_id) return;
    async function load() {
      setLoading(true);
      const [tRes, cRes, mRes, modRes] = await Promise.all([
        supabase.from('restaurant_tables').select('*').eq('branch_id', user!.branch_id).eq('is_active', true).order('sort_order'),
        supabase.from('menu_categories').select('*').eq('branch_id', user!.branch_id).eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('*').eq('branch_id', user!.branch_id).eq('is_active', true).eq('is_available', true).order('sort_order'),
        supabase.from('menu_item_modifiers').select('*').eq('branch_id', user!.branch_id).eq('is_active', true).order('sort_order'),
      ]);
      setTables(tRes.data || []);
      setCategories(cRes.data || []);
      setMenuItems(mRes.data || []);
      setModifiers(modRes.data || []);
      setLoading(false);
    }
    load();
  }, [supabase, user]);

  useEffect(() => {
    if (!user?.branch_id) return;
    supabase.from('tax_settings').select('rate').eq('branch_id', user.branch_id).eq('is_active', true).single()
      .then(({ data }) => { if (data) setTaxRate(Number(data.rate)); });
  }, [supabase, user]);

  // Realtime table updates
  useEffect(() => {
    if (!user?.branch_id) return;
    const channel = supabase.channel('tables-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'restaurant_tables',
        filter: `branch_id=eq.${user.branch_id}`,
      }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setTables(prev => prev.map(tb => tb.id === payload.new.id ? { ...tb, ...payload.new } as RestaurantTable : tb));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user]);

  // Realtime order_items updates for active order
  const refreshExistingItems = useCallback(async (orderId: string) => {
    const { data: items } = await supabase
      .from('order_items')
      .select('*, order_item_modifiers(*)')
      .eq('order_id', orderId)
      .order('created_at');
    setExistingItems((items || []).map((i: any) => ({ ...i, modifiers: i.order_item_modifiers })));
  }, [supabase]);

  useEffect(() => {
    if (!activeOrder?.id) return;
    const channel = supabase.channel(`order-items-${activeOrder.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'order_items',
        filter: `order_id=eq.${activeOrder.id}`,
      }, () => {
        refreshExistingItems(activeOrder.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, activeOrder?.id, refreshExistingItems]);

  // Select table
  const selectTable = useCallback(async (table: RestaurantTable) => {
    setSelectedTable(table);
    setCart([]);
    setExistingItems([]);
    setActiveOrder(null);

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('table_id', table.id)
      .not('status', 'in', '("closed","cancelled","voided","paid")')
      .limit(1);

    if (orders && orders.length > 0) {
      setActiveOrder(orders[0]);
      const { data: items } = await supabase
        .from('order_items')
        .select('*, order_item_modifiers(*)')
        .eq('order_id', orders[0].id)
        .order('created_at');
      setExistingItems((items || []).map(i => ({ ...i, modifiers: i.order_item_modifiers })));
    }

    setView('menu');
  }, [supabase]);

  // Start takeaway order (no table)
  const startTakeaway = () => {
    setOrderMode('takeaway');
    setSelectedTable(null);
    setActiveOrder(null);
    setExistingItems([]);
    setCart([]);
    setView('menu');
  };

  const goToFloor = () => {
    setView('floor');
    setOrderMode('dine_in');
    setSelectedTable(null);
    setActiveOrder(null);
    setCart([]);
  };

  // Cart helpers
  const addToCart = (item: MenuItem) => {
    setPendingItem(item);
    setPendingModifiers([]);
    setPendingNotes('');
    setShowModifierDialog(true);
  };

  const confirmAddToCart = () => {
    if (!pendingItem) return;
    const modPriceAdj = pendingModifiers.reduce((s, m) => s + Number(m.price_adjustment), 0);
    const unitPrice = Number(pendingItem.base_price) + modPriceAdj;
    setCart(prev => [...prev, {
      tempId: Math.random().toString(36).slice(2),
      menuItem: pendingItem,
      quantity: 1,
      modifiers: pendingModifiers,
      notes: pendingNotes,
      unitPrice,
    }]);
    setShowModifierDialog(false);
    setPendingItem(null);
  };

  const updateCartQty = (tempId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.tempId !== tempId) return c;
      const newQty = c.quantity + delta;
      return newQty <= 0 ? c : { ...c, quantity: newQty };
    }));
  };

  const removeFromCart = (tempId: string) => setCart(prev => prev.filter(c => c.tempId !== tempId));

  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);

  // Submit order
  const submitOrder = async () => {
    if (!user || cart.length === 0) return;
    if (orderMode === 'dine_in' && !selectedTable) return;
    setSubmitting(true);

    try {
      let orderId = activeOrder?.id;

      if (!orderId) {
        const { data: newOrder, error: orderErr } = await supabase
          .from('orders')
          .insert({
            branch_id: user.branch_id,
            table_id: selectedTable?.id ?? null,
            order_type: orderMode,
            status: 'submitted',
            created_by: user.id,
            updated_by: user.id,
            submitted_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (orderErr) throw orderErr;
        orderId = newOrder.id;

        if (selectedTable) {
          await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', selectedTable.id);
        }
      } else {
        await supabase.from('orders')
          .update({ status: 'submitted', updated_by: user.id, submitted_at: new Date().toISOString() })
          .eq('id', orderId);
      }

      for (const cartItem of cart) {
        const taxAmt = cartItem.menuItem.is_taxable
          ? Number((cartItem.unitPrice * cartItem.quantity * taxRate).toFixed(2)) : 0;
        const { data: orderItem, error: itemErr } = await supabase
          .from('order_items')
          .insert({
            order_id: orderId,
            menu_item_id: cartItem.menuItem.id,
            name: cartItem.menuItem.name,
            quantity: cartItem.quantity,
            unit_price: cartItem.unitPrice,
            total_price: cartItem.unitPrice * cartItem.quantity,
            tax_rate: cartItem.menuItem.is_taxable ? taxRate : 0,
            tax_amount: taxAmt,
            status: 'new',
            notes: cartItem.notes || null,
            created_by: user.id,
          })
          .select()
          .single();
        if (itemErr) throw itemErr;

        if (cartItem.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            cartItem.modifiers.map(m => ({
              order_item_id: orderItem.id,
              modifier_id: m.id,
              name: m.name,
              price_adjustment: m.price_adjustment,
            }))
          );
        }
      }

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        from_status: activeOrder?.status ?? null,
        to_status: 'submitted',
        changed_by: user.id,
      });

      toast({ title: t.waiter.orderSent, variant: 'success' });
      setCart([]);
      goToFloor();
    } catch (err: any) {
      toast({ title: t.waiter.orderFailed, description: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Request bill (dine-in only, and only if not already billed)
  const requestBill = async () => {
    if (!activeOrder || !selectedTable || !user) return;
    if (activeOrder.status === 'billed') return;
    const { error } = await supabase.from('orders')
      .update({ status: 'billed', updated_by: user.id })
      .eq('id', activeOrder.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'error' }); return; }
    await supabase.from('restaurant_tables').update({ status: 'billing' }).eq('id', selectedTable.id);
    await supabase.from('order_status_history').insert({
      order_id: activeOrder.id, from_status: activeOrder.status, to_status: 'billed', changed_by: user.id,
    });
    toast({ title: t.waiter.billRequestedToast, variant: 'info' });
    goToFloor();
  };

  if (userLoading || loading) return <LoadingState />;

  const filteredItems = selectedCategory === 'all'
    ? menuItems
    : menuItems.filter(i => i.category_id === selectedCategory);

  const isBilled = activeOrder?.status === 'billed';

  // ── Floor view ─────────────────────────────────────────────────────────────
  if (view === 'floor') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t.waiter.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t.waiter.description}</p>
          </div>
          <Button onClick={startTakeaway} variant="outline" size="sm" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            {t.waiter.takeaway}
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map(table => {
            const isCleaning = table.status === 'cleaning';
            return (
              <button
                key={table.id}
                onClick={async () => {
                  if (isCleaning) {
                    const { error } = await supabase.from('restaurant_tables')
                      .update({ status: 'available' }).eq('id', table.id);
                    if (!error) toast({ title: `${t.waiter.tableMarkedAvailable} — ${table.table_number}`, variant: 'success' });
                  } else {
                    selectTable(table);
                  }
                }}
                className={cn(
                  'rounded-xl border-2 p-6 text-center transition-all active:scale-95 touch-target',
                  table.status === 'available' && 'border-success/40 bg-success/5 hover:bg-success/10',
                  table.status === 'occupied' && 'border-info/40 bg-info/5 hover:bg-info/10',
                  table.status === 'billing' && 'border-warning/40 bg-warning/5 hover:bg-warning/10',
                  isCleaning && 'border-muted-foreground/30 bg-muted hover:bg-accent',
                )}
              >
                <p className="text-2xl font-bold">{table.table_number}</p>
                <StatusBadge status={table.status} className="mt-2" />
                {isCleaning && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t.waiter.tapToMarkClean}
                  </p>
                )}
                {!isCleaning && table.capacity && (
                  <p className="text-xs text-muted-foreground mt-1">{table.capacity} {t.waiter.seats}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Menu / Order view ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      {/* Menu panel */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Button variant="ghost" size="sm" onClick={goToFloor}>
              {t.waiter.backToTables}
            </Button>
            <h2 className="text-lg font-bold mt-1 flex items-center gap-2">
              {orderMode === 'takeaway'
                ? <><ShoppingBag className="h-5 w-5" /> {t.waiter.takeaway}</>
                : selectedTable?.table_number}
              {activeOrder && <span className="text-sm font-normal text-muted-foreground ml-1">{t.waiter.orderNumber}{activeOrder.order_number}</span>}
            </h2>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
          <Button variant={selectedCategory === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('all')} className="shrink-0">
            {t.common.all}
          </Button>
          {categories.map(cat => (
            <Button key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat.id)} className="shrink-0">
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => !isBilled && addToCart(item)}
                disabled={isBilled}
                className={cn(
                  'rounded-lg border bg-card p-4 text-left transition-all active:scale-[0.98] touch-target',
                  isBilled ? 'opacity-40 cursor-not-allowed' : 'hover:border-primary/50 hover:shadow-sm'
                )}
              >
                <p className="font-medium text-sm line-clamp-2">{item.name}</p>
                <p className="text-primary font-bold mt-1">{formatCurrency(Number(item.base_price))}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart / Order panel */}
      <div className="w-full lg:w-80 xl:w-96 border rounded-lg bg-card flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {t.waiter.orderPanel}
          </h3>
          {/* Ready items banner */}
          {existingItems.filter(i => i.status === 'ready').length > 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-success/15 border border-success/30 px-3 py-2 text-xs text-success font-medium">
              <Bell className="h-3.5 w-3.5 shrink-0" />
              {existingItems.filter(i => i.status === 'ready').length} {t.waiter.itemsReadyBanner}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {/* Existing items */}
          {existingItems.map(item => (
            <div key={item.id} className={cn(
              'flex items-start justify-between py-2 border-b text-sm',
              item.status === 'ready' && 'bg-success/5 -mx-4 px-4',
            )}>
              <div className="flex items-start gap-2 flex-1 min-w-0">
                {/* Kitchen status icon */}
                <div className={cn(
                  'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0',
                  item.status === 'new' && 'bg-info/20 text-info',
                  item.status === 'preparing' && 'bg-warning/20 text-warning',
                  item.status === 'ready' && 'bg-success text-success-foreground',
                  item.status === 'served' && 'bg-muted text-muted-foreground',
                )}>
                  {item.status === 'ready' && <Check className="h-3 w-3" />}
                  {item.status === 'preparing' && <Flame className="h-3 w-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium', item.status === 'served' && 'opacity-50')}>
                    {item.name} x{item.quantity}
                  </p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-xs text-muted-foreground">{item.modifiers.map((m: any) => m.name).join(', ')}</p>
                  )}
                  {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                  <span className={cn(
                    'inline-block text-xs mt-0.5 font-medium capitalize',
                    item.status === 'new' && 'text-info',
                    item.status === 'preparing' && 'text-warning',
                    item.status === 'ready' && 'text-success font-bold',
                    item.status === 'served' && 'text-muted-foreground',
                  )}>
                    {item.status}
                  </span>
                </div>
              </div>
              <p className="font-medium ml-2 shrink-0">{formatCurrency(Number(item.total_price))}</p>
            </div>
          ))}

          {existingItems.length > 0 && cart.length > 0 && (
            <div className="text-xs text-muted-foreground text-center py-1">{t.waiter.newItemsLabel}</div>
          )}

          {/* Cart items */}
          {cart.map(item => (
            <div key={item.tempId} className="flex items-start gap-2 py-2 border-b">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.menuItem.name}</p>
                {item.modifiers.length > 0 && (
                  <p className="text-xs text-muted-foreground">{item.modifiers.map(m => m.name).join(', ')}</p>
                )}
                {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => updateCartQty(item.tempId, -1)} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-accent">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateCartQty(item.tempId, 1)} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-accent">
                    <Plus className="h-3 w-3" />
                  </button>
                  <button onClick={() => removeFromCart(item.tempId)} className="ml-auto text-destructive hover:text-destructive/80">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="font-medium text-sm">{formatCurrency(item.unitPrice * item.quantity)}</p>
            </div>
          ))}

          {cart.length === 0 && existingItems.length === 0 && (
            <EmptyState
              icon={<Coffee className="h-6 w-6 text-muted-foreground" />}
              title={t.waiter.noItems}
              description={isBilled ? t.waiter.billRequested : t.waiter.noItemsDesc}
            />
          )}
        </div>

        {/* Cart footer */}
        <div className="border-t p-4 space-y-3">
          {(cart.length > 0 || existingItems.length > 0) && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{cart.length > 0 ? t.waiter.newItemsTotal : t.common.total}</span>
              <span className="font-bold">{formatCurrency(cart.length > 0 ? cartTotal : existingItems.reduce((s, i) => s + Number(i.total_price), 0))}</span>
            </div>
          )}
          {activeOrder && cart.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.waiter.existingTotal}</span>
              <span className="font-medium">{formatCurrency(Number(activeOrder.total))}</span>
            </div>
          )}

          <div className="flex gap-2">
            {/* Block adding items to billed order */}
            {isBilled && cart.length > 0 && (
              <p className="flex-1 text-xs text-warning text-center py-2">{t.waiter.cannotAddToBilled}</p>
            )}
            {!isBilled && cart.length > 0 && (
              <Button onClick={submitOrder} className="flex-1" size="touch" disabled={submitting}>
                <Send className="h-4 w-4 mr-2" />
                {submitting ? t.waiter.sending : t.waiter.sendToKitchen}
              </Button>
            )}
            {activeOrder && !isBilled && cart.length === 0 && orderMode === 'dine_in' && (
              <Button onClick={requestBill} variant="warning" className="flex-1" size="touch">
                <CreditCard className="h-4 w-4 mr-2" />
                {t.waiter.requestBill}
              </Button>
            )}
            {isBilled && cart.length === 0 && (
              <div className="flex-1 rounded-md bg-warning/10 border border-warning/40 px-3 py-2 text-sm text-warning font-medium text-center">
                {t.waiter.billRequested}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modifier dialog */}
      <Dialog open={showModifierDialog} onOpenChange={setShowModifierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">{t.waiter.modifiers}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {modifiers
                  .filter(m => !m.menu_item_id || m.menu_item_id === pendingItem?.id)
                  .map(mod => {
                    const selected = pendingModifiers.some(pm => pm.id === mod.id);
                    return (
                      <button
                        key={mod.id}
                        onClick={() => setPendingModifiers(prev =>
                          selected ? prev.filter(pm => pm.id !== mod.id) : [...prev, mod]
                        )}
                        className={cn(
                          'rounded-md border p-2.5 text-left text-sm transition-colors touch-target',
                          selected ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                        )}
                      >
                        <p className="font-medium">{mod.name}</p>
                        {Number(mod.price_adjustment) > 0 && (
                          <p className="text-xs text-muted-foreground">+{formatCurrency(Number(mod.price_adjustment))}</p>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
            <div>
              <Label htmlFor="item-notes">{t.common.notes}</Label>
              <Textarea
                id="item-notes"
                placeholder={t.waiter.specialInstructions}
                value={pendingNotes}
                onChange={e => setPendingNotes(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModifierDialog(false)}>{t.common.cancel}</Button>
            <Button onClick={confirmAddToCart}>
              <Plus className="h-4 w-4 mr-1" />
              {t.waiter.addToOrder}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
