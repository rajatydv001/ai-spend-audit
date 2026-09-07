import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-form";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}