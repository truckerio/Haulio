"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiFetch, setCsrfToken } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const data = await apiFetch<{ hasOrg: boolean }>("/setup/status");
        if (!mounted) return;
        if (!data.hasOrg) {
          router.replace("/setup");
          return;
        }
      } catch (err) {
        if (!mounted) return;
        setStatusError((err as Error).message);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    };
    checkStatus();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ user: { role: string }; csrfToken: string }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setCsrfToken(data.csrfToken);
      if (data.user.role === "DRIVER") {
        router.push("/driver");
      } else if (data.user.role === "DISPATCHER" || data.user.role === "HEAD_DISPATCHER") {
        router.push("/dispatch");
      } else {
        router.push("/today");
      }
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("invalid credentials")) {
        setError("Your email or password is wrong. Try again.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <Card className="space-y-2 p-6">
            <div className="text-lg font-semibold">Preparing login…</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">Checking setup status.</div>
            {statusError ? <div className="text-sm text-[color:var(--color-danger)]">{statusError}</div> : null}
          </Card>
        </div>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <Card className="space-y-2 p-6">
            <div className="text-lg font-semibold">Setup check failed</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">{statusError}</div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <h1 className="text-4xl font-semibold leading-tight">HAULIO</h1>
          </div>
          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Log in</h2>
              <p className="text-sm text-[color:var(--color-text-muted)]">Enter your email and password.</p>
            </div>
            <form className="space-y-3" onSubmit={handleLogin}>
              <FormField label="Email" htmlFor="loginEmail">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </FormField>
              <FormField label="Password" htmlFor="loginPassword">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  type="password"
                />
              </FormField>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/forgot")}>
              Forgot password?
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
