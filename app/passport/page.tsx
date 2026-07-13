"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* client-side redirect: reliable under static export (no server to run
   next/navigation's redirect() at request time) */
export default function PassportRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/myhouse");
  }, [router]);

  return null;
}
