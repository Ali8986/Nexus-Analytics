import { Settings2 } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon-page";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ComingSoonPage
      description="Manage your profile, workspace, and team access from one place."
      icon={Settings2}
      milestone="Milestone 7"
      title="Settings"
    />
  );
}
