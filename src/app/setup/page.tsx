import { redirect } from "next/navigation";
import { countAdmins } from "@/lib/db/users";
import { listWorkspaces } from "@/lib/db/workspaces";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { getEnv } from "@/config/env";

export default function SetupPage() {
  const hasAdmin = countAdmins() > 0;
  const hasWorkspace = listWorkspaces().length > 0;

  // Setup complete — redirect to dashboard
  if (hasAdmin && hasWorkspace) {
    redirect("/");
  }

  const env = getEnv();

  return (
    <SetupWizard
      storageType={env.STORAGE_TYPE}
      storagePath={env.STORAGE_LOCAL_PATH ?? ""}
      skipAdmin={hasAdmin}
    />
  );
}
