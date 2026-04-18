import {
  AuthenticatedFetchError,
  useAuthenticatedFetch,
} from "./useAuthenticatedFetch";
import type {
  BlindBox,
  BlindBoxActivationReadinessReport,
  BlindBoxAssignment,
  BlindBoxRewardGroupLink,
  BlindBoxPoolItem,
  BlindBoxProductMapping,
  CreateBlindBoxInput,
  InventoryExecutionReadinessReport,
  InventoryExecutionResult,
  InventoryDebugLocation,
  InventoryDebugProduct,
  InventoryDebugVariantInventory,
  InventoryOperation,
  RewardCandidatePreview,
  RewardGroup,
  UpsertBlindBoxRewardGroupLinkInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
  UpsertRewardGroupInput,
  WebhookEvent,
  WebhookEventStatus,
} from "../types/blindBox";

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
}

export class BlindBoxApiError extends Error {
  code: string;
  status: number;
  shouldRetry: boolean;

  constructor(
    message: string,
    options?: { code?: string; status?: number; shouldRetry?: boolean },
  ) {
    super(message);
    this.name = "BlindBoxApiError";
    this.code = options?.code || "UNKNOWN_ERROR";
    this.status = options?.status || 500;
    this.shouldRetry = options?.shouldRetry ?? false;
  }
}

function looksLikeJson(text: string): boolean {
  const trimmedText = text.trim();
  return trimmedText.startsWith("{") || trimmedText.startsWith("[");
}

function summarizeResponseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function buildNonJsonErrorMessage(response: Response, text: string): string {
  if (response.redirected) {
    return "The admin session is still initializing or needs reauthorization. Please retry once the embedded app finishes loading.";
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    return "The server returned an HTML page instead of JSON. The embedded admin session may still be initializing. Please retry.";
  }

  if (contentType.includes("text/plain")) {
    return `The server returned a text response instead of JSON: ${summarizeResponseText(
      text,
    )}`;
  }

  if (text.trim()) {
    return `The server returned a non-JSON response: ${summarizeResponseText(text)}`;
  }

  return "The server returned an empty non-JSON response.";
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let payload: ApiSuccessResponse<T> | ApiErrorResponse | null = null;

  if (text && (contentType.includes("application/json") || looksLikeJson(text))) {
    try {
      payload = JSON.parse(text) as ApiSuccessResponse<T> | ApiErrorResponse;
    } catch {
      throw new BlindBoxApiError(buildNonJsonErrorMessage(response, text), {
        code: "NON_JSON_RESPONSE",
        status: response.status,
        shouldRetry: true,
      });
    }
  } else if (text) {
    throw new BlindBoxApiError(buildNonJsonErrorMessage(response, text), {
      code: "NON_JSON_RESPONSE",
      status: response.status,
      shouldRetry: response.status < 500,
    });
  }

  if (!response.ok) {
    const errorMessage =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : `Request failed with status ${response.status}`;

    throw new BlindBoxApiError(errorMessage, {
      code: payload && "error" in payload ? payload.error?.code : undefined,
      status: response.status,
      shouldRetry: response.status < 500,
    });
  }

  if (!payload || !("success" in payload) || !payload.success) {
    throw new BlindBoxApiError("The server returned an unexpected response.", {
      code: "UNEXPECTED_RESPONSE",
      status: response.status,
      shouldRetry: true,
    });
  }

  return payload.data;
}

