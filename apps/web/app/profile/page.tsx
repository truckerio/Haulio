"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { apiFetch, getApiBase } from "@/lib/api";

type Profile = {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  timezone?: string | null;
  profilePhotoUrl?: string | null;
  role?: string | null;
};

export default function ProfilePage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    setSaving(true);
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
      setSuccess("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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

  return (
    <AppShell title="Profile" subtitle="Your account details">
      <RouteGuard allowedRoles={["ADMIN", "DISPATCHER", "BILLING"]}>
        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Employee profile</div>
            <div className="text-2xl font-semibold">{profile?.name ?? user?.email ?? "Profile"}</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Keep your contact info and timezone current.
            </div>
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
                {photoUrl ? <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" /> : null}
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

          <Button size="lg" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </RouteGuard>
    </AppShell>
  );
}
