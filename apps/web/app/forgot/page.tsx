"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    setResetUrl(null);
    try {
      const data = await apiFetch<{ message?: string; resetUrl?: string }>(
        "/auth/forgot",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      setStatus(data.message ?? "If an account exists, a reset link is available.");
      if (data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Forgot password</h2>
            <p className="text-sm text-black/60">Enter your email to get a reset link.</p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
          {status ? <div className="text-sm text-black/70">{status}</div> : null}
          {resetUrl ? (
            <div className="rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-xs break-all">
              Reset link: <a className="underline" href={resetUrl}>{resetUrl}</a>
            </div>
          ) : null}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/")}>
            Back to login
          </Button>
        </Card>
      </div>
    </div>
  );
}
