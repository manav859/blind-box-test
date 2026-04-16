import { useEffect } from "react";
import { Redirect } from "@shoplinedev/appbridge";
import { useAppBridge } from "../hooks/useAppBridge";
import { getEmbeddedSearchParams, resolveEmbeddedUrl } from "../utils/embeddedUrl";

export default function ExitIframe() {
  const app = useAppBridge();

  useEffect(() => {
    const search = getEmbeddedSearchParams();
    const redirectUri = search.get("redirectUri");
    if (!redirectUri) {
      return;
    }

    const redirect = Redirect.create(app);
    redirect.replaceTo(resolveEmbeddedUrl(redirectUri).toString());
  }, [app]);

  return <></>
}
