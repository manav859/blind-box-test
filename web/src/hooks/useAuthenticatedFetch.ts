import { useEffect, useState } from "react";
import { Redirect, shared } from "@shoplinedev/appbridge";
import { useAppBridge } from "./useAppBridge";
import {
  getEmbeddedDocumentUrl,
  getEmbeddedSearchParams,
  resolveEmbeddedUrl,
} from "../utils/embeddedUrl";

const SESSION_INIT_RETRIES = 3;
const SESSION_INIT_DELAY_MS = 250;

export class AuthenticatedFetchError extends Error {
  code: string;
  status: number;
  shouldRetry: boolean;

  constructor(
    message: string,
    options?: { code?: string; status?: number; shouldRetry?: boolean },
  ) {
    super(message);
    this.name = "AuthenticatedFetchError";
    this.code = options?.code || "AUTHENTICATED_FETCH_ERROR";
    this.status = options?.status || 500;
    this.shouldRetry = options?.shouldRetry ?? false;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getSearchParams() {
  return getEmbeddedSearchParams();
}

function buildRequestUrl(uri: string) {
  const currentUrl = getEmbeddedDocumentUrl();
  const requestUrl = new URL(uri, currentUrl.origin);

  if (requestUrl.origin !== currentUrl.origin || !requestUrl.pathname.startsWith("/api/")) {
    return requestUrl.toString();
  }

  const currentSearch = currentUrl.searchParams;
  const requestSearch = requestUrl.searchParams;
  const embeddedContextKeys = ["handle", "host", "lang", "appkey"];

  for (const key of embeddedContextKeys) {
    const currentValue = currentSearch.get(key);
    if (currentValue && !requestSearch.has(key)) {
      requestSearch.set(key, currentValue);
    }
  }

  return `${requestUrl.pathname}${requestUrl.search}`;
}

function isEmbeddedRequestContext() {
  const search = getSearchParams();
  return Boolean(search.get("host") || search.get("lang") || search.get("appkey"));
}

function normalizeSessionInitializationError(error: unknown): AuthenticatedFetchError {
  if (error instanceof AuthenticatedFetchError) {
    return error;
  }

  const detail =
    error instanceof Error && error.message
      ? ` ${error.message}`
      : "";

  return new AuthenticatedFetchError(
    `The embedded admin session is still initializing. Please wait a moment and retry.${detail}`,
    {
      code: "EMBEDDED_SESSION_NOT_READY",
      status: 401,
      shouldRetry: true,
    },
  );
}

async function getSessionTokenWithRetry(app: any): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < SESSION_INIT_RETRIES; attempt += 1) {
    try {
      return await shared.getSessionToken(app);
    } catch (error) {
      lastError = error;

      if (attempt < SESSION_INIT_RETRIES - 1) {
        await wait(SESSION_INIT_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw normalizeSessionInitializationError(lastError);
}

function getReauthorizationUrl(headers: Headers) {
  if (headers.get("X-SHOPLINE-API-Request-Failure-Reauthorize") !== "1") {
    return null;
  }

  return (
    headers.get("X-SHOPLINE-API-Request-Failure-Reauthorize-Url") || "/api/auth"
  );
}

function buildReauthorizationUrl(authUrl: string) {
  const currentUrl = getEmbeddedDocumentUrl();
  const reauthorizationUrl = resolveEmbeddedUrl(authUrl);
  const currentSearch = currentUrl.searchParams;
  const nextSearch = reauthorizationUrl.searchParams;
  const embeddedContextKeys = ["handle", "host", "lang", "appkey"];

  for (const key of embeddedContextKeys) {
    const currentValue = currentSearch.get(key);
    if (currentValue && !nextSearch.has(key)) {
      nextSearch.set(key, currentValue);
    }
  }

  if (reauthorizationUrl.origin !== currentUrl.origin) {
    return reauthorizationUrl.toString();
  }

  return `${reauthorizationUrl.pathname}${reauthorizationUrl.search}`;
}

function redirectToReauthorization(authUrl: string, app: any) {
  const resolvedAuthUrl = buildReauthorizationUrl(authUrl);
  const redirect = Redirect.create(app);
  redirect.replaceTo(
    resolvedAuthUrl.startsWith("http")
      ? resolvedAuthUrl
      : resolveEmbeddedUrl(resolvedAuthUrl).toString(),
  );
}

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  const isEmbedded = isEmbeddedRequestContext();
  const [isReady, setIsReady] = useState(!isEmbedded);
  const [initializationError, setInitializationError] = useState<Error | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function primeSession() {
      if (!isEmbedded) {
        setIsReady(true);
        setInitializationError(null);
        return;
      }

      setIsReady(false);
      setInitializationError(null);

      try {
        await getSessionTokenWithRetry(app);
        if (!isActive) {
          return;
        }

        setIsReady(true);
        setInitializationError(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setIsReady(false);
        setInitializationError(
          error instanceof Error
            ? error
            : normalizeSessionInitializationError(error),
        );
      }
    }

    primeSession();

    return () => {
      isActive = false;
    };
  }, [app, isEmbedded, initializationAttempt]);

  async function authenticatedFetch(
    uri: string,
    options?: RequestInit & Record<string, unknown>,
  ) {
    let token: string | undefined;

    if (isEmbedded) {
      token = await getSessionTokenWithRetry(app);
      setIsReady(true);
      setInitializationError(null);
    }

    const { headers, ...restOptions } = options || {};
    const nextHeaders = new Headers(headers as HeadersInit | undefined);
    nextHeaders.set("X-Requested-With", "XMLHttpRequest");
    if (token) {
      nextHeaders.set("Authorization", `Bearer ${token}`);
    } else {
      nextHeaders.delete("Authorization");
    }

    const response = await fetch(buildRequestUrl(uri), {
      ...restOptions,
      headers: nextHeaders,
    });

    const reauthorizationUrl = getReauthorizationUrl(response.headers);
    if (reauthorizationUrl) {
      redirectToReauthorization(reauthorizationUrl, app);
      throw new AuthenticatedFetchError(
        "The admin session needs to be refreshed. Redirecting to SHOPLINE authentication.",
        {
          code: "SHOPLINE_REAUTHORIZE_PENDING",
          status: 403,
          shouldRetry: true,
        },
      );
    }

    return response;
  }

  return {
    authenticatedFetch,
    isReady,
    initializationError,
    retryInitialization: () =>
      setInitializationAttempt((currentValue) => currentValue + 1),
  };
}
