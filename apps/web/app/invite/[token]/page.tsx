"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { apiFetch } from "@/lib/api";

type InviteInfo = {
  email: string;
  role: string;
  expiresAt: string;
  org?: { id: string; name: string };
};

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ invite: InviteInfo }>(`/invite/${encodeURIComponent(token)}`, { skipAuthRedirect: true })
      .then((data) => setInvite(data.invite))
      .catch((err) => setStatus((err as Error).message));
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!token) {
      setStatus("Invite token is missing.");
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
    try {
      await apiFetch(`/invite/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
        skipAuthRedirect: true,
      });
      setStatus("Invite accepted. You can sign in now.");
    } catch (err) {
      setStatus((err as Error).message || "Unable to accept invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Card className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Invite</div>
            <h1 className="text-2xl font-semibold">Activate your account</h1>
            {invite ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {invite.org?.name ?? "Organization"} · {invite.email}
              </div>
            ) : null}
          </div>
          {status ? <div className="text-sm text-[color:var(--color-text-muted)]">{status}</div> : null}
          {invite && (!status || !status.startsWith("Invite accepted")) ? (
            <form className="space-y-3" onSubmit={handleSubmit}>
              <FormField label="Full name" htmlFor="inviteName">
                <Input
                  id="inviteName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., Jordan Lee"
                />
              </FormField>
              <FormField label="Password" htmlFor="invitePassword">
                <Input
                  id="invitePassword"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  type="password"
                />
              </FormField>
              <FormField label="Confirm password" htmlFor="inviteConfirm">
                <Input
                  id="inviteConfirm"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Confirm password"
                  type="password"
                />
              </FormField>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Activating..." : "Activate account"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" type="button" onClick={() => router.push("/login")}>
                Back to login
              </Button>
            </form>
          ) : status && status.startsWith("Invite accepted") ? (
            <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
              Continue to login
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
