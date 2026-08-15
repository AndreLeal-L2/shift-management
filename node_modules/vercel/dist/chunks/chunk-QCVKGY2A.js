import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
import {
  formatErrorJson,
  handleApiError
} from "./chunk-NM43FFV6.js";
import {
  isAPIError
} from "./chunk-SOFC4MLS.js";
import {
  output_manager_default
} from "./chunk-OX7KI3LF.js";

// src/commands/metrics/schema-api.ts
var OBSERVABILITY_METRICS_PATH = "/metrics/v1";
var METRIC_CATALOG_PAGE_SIZE = 250;
function toMetricDetail(metric) {
  return {
    id: metric.id,
    description: metric.description,
    dimensions: metric.dimensions,
    unit: metric.unit,
    aggregations: metric.aggregations,
    defaultAggregation: metric.defaultAggregation
  };
}
function getDefaultAggregation(detail, metricId) {
  return detail.find((metric) => metric.id === metricId)?.defaultAggregation;
}
async function fetchMetricList(client, accountId) {
  const { metrics } = await client.fetch(
    "/v2/observability/schema",
    { accountId }
  );
  return metrics;
}
async function fetchCustomMetricCatalog(client, accountId, search, activeSince) {
  const metrics = [];
  let cursor = null;
  do {
    const searchParams = new URLSearchParams({
      limit: String(METRIC_CATALOG_PAGE_SIZE),
      kind: "custom"
    });
    if (search) {
      searchParams.set("search", search);
    }
    if (activeSince) {
      searchParams.set("activeSince", activeSince);
    }
    if (cursor) {
      searchParams.set("cursor", cursor);
    }
    const response = await client.fetch(
      `${OBSERVABILITY_METRICS_PATH}?${searchParams}`,
      { accountId }
    );
    metrics.push(
      ...response.metrics.map((metric) => ({
        id: metric.id,
        description: metric.description,
        dimensions: metric.dimensions,
        unit: metric.unit,
        aggregations: metric.aggregations
      }))
    );
    cursor = response.pagination.hasMore ? response.pagination.nextCursor : null;
  } while (cursor);
  return metrics.filter(
    (metric) => !metric.id.startsWith("vercel.") && (!search || metric.id.startsWith(search))
  ).sort((left, right) => left.id.localeCompare(right.id));
}
async function fetchCustomMetricDetail(client, accountId, metricId) {
  const metrics = await fetchCustomMetricCatalog(client, accountId, metricId);
  const exactMetric = metrics.find((metric) => metric.id === metricId);
  if (!exactMetric) {
    return metrics;
  }
  return [exactMetric];
}
async function fetchMetricDetail(client, accountId, metricId) {
  const detail = await client.fetch(
    `/v2/observability/schema/${encodeURIComponent(metricId)}`,
    { accountId }
  );
  return detail.map(toMetricDetail);
}
async function fetchSchemaOrExit(client, jsonOutput, operation) {
  try {
    return await operation();
  } catch (err) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client, {
        401: {
          code: "SCHEMA_UNAUTHORIZED",
          message: "The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again."
        },
        403: {
          code: "SCHEMA_UNAUTHORIZED",
          message: "The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again."
        }
      });
    }
    const message = err instanceof Error ? `Failed to fetch metrics schema: ${err.message}` : `Failed to fetch metrics schema: ${String(err)}`;
    if (jsonOutput) {
      client.stdout.write(formatErrorJson("SCHEMA_FETCH_FAILED", message));
    } else {
      output_manager_default.error(message);
    }
    return 1;
  }
}
function fetchCustomMetricDetailOrExit(client, accountId, jsonOutput, metricId) {
  return fetchSchemaOrExit(
    client,
    jsonOutput,
    () => fetchCustomMetricDetail(client, accountId, metricId)
  );
}
function fetchCombinedMetricListOrExit(client, accountId, jsonOutput) {
  return fetchSchemaOrExit(client, jsonOutput, async () => {
    const [platformMetrics, customMetrics] = await Promise.all([
      fetchMetricList(client, accountId),
      fetchCustomMetricCatalog(client, accountId).catch(() => [])
    ]);
    return [
      ...platformMetrics.filter((metric) => metric.id.startsWith("vercel.")),
      ...customMetrics.map(({ id, description }) => ({ id, description }))
    ].sort((left, right) => left.id.localeCompare(right.id));
  });
}
async function fetchMetricDetailOrExit(client, accountId, metricId, jsonOutput) {
  return fetchSchemaOrExit(
    client,
    jsonOutput,
    () => fetchMetricDetail(client, accountId, metricId)
  );
}

export {
  OBSERVABILITY_METRICS_PATH,
  getDefaultAggregation,
  fetchCustomMetricCatalog,
  fetchCustomMetricDetailOrExit,
  fetchCombinedMetricListOrExit,
  fetchMetricDetailOrExit
};
