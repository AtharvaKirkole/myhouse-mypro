/*
 * Metrics — Prometheus text exposition, no client library needed.
 * Counters + latency histogram per route; domain counters for AI, events,
 * and notifications. OpenTelemetry exporters hang off these same hooks.
 */

const counters = new Map<string, number>();

const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];
const histogram = {
  buckets: new Map<number, number>(BUCKETS.map((b) => [b, 0])),
  sum: 0,
  count: 0,
};

function esc(v: string): string {
  return v.replace(/[^a-zA-Z0-9_:/.\- ]/g, "_");
}

export function inc(name: string, labels: Record<string, string | number> = {}, by = 1) {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(",");
  const key = labelStr ? `${name}{${labelStr}}` : name;
  counters.set(key, (counters.get(key) ?? 0) + by);
}

export function observeRequest(route: string, method: string, status: number, ms: number) {
  inc("http_requests_total", { route, method, status });
  if (status >= 500) inc("http_errors_total", { route });
  histogram.sum += ms;
  histogram.count += 1;
  for (const b of BUCKETS) if (ms <= b) histogram.buckets.set(b, (histogram.buckets.get(b) ?? 0) + 1);
}

export function renderPrometheus(): string {
  const lines: string[] = [
    "# HELP http_request_duration_ms Request latency",
    "# TYPE http_request_duration_ms histogram",
  ];
  for (const [b, n] of histogram.buckets) lines.push(`http_request_duration_ms_bucket{le="${b}"} ${n}`);
  lines.push(`http_request_duration_ms_bucket{le="+Inf"} ${histogram.count}`);
  lines.push(`http_request_duration_ms_sum ${histogram.sum}`);
  lines.push(`http_request_duration_ms_count ${histogram.count}`);
  lines.push("# TYPE http_requests_total counter");
  for (const [key, val] of counters) lines.push(`${key} ${val}`);
  return lines.join("\n") + "\n";
}
