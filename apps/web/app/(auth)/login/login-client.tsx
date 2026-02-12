"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { apiFetch, setCsrfToken } from "@/lib/api";

type LoginStage = "login" | "mfa" | "mfa-setup";

type LoginUser = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
};

type LoginResponse = {
  user?: LoginUser;
  csrfToken?: string;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  tempToken?: string;
};

type MfaSetupPayload = {
  otpauthUrl: string;
  secret: string;
  recoveryCodes: string[];
};

function getSafeCallback(target: string | null) {
  if (!target) return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  return target;
}

function getRoleRedirect(role: string | undefined) {
  if (role === "DRIVER") return "/driver";
  if (role === "DISPATCHER" || role === "HEAD_DISPATCHER") return "/dispatch";
  return "/today";
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [stage, setStage] = useState<LoginStage>("login");
  const [mfaSetup, setMfaSetup] = useState<MfaSetupPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(() => getSafeCallback(searchParams.get("callbackUrl")) || "", [searchParams]);

  const resetToLogin = () => {
    setStage("login");
    setTempToken(null);
    setMfaCode("");
    setRecoveryCode("");
    setMfaSetup(null);
    setError(null);
  };

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const data = await apiFetch<{ hasOrg: boolean }>("/setup/status", { skipAuthRedirect: true });
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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        skipAuthRedirect: true,
      });
      if (data.mfaRequired && data.tempToken) {
        setTempToken(data.tempToken);
        setStage("mfa");
        return;
      }
      if (data.mfaSetupRequired && data.tempToken) {
        setTempToken(data.tempToken);
        setStage("mfa-setup");
        return;
      }
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      const destination = callbackUrl || getRoleRedirect(data.user?.role);
      router.replace(destination);
    } catch (err) {
      setError((err as Error).message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !tempToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LoginResponse>("/auth/login/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempToken,
          code: mfaCode || undefined,
          recoveryCode: recoveryCode || undefined,
        }),
        skipAuthRedirect: true,
      });
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      const destination = callbackUrl || getRoleRedirect(data.user?.role);
      router.replace(destination);
    } catch (err) {
      setError((err as Error).message || "Unable to verify MFA.");
    } finally {
      setLoading(false);
    }
  };

  const startMfaSetup = async () => {
    if (!tempToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MfaSetupPayload>("/auth/mfa/setup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken }),
        skipAuthRedirect: true,
      });
      setMfaSetup(data);
    } catch (err) {
      setError((err as Error).message || "Unable to start MFA setup.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSetupVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !tempToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LoginResponse>("/auth/mfa/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: mfaCode }),
        skipAuthRedirect: true,
      });
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      const destination = callbackUrl || getRoleRedirect(data.user?.role);
      router.replace(destination);
    } catch (err) {
      setError((err as Error).message || "Unable to verify MFA.");
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
            <div aria-hidden="true" />
          </div>
          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Log in</h2>
              <p className="text-sm text-[color:var(--color-text-muted)]">Use your email and password to continue.</p>
            </div>
            {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}

            {stage === "login" ? (
              <form className="space-y-3" onSubmit={handleLogin}>
                <FormField label="Email" htmlFor="loginEmail">
                  <Input
                    id="loginEmail"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </FormField>
                <FormField label="Password" htmlFor="loginPassword">
                  <Input
                    id="loginPassword"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Your password"
                    type="password"
                    autoComplete="current-password"
                  />
                </FormField>
                <Button type="submit" size="lg" className="w-full" disabled={loading || !email || !password}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Button variant="ghost" size="sm" className="w-full" type="button" onClick={() => router.push("/forgot")}>
                  Forgot password?
                </Button>
              </form>
            ) : null}

            {stage === "mfa" ? (
              <form className="space-y-3" onSubmit={handleMfaLogin}>
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  Enter the 6-digit code from your authenticator or a recovery code.
                </div>
                <FormField label="Authenticator code" htmlFor="mfaCode">
                  <Input
                    id="mfaCode"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </FormField>
                <div className="text-xs text-[color:var(--color-text-muted)]">Or use a recovery code instead.</div>
                <FormField label="Recovery code" htmlFor="recoveryCode">
                  <Input
                    id="recoveryCode"
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    placeholder="e.g., a1b2c3d4e5"
                  />
                </FormField>
                <Button type="submit" size="lg" className="w-full" disabled={loading || (!mfaCode && !recoveryCode)}>
                  {loading ? "Verifying..." : "Verify & sign in"}
                </Button>
                <Button variant="ghost" size="sm" className="w-full" type="button" onClick={resetToLogin}>
                  Back to login
                </Button>
              </form>
            ) : null}

            {stage === "mfa-setup" ? (
              <div className="space-y-4">
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  Admins must enable two-factor authentication. Set it up to finish signing in.
                </div>
                {!mfaSetup ? (
                  <Button type="button" size="lg" className="w-full" disabled={loading} onClick={startMfaSetup}>
                    {loading ? "Preparing..." : "Start 2FA setup"}
                  </Button>
                ) : (
                  <>
                    <Card className="space-y-2 border border-[color:var(--color-divider)] bg-white/70 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Setup key</div>
                      <div className="break-all text-sm">{mfaSetup.secret}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        Use this in any authenticator app if you can’t scan a QR code.
                      </div>
                    </Card>
                    <Card className="space-y-2 border border-[color:var(--color-divider)] bg-white/70 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Recovery codes</div>
                      <div className="grid gap-2 text-sm">
                        {mfaSetup.recoveryCodes.map((code) => (
                          <div key={code} className="rounded border border-[color:var(--color-divider)] px-2 py-1">
                            {code}
                          </div>
                        ))}
                      </div>
                    </Card>
                    <form className="space-y-3" onSubmit={handleMfaSetupVerify}>
                      <FormField label="Verification code" htmlFor="mfaSetupCode">
                        <Input
                          id="mfaSetupCode"
                          value={mfaCode}
                          onChange={(event) => setMfaCode(event.target.value)}
                          placeholder="123456"
                          autoComplete="one-time-code"
                        />
                      </FormField>
                      <Button type="submit" size="lg" className="w-full" disabled={loading || !mfaCode}>
                        {loading ? "Verifying..." : "Verify & continue"}
                      </Button>
                    </form>
                  </>
                )}
                <Button variant="ghost" size="sm" className="w-full" type="button" onClick={resetToLogin}>
                  Back to login
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
