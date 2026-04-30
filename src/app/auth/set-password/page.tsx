import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Welcome to BMH Institute. Pick a password and you&apos;re in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm email={user.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
