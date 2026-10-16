// Isolated browser-test backend. Never uses production credentials or data.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { WebSocketServer } = require(process.env.FIXTURE_WS_MODULE || "/tmp/casepilot-vso-20261016/node_modules/next/dist/compiled/ws");
const { PGlite } = await import(process.env.PGLITE_MODULE || "/tmp/casepilot-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const db = new PGlite();
const id = "11111111-1111-4111-8111-111111111111";
await db.exec(`create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;
  create table profiles(id uuid primary key,role text,active boolean);
  grant select on profiles to authenticated;
  insert into profiles values('${id}','admin',true);
  create publication supabase_realtime;`);
await db.exec(await readFile(new URL("../supabase/migrations/20261016145622_client_document_workspace.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261016161647_add_ehakmilik_document.sql", import.meta.url), "utf8"));
let calls = 0, fail = false, delay = 0, queue = Promise.resolve();
const subscriptions = new Map();
function broadcast(table, record) {
  for (const [socket, topics] of subscriptions) for (const [topic, { bindings, joinRef }] of topics) {
    const ids = bindings.filter(binding => binding.table === table || binding.table === "*").map(binding => binding.id);
    if (ids.length) socket.send(JSON.stringify([joinRef, null, topic, "postgres_changes", { ids, data: { schema: "public", table, type: "UPDATE", columns: [], record, old_record: {}, commit_timestamp: new Date().toISOString(), errors: null } }]));
  }
}
const user = { id, email: "invoice@test.local", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.end(); return; }
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => { queue = queue.then(async () => {
    const url = new URL(req.url, "http://127.0.0.1:3334");
    const role = req.headers.authorization?.includes("manager") ? "sales_manager" : "admin";
    const profile = { id, full_name: "Test Admin", email: user.email, role, active: true, phone: "0123456789" };
    const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    try {
      if (url.pathname === "/test/control") { const control = JSON.parse(body); fail = Boolean(control.fail); delay = control.delay || 0; send({ ok: true }); return; }
      if (url.pathname === "/test/stats") { await db.exec("reset role"); send({ calls, clients: (await db.query("select * from document_clients")).rows, purchases: (await db.query("select * from client_purchases")).rows, documents: (await db.query("select * from client_document_drafts")).rows }); return; }
      if (url.pathname === "/test/remote") { await db.exec("reset role"); const row = (await db.query("update document_clients set version=version+1,data=data || $1::jsonb where id=$2 returning *", [JSON.stringify({ customerName: JSON.parse(body).name || "Remote Name" }), JSON.parse(body).id])).rows[0]; if (row) broadcast("document_clients", row); send({ ok: true }); return; }
      if (url.pathname.includes("/auth/v1/token")) { send({ access_token: "fixture-token", refresh_token: "fixture-refresh", expires_in: 3600, user }); return; }
      if (url.pathname.includes("/auth/v1/user")) { send(user); return; }
      if (url.pathname.includes("/profiles")) { send(req.headers.accept?.includes("object") ? profile : [profile]); return; }
      await db.exec(`reset role; update profiles set role='${role}' where id='${id}'; set request.jwt.claim.sub='${id}'; set role authenticated;`);
      if (url.pathname.endsWith("/rpc/save_client_document_bundle")) {
        calls += 1;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (fail) { send({ message: "Fixture unavailable", code: "503" }, 503); return; }
        const value = (await db.query("select save_client_document_bundle($1::jsonb) as bundle", [JSON.stringify(JSON.parse(body).payload)])).rows[0].bundle;
        broadcast("document_clients", value.client);
        send(value); return;
      }
      const table = url.pathname.split("/").pop();
      if (["document_clients", "client_purchases", "client_document_drafts"].includes(table)) {
        let rows = (await db.query(`select * from ${table} order by updated_at desc`)).rows;
        for (const [key, value] of url.searchParams) if (value.startsWith("eq.")) rows = rows.filter(row => row[key] === value.slice(3));
        send(rows); return;
      }
      send([]);
    } catch (error) { send({ code: error.code, message: error.message }, error.code === "40001" ? 409 : 400); }
  }).catch(error => { res.statusCode = 500; res.end(JSON.stringify({ message: error.message })); }); });
});
const ws = new WebSocketServer({ server });
ws.on("connection", socket => {
  subscriptions.set(socket, new Map());
  socket.on("close", () => subscriptions.delete(socket));
  socket.on("message", raw => {
    const decoded = JSON.parse(raw.toString());
    const message = Array.isArray(decoded) ? { join_ref: decoded[0], ref: decoded[1], topic: decoded[2], event: decoded[3], payload: decoded[4] } : decoded;
    if (message.event === "phx_join") {
      const bindings = (message.payload.config?.postgres_changes || []).map((binding, index) => ({ ...binding, id: index + 1 }));
      subscriptions.get(socket).set(message.topic, { bindings, joinRef: message.join_ref });
      socket.send(JSON.stringify([message.join_ref, message.ref, message.topic, "phx_reply", { status: "ok", response: { postgres_changes: bindings } }]));
    } else if (message.event === "heartbeat" || message.event === "phx_leave") {
      if (message.event === "phx_leave") subscriptions.get(socket).delete(message.topic);
      socket.send(JSON.stringify([message.join_ref, message.ref, message.topic, "phx_reply", { status: "ok", response: {} }]));
    }
  });
});
server.listen(3334, "127.0.0.1", () => console.log("Isolated Client fixture at 3334"));
async function stop() { ws.close(); server.close(); await db.close(); process.exit(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
