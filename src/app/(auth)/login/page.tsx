import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth";
import { loginAction } from "../actions";
import { AuthClient } from "./client";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  return <AuthClient action={loginAction} />;
}
