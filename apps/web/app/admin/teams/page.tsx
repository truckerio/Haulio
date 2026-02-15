import { redirect } from "next/navigation";

export default function LegacyAdminTeamsPage() {
  redirect("/teams/settings");
}
