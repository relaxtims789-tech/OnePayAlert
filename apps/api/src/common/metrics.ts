import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics. Labels are kept low-cardinality: route patterns (never raw URLs), no ids,
 * no company names.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'onepay-api' });

export const httpDuration = new Histogram({
  name: 'onepay_http_request_duration_seconds',
  help: 'HTTP request duration by route pattern and status code',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const paymentEvents = new Counter({
  name: 'onepay_payment_events_total',
  help: 'Payments stored or changed by the ingestion pipeline',
  labelNames: ['kind', 'status', 'simulated'] as const,
  registers: [registry],
});

export const alertsSent = new Counter({
  name: 'onepay_payment_alerts_total',
  help: 'Payment alerts sent per channel (push, soundbox) and outcome',
  labelNames: ['channel', 'result'] as const,
  registers: [registry],
});

export const dependencyUp = new Gauge({
  name: 'onepay_dependency_up',
  help: '1 when a dependency is reachable (updated on every scrape)',
  labelNames: ['dependency'] as const,
  registers: [registry],
});

let defaultsOn = false;
/** Process metrics (CPU, memory, event loop). Only in the real server, not in tests. */
export function enableDefaultMetrics(): void {
  if (defaultsOn) return;
  defaultsOn = true;
  collectDefaultMetrics({ register: registry, prefix: 'onepay_' });
}
