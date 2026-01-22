"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiFetch, setCsrfToken } from "@/lib/api";

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
            <h1 className="text-4xl font-semibold leading-tight">
              TruckerIO back-office meets a zero-friction driver flow.
            </h1>
            <p className="text-lg text-black/70">
              Dispatch, billing, storage, and audit tools with a driver experience built for real-world signal
              conditions.
            </p>
          </div>
          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Log in</h2>
              <p className="text-sm text-black/60">Enter your email and password.</p>
            </div>
            <form className="space-y-3" onSubmit={handleLogin}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
              />
              {error ? <div className="text-sm text-red-600">{error}</div> : null}
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
