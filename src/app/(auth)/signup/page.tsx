import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth";
import { signupAction } from "../actions";
import { SignupClient } from "./client";

export const metadata: Metadata = { title: "Open your store", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/dashboard");
  return <SignupClient action={signupAction} />;
}
