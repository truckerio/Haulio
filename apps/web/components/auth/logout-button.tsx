"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch, clearCsrfToken } from "@/lib/api";

type LogoutButtonProps = {
  label?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

export function LogoutButton({
  label = "Log out",
  className,
  variant = "secondary",
  size = "sm",
}: LogoutButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/auth/logout", { method: "POST", skipAuthRedirect: true });
    } catch {
      // ignore
    } finally {
      clearCsrfToken();
      window.location.href = "/login";
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      variant={variant}
      size={size}
      className={cn("w-full", className)}
    >
      {busy ? "Signing out..." : label}
    </Button>
  );
}
