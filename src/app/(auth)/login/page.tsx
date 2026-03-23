'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/use-supabase';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/core';
import { Loader2, Coffee, Hash, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const input = code.trim();
    let email = input;

    // If input doesn't look like an email, look up by staff code
    if (!input.includes('@')) {
      const { data, error: rpcErr } = await supabase.rpc('get_email_from_staff_code', { p_code: input });
      if (rpcErr || !data) {
        setError('Staff code not found. Check your code or contact your manager.');
        setLoading(false);
        return;
      }
      email = data as string;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Incorrect password. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Coffee className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Karibu Café</CardTitle>
          <CardDescription>Enter your staff code to sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Staff Code</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="code"
                  type="text"
                  placeholder="e.g. W01, K01, C01"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  required
                  autoComplete="username"
                  autoCapitalize="characters"
                  className="pl-9 font-mono tracking-widest text-lg uppercase"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your short code assigned by the manager
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">PIN / Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-9"
                  placeholder="••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="touch" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
