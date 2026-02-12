"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { apiFetch, setCsrfToken } from "@/lib/api";

function getRoleRedirect(role?: string | null) {
  if (role === "DRIVER") return "/driver";
  if (role === "DISPATCHER" || role === "HEAD_DISPATCHER") return "/dispatch";
  return "/today";
}

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<"code" | "details">("code");
  const [code, setCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const data = await apiFetch<{ hasOrg: boolean }>("/setup/status");
        if (!mounted) return;
        if (data.hasOrg) {
          router.replace("/");
          return;
        }
      } catch (err) {
        if (!mounted) return;
        setError((err as Error).message);
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

  const handleValidate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ valid: boolean }>("/setup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      if (!data.valid) {
        setError("That setup code is invalid or already used.");
        return;
      }
      setStep("details");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ csrfToken?: string; user?: { role?: string } }>("/setup/consume-and-create-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          companyName,
          admin: {
            name: adminName,
            email: adminEmail,
            password: adminPassword,
          },
        }),
        credentials: "include",
      });
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      router.replace(getRoleRedirect(data.user?.role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-xl">
          <Card className="space-y-2 p-6">
            <div className="text-lg font-semibold">Preparing setup…</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">Checking your workspace.</div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">Setup</div>
          <h1 className="text-3xl font-semibold text-ink">Activate your company</h1>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Enter the setup code provided by Haulio to start onboarding.
          </p>
        </div>
        <Card className="space-y-4 p-6">
          {step === "code" ? (
            <form className="space-y-4" onSubmit={handleValidate}>
              <FormField label="Setup code" htmlFor="setupCode" required>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter code"
                  autoComplete="off"
                />
              </FormField>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Validating…" : "Continue"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleCreate}>
              <FormField label="Company name" htmlFor="companyName" required>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                />
              </FormField>
              <FormField label="Admin name" htmlFor="adminName" required>
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Full name" />
              </FormField>
              <FormField label="Admin email" htmlFor="adminEmail" required>
                <Input
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </FormField>
              <FormField label="Admin password" htmlFor="adminPassword" required>
                <Input
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Create a password"
                  type="password"
                />
              </FormField>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create company"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
