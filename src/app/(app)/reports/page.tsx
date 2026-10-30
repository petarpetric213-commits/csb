"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function ReportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/reports/sales"); }, [router]);
  return <p className="p-6 text-sm text-muted-foreground">Redirecting…</p>;
}
