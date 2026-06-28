import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { BookOpen, Mail, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accedi – Kobo ePub Manager" },
      { name: "description", content: "Accedi al tuo gestore ePub ottimizzato per Kobo." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account creato. Controlla la tua email per confermare.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore di autenticazione");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Errore di accesso");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4 py-8">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Kobo ePub</h1>
          <p className="text-sm text-muted-foreground mt-1">Libreria ottimizzata per Kobo</p>
        </div>

        <Card className="p-5 space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "signin" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("signin")}
            >
              Accedi
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("signup")}
            >
              Registrati
            </Button>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {mode === "signin" ? "Accedi con email" : "Crea account"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">oppure</span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => handleOAuth("google")}
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.42-1.66 4.16-5.27 4.16-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.82 3.91 14.7 3 12.18 3 6.97 3 2.75 7.22 2.75 12.43s4.22 9.43 9.43 9.43c5.44 0 9.05-3.82 9.05-9.2 0-.62-.07-1.09-.16-1.56z"/></svg>
              Continua con Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => handleOAuth("apple")}
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Continua con Apple
            </Button>
          </div>
        </Card>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Solo gli utenti autorizzati possono accedere alla dashboard.
        </p>
      </div>
    </div>
  );
}
