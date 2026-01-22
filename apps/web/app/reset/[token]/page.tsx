"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setStatus("Reset token missing.");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("Passwords do not match.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const data = await apiFetch<{ message?: string }>(
        "/auth/reset",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        }
      );
      setStatus(data.message ?? "Password updated. You can log in now.");
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
            <h2 className="text-xl font-semibold">Reset password</h2>
            <p className="text-sm text-black/60">Choose a new password to finish resetting.</p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              type="password"
            />
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              type="password"
            />
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Reset password"}
            </Button>
          </form>
          {status ? <div className="text-sm text-black/70">{status}</div> : null}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/")}>
            Back to login
          </Button>
        </Card>
      </div>
    </div>
  );
}
