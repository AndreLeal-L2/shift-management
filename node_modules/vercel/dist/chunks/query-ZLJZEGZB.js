import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
import {
  OBSERVABILITY_METRICS_PATH,
  fetchCustomMetricCatalog,
  fetchMetricDetailOrExit,
  getDefaultAggregation
} from "./chunk-QCVKGY2A.js";
import {
  computeGranularity,
  formatText,
  getDefaultCustomMetricAggregation,
  isCanonicalAggregation
} from "./chunk-JYEO6OJS.js";
import {
  formatErrorJson,
  formatQueryJson,
  getRollupColumnName,
  handleApiError
} from "./chunk-NM43FFV6.js";
import "./chunk-5AJPMLDV.js";
import "./chunk-A3NYPUKZ.js";
import {
  resolveTimeRange,
  validateAllProjectMutualExclusivity
} from "./chunk-P65EEFTR.js";
import "./chunk-VDJN4WKH.js";
import {
  validateJsonOutput
} from "./chunk-KXDWXXJH.js";
import {
  metricsCommand
} from "./chunk-CSJBZKC5.js";
import "./chunk-VXYGCOKL.js";
import {
  getLinkedProject,
  getProjectByNameOrId,
  getScope
} from "./chunk-VE545BR3.js";
import "./chunk-ECCWJHC6.js";
import "./chunk-TJLBCLEX.js";
import "./chunk-GGP5R3FU.js";
import {
  printError
} from "./chunk-VAFU7DXZ.js";
import {
  parseArguments
} from "./chunk-XLKFJPMT.js";
import {
  ProjectNotFound,
  getFlagsSpecification,
  isAPIError
} from "./chunk-SOFC4MLS.js";
import "./chunk-P4QNYOFB.js";
import "./chunk-52QYYTM5.js";
import {
  output_manager_default
} from "./chunk-OX7KI3LF.js";
import "./chunk-S7KYDPEM.js";
import "./chunk-TZ2YI2VH.js";

// src/commands/metrics/validation.ts
function validateRequiredMetric(metric) {
  if (metric) {
    return { valid: true, value: metric };
  }
  return {
    valid: false,
    code: "MISSING_METRIC",
    message: "Missing required metric. Specify the metric to query.\n\nRun 'vercel metrics schema' to see available metrics."
  };
}
function validateOrderDirection(orderDirection) {
  if (orderDirection === void 0) {
    return { valid: true, value: void 0 };
  }
  if (orderDirection === "asc" || orderDirection === "desc") {
    return { valid: true, value: orderDirection };
  }
  return {
    valid: false,
    code: "INVALID_ORDER",
    message: `Invalid order "${orderDirection}". Use "asc" or "desc".`,
    allowedValues: ["asc", "desc"]
  };
}
function validateOrderBy(orderBy) {
  if (orderBy === void 0) {
    return { valid: true, value: void 0 };
  }
  if (orderBy === "value" || orderBy === "count") {
    return { valid: true, value: orderBy };
  }
  return {
    valid: false,
    code: "INVALID_ORDER_BY",
    message: `Invalid order-by "${orderBy}". Use "value" or "count".`,
    allowedValues: ["value", "count"]
  };
}

