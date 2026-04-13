export const dynamic = "force-dynamic";

import { requireAuth } from "@/lib/auth/require-auth";
import { listApiKeysByUser } from "@/lib/db/api-keys";
import { UserApiKeyManager } from "@/components/settings/user-api-key-manager";

export default async function SettingsPage() {
  const user = await requireAuth();
  const keys = listApiKeysByUser(user.id);

  return (
    <div className="app-fade-up space-y-10">
      <section className="space-y-4">
        <div className="flex items-end gap-6">
          <div>
            <h2 className="text-xl font-semibold">API Keys</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Create and manage your personal API keys.
            </p>
          </div>
          <div className="h-px flex-1 bg-border" />
        </div>
        <UserApiKeyManager initialKeys={keys} />
      </section>
    </div>
  );
}
