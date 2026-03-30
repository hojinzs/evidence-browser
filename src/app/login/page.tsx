import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Evidence Browser</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            로그인하여 evidence bundle을 확인하세요.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("oidc");
          }}
        >
          <Button type="submit" size="lg" className="w-full gap-2">
            <LogIn className="h-4 w-4" />
            로그인
          </Button>
        </form>
      </div>
    </div>
  );
}
