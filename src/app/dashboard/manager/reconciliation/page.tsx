'use client';
import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui/core';
import { PageHeader, LoadingState, StatCard, StatusBadge } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import { Calculator, Lock, Check } from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

export default function ReconciliationPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [expectedCash, setExpectedCash] = useState(0);
  const [totalCard, setTotalCard] = useState(0);
  const [totalMpesa, setTotalMpesa] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    if (!user?.branch_id) return;
    const [pRes, eRes, sRes] = await Promise.all([
      supabase.from('payments').select('amount, method').eq('branch_id', user.branch_id).gte('created_at', today + 'T00:00:00').eq('status', 'paid'),
      supabase.from('expenses').select('amount').eq('branch_id', user.branch_id).gte('created_at', today + 'T00:00:00'),
      supabase.from('reconciliation_sessions').select('*').eq('branch_id', user.branch_id).order('session_date', { ascending: false }).limit(10),
    ]);
    const payments = pRes.data || [];
    const cash = payments.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
    const card = payments.filter(p => p.method === 'card').reduce((s, p) => s + Number(p.amount), 0);
    const mpesa = payments.filter(p => p.method === 'mpesa').reduce((s, p) => s + Number(p.amount), 0);
    const sales = payments.reduce((s, p) => s + Number(p.amount), 0);
    const expenses = (eRes.data || []).reduce((s, e) => s + Number(e.amount), 0);
    setExpectedCash(cash); setTotalCard(card); setTotalMpesa(mpesa); setTotalSales(sales); setTotalExpenses(expenses);
    setSessions(sRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const closeSession = async () => {
    if (!user?.branch_id) return;
    setSaving(true);
    const actual = parseFloat(actualCash) || 0;
    const discrepancy = actual - expectedCash;
    await supabase.from('reconciliation_sessions').insert({
      branch_id: user.branch_id, session_date: today, expected_cash: expectedCash, actual_cash: actual,
      discrepancy, total_card: totalCard, total_mpesa: totalMpesa, total_sales: totalSales, total_expenses: totalExpenses,
      status: 'closed', notes: notes || null, closed_by: user.id, closed_at: new Date().toISOString(), created_by: user.id,
    });
    toast({ title: 'Reconciliation closed', variant: 'success' });
    setSaving(false); setActualCash(''); setNotes(''); load();
  };

  const discrepancy = (parseFloat(actualCash) || 0) - expectedCash;
  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Cash Reconciliation" description={`Today: ${formatDate(today)}`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Expected Cash" value={formatCurrency(expectedCash)} />
        <StatCard title="Card Payments" value={formatCurrency(totalCard)} />
        <StatCard title="M-Pesa" value={formatCurrency(totalMpesa)} />
        <StatCard title="Total Sales" value={formatCurrency(totalSales)} />
      </div>
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Close Today&apos;s Register</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Actual Cash Counted (KES)</Label>
              <Input type="number" step="0.01" value={actualCash} onChange={e => setActualCash(e.target.value)} className="mt-1 text-lg" placeholder="0.00" /></div>
            <div><Label>Discrepancy</Label>
              <div className={cn('mt-1 text-2xl font-bold', discrepancy === 0 ? 'text-success' : discrepancy > 0 ? 'text-info' : 'text-destructive')}>
                {actualCash ? formatCurrency(discrepancy) : '—'}
              </div>
              {discrepancy !== 0 && actualCash && <p className="text-xs text-muted-foreground">{discrepancy > 0 ? 'Over' : 'Short'}</p>}
            </div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" rows={2} placeholder="Any notes about discrepancies..." /></div>
          <Button onClick={closeSession} disabled={saving || !actualCash} size="touch">
            <Lock className="h-4 w-4 mr-2" /> Close Reconciliation
          </Button>
        </CardContent>
      </Card>
      {sessions.length > 0 && (
        <div><h3 className="font-semibold mb-3">Recent Sessions</h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr>
              <th className="text-left p-3">Date</th><th className="text-right p-3">Expected</th><th className="text-right p-3">Actual</th><th className="text-right p-3">Discrepancy</th><th className="text-center p-3">Status</th>
            </tr></thead><tbody className="divide-y">
              {sessions.map(s => (
                <tr key={s.id}><td className="p-3">{formatDate(s.session_date)}</td>
                  <td className="p-3 text-right">{formatCurrency(Number(s.expected_cash))}</td>
                  <td className="p-3 text-right">{formatCurrency(Number(s.actual_cash))}</td>
                  <td className={cn('p-3 text-right font-medium', Number(s.discrepancy) === 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(Number(s.discrepancy))}</td>
                  <td className="p-3 text-center"><StatusBadge status={s.status} /></td>
                </tr>))}
            </tbody></table></div></div>
      )}
    </div>
  );
}
