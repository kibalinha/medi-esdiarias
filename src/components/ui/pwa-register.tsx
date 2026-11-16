"use client";

import * as React from "react";
import { syncManager } from "@/lib/offline";

export function PwaRegister() {
  React.useEffect(() => {
    syncManager.init();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Service worker registration optional in dev/test environments
        });
    }
  }, []);

  return null;
}
