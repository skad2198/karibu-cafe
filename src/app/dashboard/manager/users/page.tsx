'use client';
import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, Input, Label, Badge } from '@/components/ui/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog-tabs';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import { Users, Shield, Hash } from 'lucide-react';
import { capitalize } from '@/lib/utils';
import { useLang } from '@/lib/i18n/context';
import type { Profile, UserRole, AppRole } from '@/types';

const ALL_ROLES: AppRole[] = ['admin', 'manager', 'cashier', 'waiter', 'kitchen', 'staff'];

export default function UsersPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { t } = useLang();
  const [profiles, setProfiles] = useState<(Profile & { roles: UserRole[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<(Profile & { roles: UserRole[] }) | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [staffCode, setStaffCode] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.branch_id) return;
    const { data: profs } = await supabase.from('profiles').select('*').order('full_name');
    const { data: roles } = await supabase.from('user_roles').select('*');
    setProfiles((profs || []).map(p => ({
      ...p,
      roles: (roles || []).filter(r => r.user_id === p.id),
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const openDialog = (p: Profile & { roles: UserRole[] }) => {
    setSelectedProfile(p);
    setSelectedRoles(p.roles.map(r => r.role));
    setStaffCode((p as any).staff_code || '');
    setShowDialog(true);
  };

  const save = async () => {
    if (!selectedProfile || !user) return;
    setSaving(true);

    // Update staff code
    const code = staffCode.trim().toUpperCase() || null;
    const { error: codeErr } = await supabase
      .from('profiles')
      .update({ staff_code: code })
      .eq('id', selectedProfile.id);
    if (codeErr) {
      toast({ title: 'Failed to update staff code', description: codeErr.message, variant: 'error' });
      setSaving(false);
      return;
    }

    // Update roles
    await supabase.from('user_roles').delete().eq('user_id', selectedProfile.id);
    if (selectedRoles.length > 0) {
      await supabase.from('user_roles').insert(
        selectedRoles.map(role => ({
          user_id: selectedProfile.id, role, branch_id: user.branch_id, granted_by: user.id,
        }))
      );
    }

    toast({ title: t.users.rolesUpdated, variant: 'success' });
    setSaving(false);
    setShowDialog(false);
    load();
  };

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title={t.users.title} description={`${profiles.length} users`} />

      {profiles.length === 0 ? (
        <EmptyState title="No users" icon={<Users className="h-8 w-8 text-muted-foreground" />} />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Staff Code</th>
                <th className="text-left p-3 font-medium">Roles</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-center p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {profiles.map(p => (
                <tr key={p.id}>
                  <td className="p-3">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </td>
                  <td className="p-3">
                    {(p as any).staff_code ? (
                      <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded text-sm">
                        {(p as any).staff_code}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">not set</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {p.roles.map(r => <Badge key={r.id} variant="secondary">{capitalize(r.role)}</Badge>)}
                      {p.roles.length === 0 && <span className="text-muted-foreground text-xs">{t.users.noRoles}</span>}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(p)}>
                      <Shield className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.users.manageRoles}: {selectedProfile?.full_name}</DialogTitle>
          </DialogHeader>

          {/* Staff code */}
          <div className="space-y-2 pb-4 border-b">
            <Label className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Staff Code
            </Label>
            <Input
              value={staffCode}
              onChange={e => setStaffCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g. W01, K02, C01"
              maxLength={8}
              className="font-mono tracking-widest uppercase font-bold text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Short code used at login. Max 8 characters, letters and numbers only.
            </p>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="space-y-2">
              {ALL_ROLES.map(role => (
                <label key={role} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={e => setSelectedRoles(prev =>
                      e.target.checked ? [...prev, role] : prev.filter(r => r !== role)
                    )}
                    className="rounded"
                  />
                  <span className="font-medium capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t.common.cancel}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : t.users.saveRoles}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
