import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthorizationDetails = {
  client?: { name?: string; client_id?: string; redirect_uri?: string };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
};

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search }) => {
    if (!search.authorization_id) throw new Error("Eksik authorization_id");
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { needsLogin: true, details: null };
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return { needsLogin: false, details: data };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Yetkilendirme yüklenemedi</h1>
      <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const initial = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign-in form (shown when there is no session).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setBusy(false);
      setError(signInError.message);
      return;
    }
    const { data, error: detailsErr } = await oauthApi().getAuthorizationDetails(authorization_id);
    setBusy(false);
    if (detailsErr) {
      setError(detailsErr.message);
      return;
    }
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return;
    }
    setState({ needsLogin: false, details: data });
  }

  async function decide(approve: boolean) {
    setError(null);
    setBusy(true);
    const { data, error: err } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Yönlendirme URL'si alınamadı.");
      return;
    }
    window.location.href = target;
  }

  if (state.needsLogin) {
    return (
      <main className="mx-auto max-w-md p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Devam etmek için giriş yapın</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bir uygulama Dolabım hesabınıza bağlanmak istiyor. Onaylamak için giriş yapın.
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <form onSubmit={signIn} className="space-y-3">
          <Input
            type="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Giriş yapılıyor..." : "Giriş yap ve devam et"}
          </Button>
        </form>
      </main>
    );
  }

  const clientName = state.details?.client?.name ?? "Bir uygulama";
  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{clientName} hesabınıza bağlansın mı?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bu, {clientName} uygulamasının siz olarak Dolabım araçlarını (kıyafetlerinizi listeleme, istatistikler) kullanmasına izin verir.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={() => decide(true)} disabled={busy} className="flex-1">
          Onayla
        </Button>
        <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">
          Reddet
        </Button>
      </div>
    </main>
  );
}
