"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { getSaveButtonLabel } from "@/components/ui/save-feedback";
import { apiFetch, getApiBase } from "@/lib/api";
import { useSaveFeedback } from "@/lib/use-save-feedback";

type Profile = {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  timezone?: string | null;
  profilePhotoUrl?: string | null;
  role?: string | null;
};

type MfaSetupPayload = {
  otpauthUrl: string;
  secret: string;
  recoveryCodes: string[];
};

export default function ProfilePage() {
  const { user, refresh } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { saveState, startSaving, markSaved, resetSaveState } = useSaveFeedback(1800);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupPayload | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [mfaDisableRecovery, setMfaDisableRecovery] = useState("");
  const [mfaStatus, setMfaStatus] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    const data = await apiFetch<{ profile: Profile }>("/profile");
    setProfile(data.profile);
  }, []);

  useEffect(() => {
    loadProfile().catch((err) => setError((err as Error).message));
  }, [loadProfile]);

  const photoUrl = useMemo(() => {
    if (!profile?.profilePhotoUrl) return null;
    if (profile.profilePhotoUrl.startsWith("http")) return profile.profilePhotoUrl;
    const parts = profile.profilePhotoUrl.split("/");
    const name = parts[parts.length - 1];
    return `${getApiBase()}/files/profiles/${encodeURIComponent(name)}`;
  }, [profile?.profilePhotoUrl]);

  const updateField = (key: keyof Profile, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [key]: value });
  };

  const saveProfile = async () => {
    if (!profile) return;
    startSaving();
    setError(null);
    setSuccess(null);
    try {
      await apiFetch("/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name ?? "",
          phone: profile.phone ?? "",
          timezone: profile.timezone ?? "",
        }),
      });
      markSaved();
    } catch (err) {
      resetSaveState();
      setError((err as Error).message);
    }
  };

  const uploadPhoto = async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    try {
      const data = await apiFetch<{ profilePhotoUrl: string }>("/profile/photo", {
        method: "POST",
        body,
      });
      setProfile((prev) => (prev ? { ...prev, profilePhotoUrl: data.profilePhotoUrl } : prev));
      setSuccess("Profile photo updated.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startMfaSetup = async () => {
    setMfaStatus(null);
    setMfaLoading(true);
    try {
      const data = await apiFetch<MfaSetupPayload>("/auth/mfa/setup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setMfaSetup(data);
    } catch (err) {
      setMfaStatus((err as Error).message || "Failed to start 2FA setup.");
    } finally {
      setMfaLoading(false);
    }
  };

  const verifyMfaSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setMfaStatus(null);
    if (!mfaCode) {
      setMfaStatus("Enter the 6-digit code from your authenticator.");
      return;
    }
    setMfaLoading(true);
    try {
      await apiFetch("/auth/mfa/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      setMfaSetup(null);
      setMfaCode("");
      setMfaStatus("Two-factor authentication enabled.");
      refresh();
    } catch (err) {
      setMfaStatus((err as Error).message || "Failed to verify 2FA.");
    } finally {
      setMfaLoading(false);
    }
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setMfaStatus(null);
    if (!mfaDisablePassword || (!mfaDisableCode && !mfaDisableRecovery)) {
      setMfaStatus("Provide your password and a 2FA code or recovery code.");
      return;
    }
    setMfaLoading(true);
    try {
      await apiFetch("/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: mfaDisablePassword,
          code: mfaDisableCode || undefined,
          recoveryCode: mfaDisableRecovery || undefined,
        }),
      });
      setMfaDisablePassword("");
      setMfaDisableCode("");
      setMfaDisableRecovery("");
      setMfaStatus("Two-factor authentication disabled.");
      refresh();
    } catch (err) {
      setMfaStatus((err as Error).message || "Failed to disable 2FA.");
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <AppShell title="Profile" subtitle="Your account details">
      <RouteGuard allowedRoles={["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"]}>
        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Employee profile</div>
            <div className="text-2xl font-semibold">{profile?.name ?? user?.email ?? "Profile"}</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Keep your contact info and timezone current.
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold">Appearance & accessibility</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Control theme, text size, contrast, motion, and navigation density.
            </div>
            <Link href="/profile/appearance">
              <Button variant="secondary">Open appearance settings</Button>
            </Link>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold">Session</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Manage your active session from your profile.
            </div>
            <LogoutButton className="w-fit min-w-36" />
          </Card>

          {error ? (
            <Card>
              <div className="text-sm text-[color:var(--color-danger)]">{error}</div>
            </Card>
          ) : null}
          {success ? (
            <Card>
              <div className="text-sm text-[color:var(--color-success)]">{success}</div>
            </Card>
          ) : null}

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Profile photo</div>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]">
                {photoUrl ? (
                  <Image src={photoUrl} alt="Profile" className="h-full w-full object-cover" width={64} height={64} unoptimized />
                ) : null}
              </div>
              <label className="cursor-pointer text-sm font-semibold text-[color:var(--color-accent)]">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadPhoto(file);
                  }}
                />
                Upload photo
              </label>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Contact</div>
            <FormField label="Full name" htmlFor="profileName">
              <Input
                id="profileName"
                value={profile?.name ?? ""}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g., Jordan Lee"
              />
            </FormField>
            <FormField label="Email" htmlFor="profileEmail">
              <Input id="profileEmail" value={profile?.email ?? ""} readOnly />
            </FormField>
            <FormField label="Phone" htmlFor="profilePhone">
              <Input
                id="profilePhone"
                value={profile?.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="e.g., +1 (555) 555-0100"
              />
            </FormField>
            <FormField label="Timezone" htmlFor="profileTimezone">
              <Input
                id="profileTimezone"
                value={profile?.timezone ?? ""}
                onChange={(event) => updateField("timezone", event.target.value)}
                placeholder="e.g., America/Chicago"
              />
            </FormField>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Two-factor authentication</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {user?.mfaEnabled
                ? "2FA is enabled for your account."
                : "Add an authenticator app to protect your account."}
            </div>
            {user?.mfaEnforced ? (
              <div className="text-xs text-[color:var(--color-warning)]">
                2FA is required for your role.
              </div>
            ) : null}
            {mfaStatus ? <div className="text-sm text-[color:var(--color-text-muted)]">{mfaStatus}</div> : null}
            {!user?.mfaEnabled ? (
              <div className="space-y-3">
                {!mfaSetup ? (
                  <Button type="button" variant="secondary" disabled={mfaLoading} onClick={startMfaSetup}>
                    {mfaLoading ? "Preparing..." : "Enable 2FA"}
                  </Button>
                ) : (
                  <>
                    <Card className="space-y-2 border border-[color:var(--color-divider)] bg-white/70 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        Setup key
                      </div>
                      <div className="break-all text-sm">{mfaSetup.secret}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        Use this secret in an authenticator app.
                      </div>
                    </Card>
                    <Card className="space-y-2 border border-[color:var(--color-divider)] bg-white/70 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        Recovery codes
                      </div>
                      <div className="grid gap-2 text-sm">
                        {mfaSetup.recoveryCodes.map((code) => (
                          <div key={code} className="rounded border border-[color:var(--color-divider)] px-2 py-1">
                            {code}
                          </div>
                        ))}
                      </div>
                    </Card>
                    <form className="space-y-3" onSubmit={verifyMfaSetup}>
                      <FormField label="Verification code" htmlFor="mfaVerifyCode">
                        <Input
                          id="mfaVerifyCode"
                          value={mfaCode}
                          onChange={(event) => setMfaCode(event.target.value)}
                          placeholder="123456"
                          autoComplete="one-time-code"
                        />
                      </FormField>
                      <Button type="submit" variant="secondary" disabled={mfaLoading || !mfaCode}>
                        {mfaLoading ? "Verifying..." : "Verify & enable"}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            ) : (
              <form className="space-y-3" onSubmit={disableMfa}>
                <FormField label="Password" htmlFor="mfaDisablePassword">
                  <Input
                    id="mfaDisablePassword"
                    value={mfaDisablePassword}
                    onChange={(event) => setMfaDisablePassword(event.target.value)}
                    placeholder="Confirm your password"
                    type="password"
                  />
                </FormField>
                <FormField label="Authenticator code" htmlFor="mfaDisableCode">
                  <Input
                    id="mfaDisableCode"
                    value={mfaDisableCode}
                    onChange={(event) => setMfaDisableCode(event.target.value)}
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </FormField>
                <div className="text-xs text-[color:var(--color-text-muted)]">Or use a recovery code instead.</div>
                <FormField label="Recovery code" htmlFor="mfaDisableRecovery">
                  <Input
                    id="mfaDisableRecovery"
                    value={mfaDisableRecovery}
                    onChange={(event) => setMfaDisableRecovery(event.target.value)}
                    placeholder="e.g., a1b2c3d4e5"
                  />
                </FormField>
                <Button type="submit" variant="secondary" disabled={mfaLoading}>
                  {mfaLoading ? "Updating..." : "Disable 2FA"}
                </Button>
              </form>
            )}
          </Card>

          <div className="flex items-center gap-2">
            <Button size="lg" onClick={saveProfile} disabled={saveState === "saving"}>
              {getSaveButtonLabel(saveState, "Save profile")}
            </Button>
          </div>
        </div>
      </RouteGuard>
    </AppShell>
  );
}