// src/commands/metrics/query.ts
function handleValidationError(result, jsonOutput, client) {
  if (jsonOutput) {
    client.stdout.write(
      formatErrorJson(result.code, result.message, result.allowedValues)
    );
  } else {
    output_manager_default.error(result.message);
    if (result.allowedValues && result.allowedValues.length > 0) {
      output_manager_default.print(`
Available values: ${result.allowedValues.join(", ")}
`);
    }
  }
  return 1;
}
var PRODUCTION_ENVIRONMENT_FILTER = "environment eq 'production'";
var CUSTOM_METRIC_VALUE_ALIAS = "value";
var CUSTOM_METRIC_COUNT_ALIAS = "__seriesCount";
function combineFilters(filters, prod) {
  const nonEmptyFilters = [
    ...filters?.filter((filter) => filter.length > 0) ?? [],
    ...prod ? [PRODUCTION_ENVIRONMENT_FILTER] : []
  ];
  if (nonEmptyFilters.length === 0) {
    return void 0;
  }
  if (nonEmptyFilters.length === 1) {
    return nonEmptyFilters[0];
  }
  return nonEmptyFilters.map((filter) => `(${filter})`).join(" and ");
}
function getRequestOrderBy(metric, aggregation, orderBy) {
  return orderBy === "value" ? getRollupColumnName(metric, aggregation) : void 0;
}
function toBucketSeconds(granularity) {
  if ("minutes" in granularity)
    return granularity.minutes * 60;
  if ("hours" in granularity)
    return granularity.hours * 60 * 60;
  return granularity.days * 24 * 60 * 60;
}
function alignTimeRangeToGranularity(startTime, endTime, granularity) {
  const bucketMs = toBucketSeconds(granularity) * 1e3;
  return {
    startTime: new Date(Math.floor(startTime.getTime() / bucketMs) * bucketMs),
    endTime: new Date(Math.ceil(endTime.getTime() / bucketMs) * bucketMs)
  };
}
function toCanonicalMetricSelection(metric, aggregation) {
  if (aggregation === "persecond") {
    return { metric, aggregation: "sum", per: "second" };
  }
  if (aggregation === "percent") {
    return { metric, aggregation: "sum", normalize: "percent" };
  }
  if (aggregation === "unique") {
    return {
      valid: false,
      code: "UNSUPPORTED_AGGREGATION",
      message: "The unique aggregation for custom metrics requires an explicit distinct dimension, which vc metrics does not support yet."
    };
  }
  if (isCanonicalAggregation(aggregation)) {
    return { metric, aggregation };
  }
  return {
    valid: false,
    code: "INVALID_AGGREGATION",
    message: `Aggregation "${aggregation}" is not supported for custom metrics.`
  };
}
function createCanonicalMetricsRequest(options) {
  const metrics = {
    [CUSTOM_METRIC_VALUE_ALIAS]: options.selection
  };
  let rankMetric = CUSTOM_METRIC_VALUE_ALIAS;
  if (options.groupBy.length > 0 && options.orderBy !== "value" && options.selection.aggregation !== "count") {
    metrics[CUSTOM_METRIC_COUNT_ALIAS] = {
      metric: options.metric,
      aggregation: "count"
    };
    rankMetric = CUSTOM_METRIC_COUNT_ALIAS;
  }
  return {
    scope: {
      ownerId: options.scope.ownerId,
      ...options.scope.type === "project" ? { projectIds: options.scope.projectIds } : {}
    },
    timeRange: {
      start: options.startTime.toISOString(),
      end: options.endTime.toISOString()
    },
    bucketSeconds: toBucketSeconds(options.granularity),
    ...options.groupBy.length > 0 ? { groupBy: options.groupBy } : {},
    ...options.filter ? { filter: options.filter } : {},
    metrics,
    outputs: [CUSTOM_METRIC_VALUE_ALIAS],
    ...options.groupBy.length > 0 ? {
      seriesSelection: {
        limit: options.limit,
        mode: "exact",
        rankBy: [
          {
            metric: rankMetric,
            direction: options.orderDirection ?? "desc"
          }
        ]
      }
    } : {}
  };
}
function canonicalResponseToMetricsResponse(response, rollupColumn, orderBy, orderDirection) {
  const toRow = (point) => ({
    ...point.dimensions,
    [rollupColumn]: point.values[CUSTOM_METRIC_VALUE_ALIAS] ?? null
  });
  return {
    ...response.series ? {
      data: response.series.map((point) => ({
        timestamp: point.timestamp,
        ...toRow(point)
      }))
    } : {},
    summary: response.summary.map(toRow),
    statistics: {
      rowsRead: response.meta.statistics.rowsRead,
      bytesRead: response.meta.statistics.bytesRead,
      dbTimeSeconds: response.meta.statistics.databaseElapsedMs / 1e3,
      engineTimeSeconds: response.meta.statistics.elapsedMs / 1e3,
      queryTable: [...new Set(response.meta.sources.map((source) => source.id))].sort().join(",")
    },
    ...orderBy ? { orderBy } : {},
    ...orderDirection ? { orderDirection } : {}
  };
}
async function resolveQueryScope(client, opts) {
  if (opts.project || opts.all) {
    const { team } = await getScope(client);
    if (!team) {
      const errMsg = "No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.";
      if (opts.jsonOutput) {
        client.stdout.write(formatErrorJson("NO_TEAM", errMsg));
      } else {
        output_manager_default.error(errMsg);
      }
      return 1;
    }
    if (opts.all) {
      return {
        scope: { type: "owner", ownerId: team.id },
        accountId: team.id,
        teamName: team.slug
      };
    }
    const project = await getProjectByNameOrId(client, opts.project, team.id);
    if (project instanceof ProjectNotFound) {
      const errMsg = `Project "${opts.project}" was not found in team "${team.slug}".`;
      if (opts.jsonOutput) {
        client.stdout.write(formatErrorJson("PROJECT_NOT_FOUND", errMsg));
      } else {
        output_manager_default.error(errMsg);
      }
      return 1;
    }
    return {
      scope: {
        type: "project",
        ownerId: team.id,
        projectIds: [project.id]
      },
      accountId: team.id,
      teamName: team.slug,
      projectName: project.name
    };
  }
  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === "error") {
    return linkedProject.exitCode;
  }
  if (linkedProject.status === "not_linked") {
    const errMsg = "No linked project found. Run `vercel link` to link a project, or use --project <name-or-id> or --all.";
    if (opts.jsonOutput) {
      client.stdout.write(formatErrorJson("NOT_LINKED", errMsg));
    } else {
      output_manager_default.error(errMsg);
    }
    return 1;
  }
  return {
    scope: {
      type: "project",
      ownerId: linkedProject.org.id,
      projectIds: [linkedProject.project.id]
    },
    accountId: linkedProject.org.id,
    teamName: linkedProject.org.slug,
    projectName: linkedProject.project.name
  };
}
async function query(client, telemetry) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(metricsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const flags = parsedArgs.flags;
  const positionalArgs = parsedArgs.args.slice(1);
  const positionalMetric = positionalArgs[0] === "query" ? positionalArgs[1] : positionalArgs[0];
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output_manager_default.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  const metricFlag = positionalMetric;
  const aggregationFlag = flags["--aggregation"];
  const groupBy = flags["--group-by"] ?? [];
  const limit = flags["--limit"];
  const orderByInput = typeof flags["--order-by"] === "string" ? flags["--order-by"].trim().toLowerCase() : void 0;
  const orderInput = typeof flags["--order"] === "string" ? flags["--order"].trim().toLowerCase() : void 0;
  const filters = flags["--filter"];
  const prod = flags["--prod"];
  const filter = combineFilters(filters, prod);
  const since = flags["--since"];
  const until = flags["--until"];
  const granularity = flags["--granularity"];
  const bucketTimezone = flags["--bucket-timezone"]?.trim();
  const project = flags["--project"];
  const all = flags["--all"];
  telemetry.trackCliArgumentMetricId(metricFlag);
  telemetry.trackCliOptionAggregation(aggregationFlag);
  telemetry.trackCliOptionGroupBy(groupBy.length > 0 ? groupBy : void 0);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionOrderBy(orderByInput);
  telemetry.trackCliOptionOrder(orderInput);
  telemetry.trackCliOptionFilter(filters);
  telemetry.trackCliFlagProd(prod);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliOptionBucketTimezone(bucketTimezone);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionFormat(flags["--format"]);
  const orderByResult = validateOrderBy(orderByInput);
  if (!orderByResult.valid) {
    return handleValidationError(orderByResult, jsonOutput, client);
  }
  const orderByMode = orderByResult.value;
  const requiredMetric = validateRequiredMetric(metricFlag);
  if (!requiredMetric.valid) {
    return handleValidationError(requiredMetric, jsonOutput, client);
  }
  const metric = requiredMetric.value;
  const mutualResult = validateAllProjectMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }
  const orderDirectionResult = validateOrderDirection(orderInput);
  if (!orderDirectionResult.valid) {
    return handleValidationError(orderDirectionResult, jsonOutput, client);
  }
  const orderDirection = orderDirectionResult.value;
  const scopeResult = await resolveQueryScope(client, {
    project,
    all,
    jsonOutput
  });
  if (typeof scopeResult === "number") {
    return scopeResult;
  }
  const { scope, accountId, teamName, projectName } = scopeResult;
  let startTime;
  let endTime;
  try {
    ({ startTime, endTime } = resolveTimeRange(since, until));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (jsonOutput) {
      client.stdout.write(formatErrorJson("INVALID_TIME", errMsg));
    } else {
      output_manager_default.error(errMsg);
    }
    return 1;
  }
  const isPlatformMetric = metric.startsWith("vercel.");
  let metricUnit;
  let aggregationInput;
  let customMetricAggregations;
  if (isPlatformMetric) {
    const detailOrExitCode = await fetchMetricDetailOrExit(
      client,
      accountId,
      metric,
      jsonOutput
    );
    if (typeof detailOrExitCode === "number") {
      return detailOrExitCode;
    }
    aggregationInput = aggregationFlag ?? getDefaultAggregation(detailOrExitCode, metric) ?? "sum";
    metricUnit = detailOrExitCode.find((item) => item.id === metric)?.unit ?? "count";
  } else {
    const customMetric = await fetchCustomMetricCatalog(
      client,
      accountId,
      metric,
      startTime.toISOString()
    ).then((metrics) => metrics.find((item) => item.id === metric)).catch(() => void 0);
    metricUnit = customMetric?.unit ?? "units";
    customMetricAggregations = customMetric?.aggregations;
    aggregationInput = aggregationFlag ?? getDefaultCustomMetricAggregation(metricUnit, customMetricAggregations);
  }
  const aggregation = aggregationInput;
  const orderBy = getRequestOrderBy(metric, aggregation, orderByMode);
  const rangeMs = endTime.getTime() - startTime.getTime();
  const granResult = computeGranularity(rangeMs, granularity);
  const queryTimeRange = isPlatformMetric ? { startTime, endTime } : alignTimeRangeToGranularity(startTime, endTime, granResult.duration);
  if (!jsonOutput && granResult.adjusted && granResult.notice) {
    output_manager_default.log(`Notice: ${granResult.notice}`);
  }
  let body;
  if (isPlatformMetric) {
    body = {
      scope,
      metric,
      aggregation,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      granularity: granResult.duration,
      ...bucketTimezone ? { bucketTimezone } : {},
      ...groupBy.length > 0 ? { groupBy } : {},
      ...filter ? { filter } : {},
      limit: limit ?? 10,
      ...orderBy ? { orderBy } : {},
      ...orderDirection ? { orderDirection } : {}
    };
  } else {
    if (bucketTimezone) {
      return handleValidationError(
        {
          valid: false,
          code: "UNSUPPORTED_BUCKET_TIMEZONE",
          message: "--bucket-timezone is not supported for custom metrics yet."
        },
        jsonOutput,
        client
      );
    }
    const selection = toCanonicalMetricSelection(metric, aggregation);
    if ("valid" in selection) {
      return handleValidationError(selection, jsonOutput, client);
    }
    const supportedAggregation = selection.aggregation;
    if (customMetricAggregations && !customMetricAggregations.includes(supportedAggregation)) {
      return handleValidationError(
        {
          valid: false,
          code: "INVALID_AGGREGATION",
          message: `Aggregation "${aggregation}" is not valid for custom metric "${metric}".`,
          allowedValues: [...customMetricAggregations]
        },
        jsonOutput,
        client
      );
    }
    body = createCanonicalMetricsRequest({
      scope,
      metric,
      selection,
      startTime: queryTimeRange.startTime,
      endTime: queryTimeRange.endTime,
      granularity: granResult.duration,
      groupBy,
      filter,
      limit: limit ?? 10,
      orderBy: orderByMode,
      orderDirection
    });
  }
  if (!jsonOutput) {
    output_manager_default.spinner("Querying metrics...");
  }
  let response;
  try {
    if (isPlatformMetric) {
      response = await client.fetch(
        "/v2/observability/query",
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          accountId,
          bailOn429: true
        }
      );
    } else {
      const canonicalResponse = await client.fetch(
        OBSERVABILITY_METRICS_PATH,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          accountId,
          bailOn429: true
        }
      );
      response = canonicalResponseToMetricsResponse(
        canonicalResponse,
        getRollupColumnName(metric, aggregation),
        groupBy.length > 0 ? orderByMode ?? "count" : void 0,
        groupBy.length > 0 ? orderDirection ?? "desc" : void 0
      );
    }
  } catch (err) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (jsonOutput) {
      client.stdout.write(formatErrorJson("NETWORK_ERROR", errMsg));
    } else {
      output_manager_default.error(errMsg);
    }
    return 1;
  } finally {
    if (!jsonOutput) {
      output_manager_default.stopSpinner();
    }
  }
  if (jsonOutput) {
    client.stdout.write(
      formatQueryJson(
        {
          metric,
          aggregation,
          groupBy,
          filter,
          startTime: queryTimeRange.startTime.toISOString(),
          endTime: queryTimeRange.endTime.toISOString(),
          granularity: granResult.duration,
          ...bucketTimezone ? { bucketTimezone } : {},
          ...orderByMode ? { orderBy: orderByMode } : {},
          ...orderDirection ? { orderDirection } : {}
        },
        response
      )
    );
  } else {
    client.stdout.write(
      formatText(response, {
        metric,
        metricUnit,
        aggregation,
        groupBy,
        filter,
        scope,
        projectName,
        teamName,
        periodStart: queryTimeRange.startTime.toISOString(),
        periodEnd: queryTimeRange.endTime.toISOString(),
        granularity: granResult.duration,
        bucketTimezone,
        orderBy: orderByMode,
        orderDirection
      })
    );
  }
  return 0;
}
export {
  query as default
};
