import { requireAuth } from "@/lib/auth/require-auth";
import { Header } from "@/components/layout";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <Header title="Settings" userName={user.username} />
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
