"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrCreateBrowserDoctorKey } from "@/lib/doctor-key-store";

type KeyStatus = "initializing" | "ready" | "error";

export function DoctorKeyBootstrap() {
  const [status, setStatus] = useState<KeyStatus>("initializing");

  const register = useCallback(async (signal?: AbortSignal) => {
    setStatus("initializing");
    try {
      const key = await getOrCreateBrowserDoctorKey();
      const response = await fetch("/api/doctor-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id, publicKey: key.publicKey }),
        signal,
      });
      if (!response.ok) throw new Error("Doctor key registration failed");
      setStatus("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void register(controller.signal);
    return () => controller.abort();
  }, [register]);

  if (status === "error") {
    return (
      <button className="key-status key-status-error" onClick={() => void register()}>
        Encryption key unavailable · retry
      </button>
    );
  }
  return (
    <span className={`key-status ${status === "ready" ? "key-status-ready" : ""}`}>
      {status === "ready" ? "Doctor-only key ready" : "Preparing encryption key…"}
    </span>
  );
}
