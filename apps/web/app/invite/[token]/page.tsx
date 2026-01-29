"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [invite, setInvite] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ invite: any }>(`/invite/${token}`)
      .then((data) => {
        setInvite(data.invite);
        setName(data.invite.user.name ?? "");
      })
      .catch((err) => setError((err as Error).message));
  }, [token]);

  const acceptInvite = async () => {
    setError(null);
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, name: name || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-muted)] px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Card className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Welcome</div>
            <h1 className="text-2xl font-semibold">Set your password</h1>
            {invite ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {invite.org?.name} · {invite.user?.email}
              </div>
            ) : null}
          </div>
          {done ? (
            <div className="space-y-3">
              <div className="text-sm text-[color:var(--color-success)]">Password set. You can sign in now.</div>
              <Button onClick={() => router.push("/")}>Go to login</Button>
            </div>
          ) : (
            <>
              <FormField label="Full name" htmlFor="inviteName">
                <Input placeholder="Taylor Johnson" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="New password" htmlFor="invitePassword">
                <Input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FormField>
              <FormField label="Confirm password" htmlFor="inviteConfirm">
                <Input type="password" placeholder="Re-enter password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </FormField>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              <Button onClick={acceptInvite} disabled={loading}>
                {loading ? "Saving..." : "Set password"}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
