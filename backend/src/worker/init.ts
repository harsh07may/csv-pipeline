// Names the service. Its own module so it runs before tracing and the logger are loaded
// (imports of one file are hoisted above its other statements).
process.env.OTEL_SERVICE_NAME ??= "csv-worker";
