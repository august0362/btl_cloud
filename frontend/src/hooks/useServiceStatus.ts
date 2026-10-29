import { useSyncExternalStore } from "react";
import { serviceMonitor } from "../api/serviceStatus";

export function useServiceStatus() {
  const snapshot = useSyncExternalStore(serviceMonitor.subscribe, serviceMonitor.getSnapshot);
  return { ...snapshot, unavailable: snapshot.checked && (snapshot.state === "offline" || snapshot.state === "reconnecting") };
}
