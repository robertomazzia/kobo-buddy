import { createFileRoute, Outlet, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const email = user.email;
      if (!email) {
        if (!cancelled) setAllowed(false);
        return;
      }
      const { data, error } = await supabase.rpc("is_email_allowed", { _email: email });
      if (cancelled) return;
      setAllowed(!error && data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.email]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4">
        <Card className="max-w-sm w-full p-6 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Accesso non autorizzato</h1>
            <p className="text-sm text-muted-foreground">
              L'indirizzo <span className="font-medium">{user.email}</span> non è abilitato
              ad accedere a questa applicazione.
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              Contatta l'amministratore per essere aggiunto alla whitelist.
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Esci
          </Button>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
