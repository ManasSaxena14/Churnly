import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Log in · ${BRAND.name}` };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuthScreen mode="login" />
    </Suspense>
  );
}
