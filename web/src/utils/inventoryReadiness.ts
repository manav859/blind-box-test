import type {
  InventoryExecutionReadinessIssue,
  InventoryExecutionReadinessReport,
} from "../types/blindBox";

export interface InventoryReadinessDisplay {
  badgeValue:
    | "ready"
    | "missing_location"
    | "missing_variant"
    | "missing_inventory_item"
    | "untracked_inventory"
    | "location_linkage_missing"
    | "scope_config_issue"
    | "admin_session_required"
    | "needs_review";
  title: string;
  summary: string;
  fixRecommendation: string | null;
  primaryIssue: InventoryExecutionReadinessIssue | null;
}

function describeIssue(
  issue: InventoryExecutionReadinessIssue,
): Pick<InventoryReadinessDisplay, "badgeValue" | "title"> {
  switch (issue.code) {
    case "SHOPLINE_LOCATION_UNRESOLVED":
    case "SHOPLINE_LOCATION_CONFIGURED_NOT_FOUND":
      return {
        badgeValue: "missing_location",
        title: "Missing location",
      };
    case "SHOPLINE_SOURCE_PRODUCT_MISSING":
    case "SHOPLINE_VARIANT_REQUIRED":
    case "SHOPLINE_PRODUCT_VARIANT_MISSING":
      return {
        badgeValue: "missing_variant",
        title: "Missing variant",
      };
    case "SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING":
      return {
        badgeValue: "missing_inventory_item",
        title: "Missing inventory item",
      };
    case "SHOPLINE_INVENTORY_NOT_TRACKED":
    case "SHOPLINE_INVENTORY_TRACKING_STATE_MISSING":
      return {
        badgeValue: "untracked_inventory",
        title: "Untracked inventory",
      };
    case "SHOPLINE_INVENTORY_LEVEL_MISSING":
    case "SHOPLINE_CONFIGURED_LOCATION_NOT_LINKED":
      return {
        badgeValue: "location_linkage_missing",
        title: "Location linkage missing",
      };
    case "SHOPLINE_CONFIGURED_SCOPES_MISSING":
    case "SHOPLINE_INVENTORY_HTTP_ERROR":
    case "SHOPLINE_INVENTORY_NETWORK_ERROR":
      return {
        badgeValue: "scope_config_issue",
        title: "Scope / config issue",
      };
    case "SHOPLINE_ACCESS_TOKEN_MISSING":
      return {
        badgeValue: "admin_session_required",
        title: "Admin session required",
      };
    default:
      return {
        badgeValue: "needs_review",
        title: "Needs review",
      };
  }
}

export function describeInventoryReadiness(
  report: InventoryExecutionReadinessReport | null | undefined,
): InventoryReadinessDisplay {
  if (!report) {
    return {
      badgeValue: "needs_review",
      title: "Not checked",
      summary: "Run the execute-mode readiness check to validate the connected store setup.",
      fixRecommendation: null,
      primaryIssue: null,
    };
  }

  if (report.status === "ready") {
    return {
      badgeValue: "ready",
      title: "Ready",
      summary: report.summary,
      fixRecommendation: null,
      primaryIssue: null,
    };
  }

  const primaryIssue = report.issues[0] || null;
  if (!primaryIssue) {
    return {
      badgeValue: "needs_review",
      title: "Needs review",
      summary: report.summary,
      fixRecommendation: null,
      primaryIssue: null,
    };
  }

  const issueDescription = describeIssue(primaryIssue);
  return {
    badgeValue: issueDescription.badgeValue,
    title: issueDescription.title,
    summary: primaryIssue.message,
    fixRecommendation: primaryIssue.fixRecommendation,
    primaryIssue,
  };
}