export function useBlindBoxAdminApi() {
  const {
    authenticatedFetch,
    isReady,
    initializationError,
    retryInitialization,
  } = useAuthenticatedFetch();

  async function request<T>(
    path: string,
    options?: RequestInit & { json?: unknown }
  ): Promise<T> {
    const { json, headers, body, ...restOptions } = options || {};
    const nextHeaders = new Headers(headers);
    nextHeaders.set("Accept", "application/json");
    if (json !== undefined) {
      nextHeaders.set("Content-Type", "application/json");
    }

    let response: Response;

    try {
      response = await authenticatedFetch(path, {
        ...restOptions,
        headers: nextHeaders,
        body: json !== undefined ? JSON.stringify(json) : body,
      });
    } catch (error) {
      if (error instanceof BlindBoxApiError) {
        throw error;
      }

      if (error instanceof AuthenticatedFetchError) {
        throw new BlindBoxApiError(error.message, {
          code: error.code,
          status: error.status,
          shouldRetry: error.shouldRetry,
        });
      }

      throw new BlindBoxApiError(
        error instanceof Error ? error.message : "Request failed before a response was received.",
        {
          code: "REQUEST_FAILED",
          status: 500,
          shouldRetry: true,
        },
      );
    }

    return parseApiResponse<T>(response);
  }

  return {
    isReady,
    initializationError,
    retryInitialization,
    listBlindBoxes: () => request<BlindBox[]>("/api/blind-box/pools"),
    updateBlindBox: (blindBoxId: string, input: CreateBlindBoxInput) =>
      request<BlindBox>(`/api/blind-box/pools/${blindBoxId}`, {
        method: "PUT",
        json: input,
      }),
    getBlindBoxReadiness: (blindBoxId: string) =>
      request<BlindBoxActivationReadinessReport>(
        `/api/blind-box/pools/${encodeURIComponent(blindBoxId)}/readiness`,
      ),
    getRewardCandidatePreview: (blindBoxId: string) =>
      request<RewardCandidatePreview>(
        `/api/blind-box/pools/${encodeURIComponent(blindBoxId)}/reward-candidates`,
      ),
    listRewardGroups: () =>
      request<RewardGroup[]>("/api/blind-box/reward-groups"),
    upsertRewardGroup: (input: UpsertRewardGroupInput) =>
      request<RewardGroup>("/api/blind-box/reward-groups", {
        method: "POST",
        json: input,
      }),
    listRewardGroupLinks: () =>
      request<BlindBoxRewardGroupLink[]>("/api/blind-box/reward-group-links"),
    upsertRewardGroupLink: (input: UpsertBlindBoxRewardGroupLinkInput) =>
      request<BlindBoxRewardGroupLink>("/api/blind-box/reward-group-links", {
        method: "POST",
        json: input,
      }),
    listPoolItems: (blindBoxId: string) =>
      request<BlindBoxPoolItem[]>(`/api/blind-box/pools/${blindBoxId}/items`),
    upsertPoolItem: (blindBoxId: string, input: UpsertBlindBoxPoolItemInput) =>
      request<BlindBoxPoolItem>(`/api/blind-box/pools/${blindBoxId}/items`, {
        method: "POST",
        json: input,
      }),
    listProductMappings: () =>
      request<BlindBoxProductMapping[]>("/api/blind-box/product-mappings"),
    upsertProductMapping: (input: UpsertBlindBoxProductMappingInput) =>
      request<BlindBoxProductMapping>("/api/blind-box/product-mappings", {
        method: "POST",
        json: input,
      }),
    listAssignments: () =>
      request<BlindBoxAssignment[]>("/api/blind-box/assignments"),
    listInventoryOperations: () =>
      request<InventoryOperation[]>("/api/blind-box/inventory-operations"),
    retryInventoryOperation: (operationId: string) =>
      request<InventoryExecutionResult>(
        `/api/blind-box/inventory-operations/${encodeURIComponent(operationId)}/retry`,
        {
          method: "POST",
        },
      ),
    getInventoryOperationExecutionReadiness: (operationId: string) =>
      request<InventoryExecutionReadinessReport>(
        `/api/blind-box/inventory-operations/${encodeURIComponent(operationId)}/execution-readiness`,
      ),
    getPoolItemExecutionReadiness: (poolItemId: string) =>
      request<InventoryExecutionReadinessReport>(
        `/api/blind-box/pool-items/${encodeURIComponent(poolItemId)}/execution-readiness`,
      ),
    listWebhookEvents: (filters?: {
      status?: WebhookEventStatus;
      topic?: string;
    }) => {
      const queryParams = new URLSearchParams();
      if (filters?.status) {
        queryParams.set("status", filters.status);
      }
      if (filters?.topic) {
        queryParams.set("topic", filters.topic);
      }

      const queryString = queryParams.toString();
      const path = queryString
        ? `/api/blind-box/webhook-events?${queryString}`
        : "/api/blind-box/webhook-events";

      return request<WebhookEvent[]>(path);
    },
    listDebugLocations: () =>
      request<InventoryDebugLocation[]>("/api/blind-box/debug/locations"),
    getDebugProduct: (productId: string) =>
      request<InventoryDebugProduct>(
        `/api/blind-box/debug/products/${encodeURIComponent(productId)}`
      ),
    getDebugCollection: (collectionId: string) =>
      request<{
        collection: {
          id: string;
          title: string | null;
          handle: string | null;
        };
        products: InventoryDebugProduct[];
        traceIds: string[];
      }>(
        `/api/blind-box/debug/collections/${encodeURIComponent(collectionId)}`
      ),
    getDebugVariantInventory: (variantId: string) =>
      request<InventoryDebugVariantInventory>(
        `/api/blind-box/debug/variants/${encodeURIComponent(variantId)}/inventory`
      ),
  };
}
