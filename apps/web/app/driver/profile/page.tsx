"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DriverShell } from "@/components/driver/driver-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { apiFetch, getApiBase } from "@/lib/api";

type DriverProfile = {
  id: string;
  name: string;
  phone?: string | null;
  license?: string | null;
  licenseState?: string | null;
  licenseExpiresAt?: string | null;
  medCardExpiresAt?: string | null;
  profilePhotoUrl?: string | null;
};

type DriverUser = {
  email: string;
  name?: string | null;
};

export default function DriverProfilePage() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [user, setUser] = useState<DriverUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ profile: DriverProfile; user: DriverUser }>("/driver/profile");
      setProfile(data.profile);
      setUser(data.user);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const photoUrl = useMemo(() => {
    if (!profile?.profilePhotoUrl) return null;
    if (profile.profilePhotoUrl.startsWith("http")) return profile.profilePhotoUrl;
    const parts = profile.profilePhotoUrl.split("/");
    const name = parts[parts.length - 1];
    return `${getApiBase()}/files/profiles/${encodeURIComponent(name)}`;
  }, [profile?.profilePhotoUrl]);

  const updateField = (key: keyof DriverProfile, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [key]: value });
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch<{ profile: DriverProfile }>("/driver/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone ?? "",
          license: profile.license ?? "",
          licenseState: profile.licenseState ?? "",
          licenseExpiresAt: profile.licenseExpiresAt ?? "",
          medCardExpiresAt: profile.medCardExpiresAt ?? "",
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
      const data = await apiFetch<{ profilePhotoUrl: string }>("/driver/profile/photo", {
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
    <DriverShell>
      <Card className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Profile</div>
        <div className="text-2xl font-semibold">Your information</div>
        <div className="text-sm text-[color:var(--color-text-muted)]">
          Keep your license and medical details up to date for compliance.
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
            {photoUrl ? (
              <Image src={photoUrl} alt="Driver profile" className="h-full w-full object-cover" width={64} height={64} unoptimized />
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
        <div className="text-sm font-semibold">Personal</div>
        <FormField label="Full name" htmlFor="driverName">
          <Input
            id="driverName"
            value={profile?.name ?? ""}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="e.g., Maria Lopez"
          />
        </FormField>
        <FormField label="Email" htmlFor="driverEmail" hint="Contact admin to change login email.">
          <Input id="driverEmail" value={user?.email ?? ""} readOnly />
        </FormField>
        <FormField label="Phone" htmlFor="driverPhone">
          <Input
            id="driverPhone"
            value={profile?.phone ?? ""}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="e.g., +1 (555) 555-0100"
          />
        </FormField>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm font-semibold">License & medical</div>
        <FormField label="License number" htmlFor="driverLicense">
          <Input
            id="driverLicense"
            value={profile?.license ?? ""}
            onChange={(event) => updateField("license", event.target.value)}
            placeholder="e.g., C1234567"
          />
        </FormField>
        <FormField label="License state" htmlFor="driverLicenseState">
          <Input
            id="driverLicenseState"
            value={profile?.licenseState ?? ""}
            onChange={(event) => updateField("licenseState", event.target.value)}
            placeholder="e.g., CA"
          />
        </FormField>
        <FormField label="License expiration date" htmlFor="driverLicenseExpires">
          <Input
            id="driverLicenseExpires"
            type="date"
            value={profile?.licenseExpiresAt ? profile.licenseExpiresAt.slice(0, 10) : ""}
            onChange={(event) => updateField("licenseExpiresAt", event.target.value)}
          />
        </FormField>
        <FormField label="Medical card expiration date" htmlFor="driverMedExpires">
          <Input
            id="driverMedExpires"
            type="date"
            value={profile?.medCardExpiresAt ? profile.medCardExpiresAt.slice(0, 10) : ""}
            onChange={(event) => updateField("medCardExpiresAt", event.target.value)}
          />
        </FormField>
        <div className="text-xs text-[color:var(--color-text-muted)]">
          Uploading CDL/Med Card documents is not supported in the driver app yet. Contact your admin for document uploads.
        </div>
      </Card>

      <Button size="lg" className="w-full" onClick={saveProfile} disabled={saving || !profile}>
        {saving ? "Saving..." : "Save profile"}
      </Button>
    </DriverShell>
  );
}
