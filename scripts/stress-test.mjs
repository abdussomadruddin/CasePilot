const defaultSupabaseUrl = "https://rfqwyhafvfvafiqrcmxa.supabase.co";
const defaultSupabaseKey = "sb_publishable_or7DVUc_la79KiBz4kR5uw_EIGyN3-l";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;
const email = process.env.STRESS_EMAIL;
const password = process.env.STRESS_PASSWORD;
const concurrency = Number(process.env.STRESS_CONCURRENCY || 20);
const rounds = Number(process.env.STRESS_ROUNDS || 5);

if (!email || !password) {
  console.error("Set STRESS_EMAIL and STRESS_PASSWORD before running the stress test.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, options);
  const text = await response.text();
  let body = text;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }

  return body;
}

const auth = await request("/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: {
    apikey: supabaseKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});

const headers = {
  apikey: supabaseKey,
  authorization: `Bearer ${auth.access_token}`,
};

const schemaChecks = await Promise.allSettled([
  request("/rest/v1/profiles?select=id,role,active&limit=5", { headers }),
  request("/rest/v1/cases?select=id,status,updated_at&limit=5", { headers }),
  request("/rest/v1/case_documents?select=id,document_type,expires_at,deleted_at&limit=5", { headers }),
  request("/rest/v1/case_notifications?select=id,role,status,due_at&limit=5", { headers }),
  request("/rest/v1/push_subscriptions?select=id,role,active,last_seen_at&limit=5", { headers }),
]);

const schemaResults = schemaChecks.map((result, index) => ({
  check: [
    "profiles",
    "cases",
    "case_documents",
    "case_notifications",
    "push_subscriptions",
  ][index],
  ok: result.status === "fulfilled",
  error: result.status === "rejected" ? result.reason.message : undefined,
}));

const start = performance.now();
const requests = [];

for (let round = 0; round < rounds; round += 1) {
  for (let index = 0; index < concurrency; index += 1) {
    requests.push(
      request("/rest/v1/cases?select=id,status,updated_at,next_follow_up_at&limit=25", {
        headers,
      }),
    );
  }
}

const loadResults = await Promise.allSettled(requests);
const failed = loadResults.filter((result) => result.status === "rejected");
const durationMs = Math.round(performance.now() - start);

console.log(
  JSON.stringify(
    {
      ok: failed.length === 0 && schemaResults.every((result) => result.ok),
      schema: schemaResults,
      load: {
        requests: loadResults.length,
        failed: failed.length,
        duration_ms: durationMs,
        requests_per_second: Number((loadResults.length / (durationMs / 1000)).toFixed(2)),
      },
    },
    null,
    2,
  ),
);

if (failed.length || schemaResults.some((result) => !result.ok)) {
  process.exit(1);
}
