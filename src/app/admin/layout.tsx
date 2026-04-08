import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-auth";
import { ArrowLeft, Settings } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <Settings className="size-4 text-muted-foreground" />
          <h1 className="text-lg font-semibold">관리자</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
}
