import { useRef } from "react";
import Client, { shared } from "@shoplinedev/appbridge";
import { getEmbeddedSearchParams } from "../utils/embeddedUrl";

export const useAppBridge = () => {
  const appRef = useRef<any>();
  const configKeyRef = useRef<string | null>(null);
  const search = getEmbeddedSearchParams();
  const appKey = search.get("appkey") || import.meta.env.VITE_APP_KEY;
  const host = shared.getHost();
  const configKey = `${appKey || ""}:${host || ""}`;

  if (!appRef.current || configKeyRef.current !== configKey) {
    appRef.current = Client.createApp({
      appKey,
      host,
    });
    configKeyRef.current = configKey;
  }

  return appRef.current;
};
