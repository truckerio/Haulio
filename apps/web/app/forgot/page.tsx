"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";

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
          skipAuthRedirect: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      setStatus(data.message ?? "If an account exists, a reset link will be sent to the email address.");
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
            <p className="text-sm text-[color:var(--color-text-muted)]">Enter your email to receive a reset link.</p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <FormField label="Email" htmlFor="forgotEmail">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </FormField>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset email"}
            </Button>
          </form>
          {status ? <div className="text-sm text-[color:var(--color-text-muted)]">{status}</div> : null}
          {resetUrl ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-3 py-2 text-xs break-all">
              Reset link: <a className="underline" href={resetUrl}>{resetUrl}</a>
            </div>
          ) : null}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/login")}>
            Back to login
          </Button>
        </Card>
      </div>
    </div>
  );
}
