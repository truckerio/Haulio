"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiFetch, setCsrfToken } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
