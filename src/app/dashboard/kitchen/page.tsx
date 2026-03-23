'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/core';
import { LoadingState, EmptyState, StatusBadge } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import { ChefHat, Clock, Check, Flame, Bell, ClipboardList } from 'lucide-react';
import { cn, elapsedTimeString, formatTime } from '@/lib/utils';
import { useLang } from '@/lib/i18n/context';
import type { Order, OrderItem, OrderItemModifier } from '@/types';

interface KitchenOrder extends Omit<Order, 'table'> {
  items: (OrderItem & { modifiers?: OrderItemModifier[] })[];
  table?: { table_number: string };
}

interface LogItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
  notes: string | null;
  updated_at: string;
}

interface LogOrder {
  id: string;
  order_number: number;
  status: string;
  submitted_at: string | null;
  table?: { table_number: string } | null;
  items: LogItem[];
}

export default function KitchenDisplayPage() {
  const supabase = useSupabase();
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const { t } = useLang();
  const [tab, setTab] = useState<'live' | 'log'>('live');
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [logOrders, setLogOrders] = useState<LogOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 30s to update elapsed time
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Load active orders
  const loadOrders = async () => {
    if (!user?.branch_id) return;
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        table:restaurant_tables(table_number),
        items:order_items(*, modifiers:order_item_modifiers(*))
      `)
      .eq('branch_id', user.branch_id)
      .in('status', ['submitted', 'accepted_by_kitchen', 'preparing', 'ready'])
      .order('submitted_at', { ascending: true });

    if (data) {
      setOrders(data.map(o => ({
        ...o,
        table: Array.isArray(o.table) ? o.table[0] : o.table,
        items: (o.items || []).map((i: any) => ({ ...i, modifiers: i.modifiers || [] })),
      })));
    }
    setLoading(false);
  };

  // Load today's log
  const loadTodayLog = async () => {
    if (!user?.branch_id) return;
    setLogLoading(true);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, submitted_at,
        table:restaurant_tables(table_number),
        items:order_items(id, name, quantity, status, notes, updated_at)
      `)
      .eq('branch_id', user.branch_id)
      .gte('submitted_at', todayStart.toISOString())
      .not('status', 'in', '("draft","cancelled")')
      .order('submitted_at', { ascending: false });

    if (data) {
      setLogOrders(data.map((o: any) => ({
        ...o,
        table: Array.isArray(o.table) ? o.table[0] : o.table,
        items: (o.items || []).filter((i: LogItem) => i.status !== 'cancelled'),
      })));
    }
    setLogLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  useEffect(() => {
    if (tab === 'log') loadTodayLog();
  }, [tab, user]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.branch_id) return;

    const channel = supabase.channel('kitchen-orders')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `branch_id=eq.${user.branch_id}`,
      }, () => {
        loadOrders();
        if (tab === 'log') loadTodayLog();
        try {
          audioRef.current?.play().catch(() => {});
        } catch {}
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'order_items',
      }, () => {
        loadOrders();
        if (tab === 'log') loadTodayLog();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, user, tab]);

  // Update item status
  const updateItemStatus = async (itemId: string, newStatus: 'preparing' | 'ready' | 'served') => {
    const { error } = await supabase.from('order_items').update({ status: newStatus }).eq('id', itemId);
    if (error) {
      toast({ title: t.kitchen.failedItem, description: error.message, variant: 'error' });
      return;
    }
    toast({ title: `${t.kitchen.markedAs} ${newStatus}`, variant: 'success' });
    loadOrders();
  };

  // Accept / complete order
  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    const { error: orderErr } = await supabase.from('orders')
      .update({ status: newStatus, updated_by: user?.id })
      .eq('id', orderId);
    if (orderErr) {
      toast({ title: t.kitchen.failedOrder, description: orderErr.message, variant: 'error' });
      return;
    }

    await supabase.from('order_status_history').insert({
      order_id: orderId, to_status: newStatus, changed_by: user?.id,
    });

    if (newStatus === 'ready') {
      await supabase.from('order_items')
        .update({ status: 'ready' })
        .eq('order_id', orderId)
        .neq('status', 'cancelled');
    }

    loadOrders();
  };

  if (userLoading || loading) return <LoadingState />;

  const getElapsedColor = (submittedAt: string | null) => {
    if (!submittedAt) return '';
    const mins = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 60000);
    if (mins >= 15) return 'text-destructive';
    if (mins >= 10) return 'text-warning';
    return 'text-muted-foreground';
  };

  const itemStatusColor = (status: string) => {
    if (status === 'new') return 'bg-info/10 text-info border-info/30';
    if (status === 'preparing') return 'bg-warning/10 text-warning border-warning/30';
    if (status === 'ready') return 'bg-success/10 text-success border-success/30';
    if (status === 'served') return 'bg-muted text-muted-foreground border-border';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="min-h-screen">
      {/* Hidden audio for notifications */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" type="audio/wav" />
      </audio>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ChefHat className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">{t.kitchen.title}</h1>
          {tab === 'live' && <Badge variant="secondary">{orders.length} {t.kitchen.active}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => tab === 'live' ? loadOrders() : loadTodayLog()}>
          {t.common.refresh}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setTab('live')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'live'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Flame className="h-4 w-4" />
          {t.kitchen.liveOrders}
        </button>
        <button
          onClick={() => setTab('log')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'log'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <ClipboardList className="h-4 w-4" />
          {t.kitchen.todayLog}
        </button>
      </div>

      {/* Live Orders tab */}
      {tab === 'live' && (
        orders.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="h-8 w-8 text-muted-foreground" />}
            title={t.kitchen.noOrders}
            description={t.kitchen.noOrdersDesc}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orders.map(order => (
              <div
                key={order.id}
                className={cn(
                  'rounded-xl border-2 bg-card overflow-hidden',
                  order.status === 'submitted' && 'border-info/60 shadow-md',
                  order.status === 'preparing' && 'border-warning/60',
                  order.status === 'ready' && 'border-success/60',
                )}
              >
                {/* Header */}
                <div className={cn(
                  'px-4 py-3 flex items-center justify-between',
                  order.status === 'submitted' && 'bg-info/10',
                  order.status === 'preparing' && 'bg-warning/10',
                  order.status === 'ready' && 'bg-success/10',
                )}>
                  <div>
                    <span className="text-xl font-bold">{order.table?.table_number || 'N/A'}</span>
                    <span className="text-sm text-muted-foreground ml-2">#{order.order_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className={cn('h-4 w-4', getElapsedColor(order.submitted_at))} />
                    <span className={cn('text-sm font-mono font-medium', getElapsedColor(order.submitted_at))}>
                      {order.submitted_at ? elapsedTimeString(order.submitted_at) : '--'}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="p-4 space-y-3">
                  {order.items
                    .filter(item => item.status !== 'cancelled')
                    .map(item => (
                      <div key={item.id} className="flex items-start gap-3">
                        {/* Item status button */}
                        <button
                          onClick={() => {
                            if (item.status === 'new') updateItemStatus(item.id, 'preparing');
                            else if (item.status === 'preparing') updateItemStatus(item.id, 'ready');
                          }}
                          className={cn(
                            'mt-0.5 h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors touch-target',
                            item.status === 'new' && 'border-info text-info hover:bg-info/10',
                            item.status === 'preparing' && 'border-warning bg-warning/20 text-warning hover:bg-warning/30',
                            item.status === 'ready' && 'border-success bg-success text-success-foreground',
                          )}
                          disabled={item.status === 'ready'}
                        >
                          {item.status === 'ready' ? (
                            <Check className="h-4 w-4" />
                          ) : item.status === 'preparing' ? (
                            <Flame className="h-3.5 w-3.5" />
                          ) : null}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-base">{item.quantity}x</span>
                            <span className={cn(
                              'font-medium',
                              item.status === 'ready' && 'line-through opacity-50'
                            )}>
                              {item.name}
                            </span>
                          </div>
                          {/* Modifiers */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.modifiers.map((m: any) => (
                                <span key={m.id} className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium">
                                  {m.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Notes */}
                          {item.notes && (
                            <p className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded mt-1 font-medium">
                              📝 {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  {order.status === 'submitted' && (
                    <Button
                      size="touch"
                      className="flex-1"
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                    >
                      <Flame className="h-4 w-4 mr-2" />
                      {t.kitchen.startPreparing}
                    </Button>
                  )}
                  {order.status === 'preparing' && (
                    <Button
                      size="touch"
                      variant="success"
                      className="flex-1"
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      {t.kitchen.orderReady}
                    </Button>
                  )}
                  {order.status === 'ready' && (
                    <Button
                      size="touch"
                      variant="outline"
                      className="flex-1"
                      onClick={() => updateOrderStatus(order.id, 'served')}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      {t.kitchen.markServed}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Today's Log tab */}
      {tab === 'log' && (
        logLoading ? <LoadingState /> :
        logOrders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8 text-muted-foreground" />}
            title={t.kitchen.noLogToday}
            description={t.kitchen.noLogTodayDesc}
          />
        ) : (
          <div className="space-y-3">
            {logOrders.map(order => (
              <div key={order.id} className="rounded-lg border bg-card overflow-hidden">
                {/* Order header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">
                      {order.table?.table_number ?? 'Takeaway'}
                    </span>
                    <span className="text-sm text-muted-foreground">#{order.order_number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {order.submitted_at
                      ? new Date(order.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '--'}
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-muted-foreground w-5">{item.quantity}x</span>
                        <span className="font-medium">{item.name}</span>
                        {item.notes && (
                          <span className="text-xs text-muted-foreground italic">— {item.notes}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full border capitalize',
                          itemStatusColor(item.status)
                        )}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
