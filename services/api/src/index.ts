import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import * as oidc from "openid-client";
import { z } from "zod";
import { createSession, currentUser, destroySession, hashToken, passwordHash, passwordMatches, requireUser, validToken } from "./auth.js";
import { migrate, pool } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { startStorageMaintenance } from "./maintenance.js";
import { storageRouter } from "./storage.js";

const version = process.env.HEDGESIGHT_VERSION ?? "0.1.0-dev";
const port = Number(process.env.APP_PORT ?? 8080);
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "12mb" }));
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", version, database: "connected", time: new Date().toISOString() });
  } catch {
    response.status(503).json({ status: "unavailable", version, database: "disconnected" });
  }
});

app.get("/api/version", (_request, response) => {
  response.json({ version, channel: process.env.UPDATE_CHANNEL ?? "stable", repository: "Releah/HedgeSight" });
});

const credentialsSchema = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), password: z.string().min(12).max(256) });
type OidcRuntimeSettings = { enabled:boolean;issuerUrl:string|null;clientId:string|null;clientSecret:string|null;redirectUri:string|null;source:"database"|"environment" };
async function loadOidcSettings(): Promise<OidcRuntimeSettings> {
  const key=process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me";
  const result=await pool.query(`SELECT enabled,issuer_url AS "issuerUrl",client_id AS "clientId",redirect_uri AS "redirectUri",
    CASE WHEN client_secret_encrypted IS NULL THEN NULL ELSE pgp_sym_decrypt(client_secret_encrypted,$1) END AS "clientSecret" FROM oidc_settings WHERE singleton=true`,[key]);
  if(result.rowCount)return {...result.rows[0],source:"database"};
  return {enabled:Boolean(process.env.OIDC_ISSUER_URL&&process.env.OIDC_CLIENT_ID&&process.env.OIDC_REDIRECT_URI),issuerUrl:process.env.OIDC_ISSUER_URL||null,clientId:process.env.OIDC_CLIENT_ID||null,clientSecret:process.env.OIDC_CLIENT_SECRET||null,redirectUri:process.env.OIDC_REDIRECT_URI||null,source:"environment"};
}
let oidcConfiguration: { key:string; value:Promise<oidc.Configuration> } | null = null;
function getOidcConfiguration(settings:OidcRuntimeSettings) {
  if(!settings.enabled||!settings.issuerUrl||!settings.clientId||!settings.redirectUri)throw new Error("OIDC is not configured");
  const key=`${settings.issuerUrl}|${settings.clientId}|${settings.clientSecret??""}`;
  if(oidcConfiguration?.key!==key)oidcConfiguration={key,value:oidc.discovery(new URL(settings.issuerUrl),settings.clientId,settings.clientSecret??undefined)};
  return oidcConfiguration.value;
}

app.get("/api/auth/status", async (_request, response) => {
  const [result,oidcSettings] = await Promise.all([pool.query("SELECT EXISTS(SELECT 1 FROM users) AS configured"),loadOidcSettings()]);
  response.json({ setupRequired: !result.rows[0].configured, oidcEnabled: oidcSettings.enabled });
});

app.get("/api/auth/me", async (request, response) => {
  const user = await currentUser(request);
  if (!user) return response.status(401).json({ error: "Authentication required" });
  return response.json({ user });
});

app.post("/api/auth/setup", async (request, response) => {
  const parsed = credentialsSchema.extend({ displayName: z.string().trim().min(1).max(120) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Use a valid email and a password of at least 12 characters" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    if ((await client.query("SELECT 1 FROM users LIMIT 1")).rowCount) { await client.query("ROLLBACK"); return response.status(409).json({ error: "Initial setup is already complete" }); }
    const result = await client.query(`INSERT INTO users(email,display_name,password_hash,role,last_login_at) VALUES($1,$2,$3,'admin',now()) RETURNING id`, [parsed.data.email, parsed.data.displayName, await passwordHash(parsed.data.password)]);
    await client.query("COMMIT");
    await createSession(request, response, result.rows[0].id);
    return response.status(201).json({ created: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.post("/api/auth/login", async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) return response.status(401).json({ error: "Invalid email or password" });
  const result = await pool.query("SELECT id,password_hash FROM users WHERE email=$1 AND enabled=true", [parsed.data.email]);
  const valid = result.rowCount && result.rows[0].password_hash && await passwordMatches(parsed.data.password, result.rows[0].password_hash);
  if (!valid) return response.status(401).json({ error: "Invalid email or password" });
  await pool.query("UPDATE users SET last_login_at=now() WHERE id=$1", [result.rows[0].id]);
  await createSession(request, response, result.rows[0].id);
  return response.json({ authenticated: true });
});

app.post("/api/auth/logout", async (request, response) => { await destroySession(request, response); return response.status(204).end(); });

app.get("/api/auth/oidc/start", async (request, response) => {
  const settings=await loadOidcSettings();
  if (!settings.enabled||!settings.redirectUri) return response.status(404).json({ error: "OIDC is not configured" });
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  await pool.query("DELETE FROM oidc_flows WHERE expires_at<=now()");
  await pool.query("INSERT INTO oidc_flows(state_hash,code_verifier,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [hashToken(state), verifier]);
  const url = oidc.buildAuthorizationUrl(await getOidcConfiguration(settings), { redirect_uri: settings.redirectUri, scope: "openid email profile", state, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" });
  return response.redirect(url.href);
});

app.get("/api/auth/oidc/callback", async (request, response) => {
  const settings=await loadOidcSettings();
  if (!settings.enabled||!settings.redirectUri||!settings.issuerUrl || typeof request.query.state !== "string") return response.redirect("/login?error=oidc");
  const flow = await pool.query("DELETE FROM oidc_flows WHERE state_hash=$1 AND expires_at>now() RETURNING code_verifier", [hashToken(request.query.state)]);
  if (!flow.rowCount) return response.redirect("/login?error=oidc");
  const callback = new URL(settings.redirectUri); callback.search = new URL(request.originalUrl, "http://localhost").search;
  const tokens = await oidc.authorizationCodeGrant(await getOidcConfiguration(settings), callback, { pkceCodeVerifier: flow.rows[0].code_verifier, expectedState: request.query.state });
  const claims = tokens.claims();
  if (!claims?.sub || typeof claims.email !== "string") return response.redirect("/login?error=email");
  const issuer = settings.issuerUrl; const email = claims.email.toLowerCase(); const displayName = typeof claims.name === "string" ? claims.name : email;
  const existing = await pool.query("SELECT id,oidc_issuer,oidc_subject FROM users WHERE email=$1", [email]);
  if (existing.rowCount && (existing.rows[0].oidc_issuer !== issuer || existing.rows[0].oidc_subject !== claims.sub)) return response.redirect("/login?error=link");
  const user = existing.rowCount
    ? await pool.query("UPDATE users SET display_name=$2,last_login_at=now(),updated_at=now() WHERE id=$1 RETURNING id", [existing.rows[0].id, displayName])
    : await pool.query(`INSERT INTO users(email,display_name,oidc_issuer,oidc_subject,last_login_at) VALUES($1,$2,$3,$4,now()) RETURNING id`, [email, displayName, issuer, claims.sub]);
  await createSession(request, response, user.rows[0].id);
  return response.redirect("/#overview");
});

app.get("/api/public/status", async (_request, response) => {
  const [counts, incidents] = await Promise.all([pool.query(`SELECT CASE WHEN active.device_id IS NOT NULL THEN 'maintenance' ELSE d.status END AS status,count(*)::int AS count
    FROM devices d LEFT JOIN (SELECT DISTINCT device_id FROM change_record_devices WHERE ended_at IS NULL) active ON active.device_id=d.id
    WHERE d.enabled=true GROUP BY 1`), pool.query(`SELECT count(*)::int AS count FROM incidents i WHERE status<>'resolved'
    AND NOT EXISTS(SELECT 1 FROM change_record_devices m WHERE m.device_id=i.device_id AND m.ended_at IS NULL)`)]);
  const summary = { up: 0, down: 0, degraded: 0, unknown: 0, maintenance: 0 };
  for (const row of counts.rows) summary[row.status as keyof typeof summary] = row.count;
  const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
  const alertingTotal=total-summary.maintenance;
  const overallStatus = summary.down ? "outage" : summary.degraded ? "degraded" : (!alertingTotal || summary.up === alertingTotal) ? "operational" : "unknown";
  response.set("Cache-Control", "public, max-age=15").json({ overallStatus, counts: { ...summary, total }, activeIncidents: incidents.rows[0].count, lastUpdated: new Date().toISOString() });
});

app.use("/api", requireUser);
app.use("/api", storageRouter);

function requireAdmin(request: express.Request, response: express.Response): boolean {
  if (response.locals.user?.role === "admin") return true;
  response.status(403).json({ error: "Administrator access required" });
  return false;
}

function requireOperator(response: express.Response): boolean {
  if (["admin","operator"].includes(response.locals.user?.role)) return true;
  response.status(403).json({ error: "Operator access required" });
  return false;
}

app.get("/api/settings/accounts", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const result = await pool.query(`SELECT id,email,display_name AS "displayName",role,enabled,
    password_hash IS NOT NULL AS "hasLocalPassword",oidc_subject IS NOT NULL AS "hasOidcIdentity",
    created_at AS "createdAt",last_login_at AS "lastLoginAt",
    id=(SELECT id FROM users ORDER BY created_at,id LIMIT 1) AS "isProtected",id=$1 AS "isCurrent"
    FROM users ORDER BY display_name,email`,[response.locals.user.id]);
  response.json(result.rows);
});

const accountUpdateSchema=z.object({displayName:z.string().trim().min(1).max(120),email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),role:z.enum(["admin","operator","viewer"]),enabled:z.boolean(),password:z.union([z.string().min(12).max(256),z.literal("")]).optional()});
app.put("/api/settings/accounts/:accountId",async(request,response)=>{
  if(!requireAdmin(request,response))return;
  const parsed=accountUpdateSchema.safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Use a valid email and a password of at least 12 characters"});
  const protectedAccount=await pool.query("SELECT id=(SELECT id FROM users ORDER BY created_at,id LIMIT 1) AS protected FROM users WHERE id=$1",[request.params.accountId]);
  if(!protectedAccount.rowCount)return response.status(404).json({error:"Account not found"});
  if(protectedAccount.rows[0].protected)return response.status(409).json({error:"The original administrator is protected"});
  try{const password=parsed.data.password?await passwordHash(parsed.data.password):null;const result=await pool.query(`UPDATE users SET display_name=$2,email=$3,role=$4,enabled=$5,
    password_hash=CASE WHEN $6::text IS NULL THEN password_hash ELSE $6 END,updated_at=now() WHERE id=$1 RETURNING id`,[request.params.accountId,parsed.data.displayName,parsed.data.email,parsed.data.role,parsed.data.enabled,password]);return response.json({updated:Boolean(result.rowCount)});}catch(error){if((error as {code?:string}).code==="23505")return response.status(409).json({error:"An account with that email already exists"});throw error;}
});

app.delete("/api/settings/accounts/:accountId",async(request,response)=>{
  if(!requireAdmin(request,response))return;
  if(request.params.accountId===response.locals.user.id)return response.status(409).json({error:"You cannot delete your current account"});
  const result=await pool.query(`DELETE FROM users WHERE id=$1 AND id<>(SELECT id FROM users ORDER BY created_at,id LIMIT 1) RETURNING id`,[request.params.accountId]);
  if(!result.rowCount)return response.status(409).json({error:"The original administrator is protected or the account does not exist"});
  return response.status(204).end();
});

app.post("/api/settings/accounts", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const parsed = credentialsSchema.extend({ displayName: z.string().trim().min(1).max(120), role: z.enum(["admin","operator","viewer"]).default("viewer") }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Use a valid email and a password of at least 12 characters" });
  try {
    const result = await pool.query(`INSERT INTO users(email,display_name,password_hash,role) VALUES($1,$2,$3,$4)
      RETURNING id,email,display_name AS "displayName",role,enabled,created_at AS "createdAt"`, [parsed.data.email, parsed.data.displayName, await passwordHash(parsed.data.password), parsed.data.role]);
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return response.status(409).json({ error: "An account with that email already exists" });
    throw error;
  }
});

app.get("/api/settings/authentication", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const settings=await loadOidcSettings();
  response.json({
    localAccountsEnabled: true,
    oidc: { enabled: settings.enabled, issuerUrl: settings.issuerUrl, clientId:settings.clientId, clientIdConfigured:Boolean(settings.clientId), clientSecretConfigured: Boolean(settings.clientSecret), redirectUri: settings.redirectUri,source:settings.source },
    sessionDays: Math.max(1, Number(process.env.SESSION_DAYS ?? 7)), cookieSecure: process.env.COOKIE_SECURE === "true", trustProxy: process.env.TRUST_PROXY === "true",
  });
});

app.put("/api/settings/authentication/oidc",async(request,response)=>{
  if(!requireAdmin(request,response))return;
  const parsed=z.object({enabled:z.boolean(),issuerUrl:z.union([z.string().trim().url(),z.literal("")]),clientId:z.string().trim().max(500),clientSecret:z.string().max(2000).optional().default(""),redirectUri:z.union([z.string().trim().url(),z.literal("")])}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"Enter valid issuer and callback URLs"});
  if(parsed.data.enabled&&(!parsed.data.issuerUrl||!parsed.data.clientId||!parsed.data.redirectUri))return response.status(400).json({error:"Issuer URL, client ID and callback URL are required when OIDC is enabled"});
  const key=process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me";
  await pool.query(`INSERT INTO oidc_settings(singleton,enabled,issuer_url,client_id,client_secret_encrypted,redirect_uri,updated_by)
    VALUES(true,$1,NULLIF($2,''),NULLIF($3,''),CASE WHEN $4='' THEN NULL ELSE pgp_sym_encrypt($4,$5) END,NULLIF($6,''),$7)
    ON CONFLICT(singleton) DO UPDATE SET enabled=EXCLUDED.enabled,issuer_url=EXCLUDED.issuer_url,client_id=EXCLUDED.client_id,
    client_secret_encrypted=CASE WHEN $4='' THEN oidc_settings.client_secret_encrypted ELSE EXCLUDED.client_secret_encrypted END,
    redirect_uri=EXCLUDED.redirect_uri,updated_at=now(),updated_by=EXCLUDED.updated_by`,[parsed.data.enabled,parsed.data.issuerUrl,parsed.data.clientId,parsed.data.clientSecret,key,parsed.data.redirectUri,response.locals.user.id]);
  oidcConfiguration=null;
  return response.json({saved:true});
});

app.get("/api/dashboard", async (_request, response) => {
  const [counts, devices, workers, incidents, changes] = await Promise.all([
    pool.query(`SELECT CASE WHEN active.device_id IS NOT NULL THEN 'maintenance' ELSE d.status END AS status,count(*)::int AS count
      FROM devices d LEFT JOIN (SELECT DISTINCT device_id FROM change_record_devices WHERE ended_at IS NULL) active ON active.device_id=d.id GROUP BY 1`),
    pool.query(`SELECT d.id, d.name, d.address, d.status, d.last_seen_at AS "lastSeenAt",
      count(c.id)::int AS checks FROM devices d LEFT JOIN checks c ON c.device_id = d.id
      GROUP BY d.id ORDER BY d.name`),
    pool.query(`SELECT id, name, version, last_seen_at AS "lastSeenAt",
      CASE WHEN last_seen_at > now() - interval '60 seconds' THEN 'online' ELSE 'offline' END AS status
      FROM workers ORDER BY name`),
    pool.query(`SELECT i.id, d.name AS "deviceName", c.name AS "checkName", i.status,
      i.opened_at AS "openedAt", i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",u.display_name AS "investigatorName"
      FROM incidents i JOIN checks c ON c.id = i.check_id JOIN devices d ON d.id = c.device_id
      LEFT JOIN users u ON u.id=i.investigating_user_id
      WHERE i.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM change_record_devices maintenance WHERE maintenance.device_id=i.device_id AND maintenance.ended_at IS NULL)
      ORDER BY i.opened_at DESC LIMIT 10`),
    pool.query(`SELECT r.id,r.change_reference AS "changeReference",u.id AS "managerId",u.display_name AS "managerName",r.started_at AS "startedAt",
      count(m.device_id)::int AS "deviceCount",array_agg(d.name ORDER BY d.name) AS "deviceNames"
      FROM change_records r JOIN users u ON u.id=r.change_manager_user_id JOIN change_record_devices m ON m.change_record_id=r.id AND m.ended_at IS NULL
      JOIN devices d ON d.id=m.device_id WHERE r.ended_at IS NULL GROUP BY r.id,u.id ORDER BY r.started_at DESC`),
  ]);
  const summary = { up: 0, down: 0, degraded: 0, unknown: 0 };
  let maintenanceCount=0;
  for (const row of counts.rows) { if(row.status==="maintenance") maintenanceCount=row.count; else summary[row.status as keyof typeof summary] = row.count; }
  response.json({ counts: summary, maintenanceCount, devices: devices.rows, workers: workers.rows, recentIncidents: incidents.rows, activeChanges:changes.rows });
});

app.get("/api/incidents",async(_request,response)=>{
  const result=await pool.query(`SELECT i.id,i.status,i.opened_at AS "openedAt",i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",i.archived_at AS "archivedAt",
    d.id AS "deviceId",d.name AS "deviceName",d.address,d.status AS "deviceStatus",c.name AS "checkName",c.kind AS "checkKind",
    u.display_name AS "investigatorName",(SELECT count(*)::int FROM incident_updates x WHERE x.incident_id=i.id) AS "updateCount",
    m.id AS "majorIncidentId",CASE WHEN m.id IS NULL THEN NULL ELSE 'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') END AS "majorIncidentReference",
    m.title AS "majorIncidentTitle",m.severity AS "majorIncidentSeverity",m.status AS "majorIncidentStatus"
    FROM incidents i JOIN checks c ON c.id=i.check_id JOIN devices d ON d.id=c.device_id LEFT JOIN users u ON u.id=i.investigating_user_id
    LEFT JOIN major_incident_members mm ON mm.incident_id=i.id LEFT JOIN major_incidents m ON m.id=mm.major_incident_id
    ORDER BY CASE WHEN i.status='resolved' THEN 1 ELSE 0 END,i.opened_at DESC LIMIT 200`);
  response.json(result.rows);
});

app.get("/api/incidents/:incidentId",async(request,response)=>{
  const result=await pool.query(`SELECT i.id,i.status,i.opened_at AS "openedAt",i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",i.archived_at AS "archivedAt",
    d.id AS "deviceId",d.name AS "deviceName",d.address,d.description AS "deviceDescription",d.status AS "deviceStatus",
    c.name AS "checkName",c.kind AS "checkKind",c.last_status AS "checkStatus",opening.message AS "openingMessage",
    investigator.id AS "investigatorId",investigator.display_name AS "investigatorName",closer.display_name AS "closedByName"
    FROM incidents i JOIN checks c ON c.id=i.check_id JOIN devices d ON d.id=c.device_id
    LEFT JOIN probe_results opening ON opening.id=i.opening_result_id LEFT JOIN users investigator ON investigator.id=i.investigating_user_id
    LEFT JOIN users closer ON closer.id=i.closed_by_user_id WHERE i.id=$1`,[request.params.incidentId]);
  if(!result.rowCount)return response.status(404).json({error:"Incident not found"});
  const updates=await pool.query(`SELECT x.id,x.body,x.created_at AS "createdAt",COALESCE(u.display_name,'Deleted user') AS "authorName",u.id AS "authorId"
    FROM incident_updates x LEFT JOIN users u ON u.id=x.user_id WHERE x.incident_id=$1 ORDER BY x.created_at`,[request.params.incidentId]);
  response.json({...result.rows[0],updates:updates.rows});
});

app.post("/api/incidents/:incidentId/claim",async(request,response)=>{
  const user=response.locals.user;
  const result=await pool.query(`UPDATE incidents i SET status='under_investigation',investigating_user_id=$2
    FROM checks c WHERE i.id=$1 AND c.id=i.check_id AND i.status IN ('open','under_investigation') AND c.last_status='down'
      AND (i.investigating_user_id IS NULL OR i.investigating_user_id=$2) RETURNING i.id`,[request.params.incidentId,user.id]);
  if(!result.rowCount)return response.status(409).json({error:"Only an active incident for a currently down check can be claimed"});
  return response.json({claimed:true,investigatorName:user.displayName});
});

app.post("/api/incidents/:incidentId/updates",async(request,response)=>{
  const parsed=z.object({body:z.string().trim().min(1).max(4000)}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"Update must contain between 1 and 4,000 characters"});
  const exists=await pool.query("SELECT 1 FROM incidents WHERE id=$1",[request.params.incidentId]);if(!exists.rowCount)return response.status(404).json({error:"Incident not found"});
  const result=await pool.query(`INSERT INTO incident_updates(incident_id,user_id,body) VALUES($1,$2,$3)
    RETURNING id,body,created_at AS "createdAt"`,[request.params.incidentId,response.locals.user.id,parsed.data.body]);
  return response.status(201).json({...result.rows[0],authorName:response.locals.user.displayName,authorId:response.locals.user.id});
});

app.post("/api/incidents/:incidentId/resolve",async(request,response)=>{
  const result=await pool.query(`UPDATE incidents i SET status='resolved',resolved_at=now(),closed_by_user_id=$2
    WHERE i.id=$1 AND i.status<>'resolved' AND i.recovered_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM incident_updates x WHERE x.incident_id=i.id) RETURNING id`,[request.params.incidentId,response.locals.user.id]);
  if(!result.rowCount)return response.status(409).json({error:"The node must be responding and the incident must have at least one update before it can be resolved"});
  return response.json({resolved:true});
});
app.post("/api/incidents/:incidentId/archive",async(request,response)=>{const result=await pool.query(`UPDATE incidents SET archived_at=now(),archived_by_user_id=$2 WHERE id=$1 AND status='resolved' AND archived_at IS NULL RETURNING id`,[request.params.incidentId,response.locals.user.id]);if(!result.rowCount)return response.status(409).json({error:"Only a resolved, unarchived incident can be archived"});return response.json({archived:true});});

app.get("/api/major-incidents",async(_request,response)=>{
  const result=await pool.query(`SELECT m.id,m.number,'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') AS reference,
    m.title,m.impact,m.severity,m.status,m.opened_at AS "openedAt",m.resolved_at AS "resolvedAt",u.display_name AS "ownerName",
    count(DISTINCT mm.incident_id)::int AS "incidentCount",count(DISTINCT mu.id)::int AS "updateCount"
    FROM major_incidents m LEFT JOIN users u ON u.id=m.owner_user_id LEFT JOIN major_incident_members mm ON mm.major_incident_id=m.id
    LEFT JOIN major_incident_updates mu ON mu.major_incident_id=m.id GROUP BY m.id,u.display_name ORDER BY m.opened_at DESC`);response.json(result.rows);
});
app.get("/api/major-incidents/:majorId",async(request,response)=>{
  const main=await pool.query(`SELECT m.id,m.number,'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') AS reference,m.title,m.impact,m.severity,m.status,m.opened_at AS "openedAt",m.resolved_at AS "resolvedAt",u.display_name AS "ownerName" FROM major_incidents m LEFT JOIN users u ON u.id=m.owner_user_id WHERE m.id=$1`,[request.params.majorId]);if(!main.rowCount)return response.status(404).json({error:"Major incident not found"});
  const [members,updates]=await Promise.all([pool.query(`SELECT i.id,d.name AS "deviceName",i.status,i.opened_at AS "openedAt" FROM major_incident_members mm JOIN incidents i ON i.id=mm.incident_id JOIN devices d ON d.id=i.device_id WHERE mm.major_incident_id=$1 ORDER BY i.opened_at`,[request.params.majorId]),pool.query(`SELECT x.id,x.body,x.created_at AS "createdAt",COALESCE(u.display_name,'Deleted user') AS "authorName" FROM major_incident_updates x LEFT JOIN users u ON u.id=x.user_id WHERE x.major_incident_id=$1 ORDER BY x.created_at`,[request.params.majorId])]);response.json({...main.rows[0],incidents:members.rows,updates:updates.rows});
});
app.post("/api/major-incidents",async(request,response)=>{
  const parsed=z.object({title:z.string().trim().min(1).max(200),impact:z.string().trim().max(2000).default(""),severity:z.enum(["major","critical"]).default("major"),incidentIds:z.array(z.string().uuid()).default([])}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid major incident"});
  const client=await pool.connect();try{await client.query("BEGIN");const result=await client.query(`INSERT INTO major_incidents(title,impact,severity,owner_user_id,created_by_user_id) VALUES($1,$2,$3,$4,$4) RETURNING id`,[parsed.data.title,parsed.data.impact,parsed.data.severity,response.locals.user.id]);for(const id of parsed.data.incidentIds)await client.query(`INSERT INTO major_incident_members(major_incident_id,incident_id) VALUES($1,$2) ON CONFLICT(incident_id) DO UPDATE SET major_incident_id=EXCLUDED.major_incident_id`,[result.rows[0].id,id]);await client.query("COMMIT");return response.status(201).json(result.rows[0]);}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
app.post("/api/major-incidents/:majorId/updates",async(request,response)=>{const parsed=z.object({body:z.string().trim().min(1).max(4000)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Update is required"});const result=await pool.query(`INSERT INTO major_incident_updates(major_incident_id,user_id,body) VALUES($1,$2,$3) RETURNING id`,[request.params.majorId,response.locals.user.id,parsed.data.body]);return response.status(201).json(result.rows[0]);});
app.post("/api/major-incidents/:majorId/members",async(request,response)=>{const parsed=z.object({incidentIds:z.array(z.string().uuid())}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid incidents"});for(const id of parsed.data.incidentIds)await pool.query(`INSERT INTO major_incident_members(major_incident_id,incident_id) VALUES($1,$2) ON CONFLICT(incident_id) DO UPDATE SET major_incident_id=EXCLUDED.major_incident_id`,[request.params.majorId,id]);return response.json({linked:parsed.data.incidentIds.length});});
app.post("/api/major-incidents/:majorId/resolve",async(request,response)=>{await pool.query("UPDATE major_incidents SET status='resolved',resolved_at=now() WHERE id=$1",[request.params.majorId]);return response.json({resolved:true});});
app.post("/api/major-incidents/:majorId/resolve-all",async(request,response)=>{
  const client=await pool.connect();try{await client.query("BEGIN");await client.query("SELECT id FROM major_incidents WHERE id=$1 FOR UPDATE",[request.params.majorId]);const major=await client.query(`SELECT m.id,m.title,'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') AS reference,
    count(mm.incident_id)::int AS members,count(mm.incident_id) FILTER(WHERE i.status<>'resolved' AND i.recovered_at IS NULL)::int AS unavailable,
    EXISTS(SELECT 1 FROM major_incident_updates u WHERE u.major_incident_id=m.id) AS updated
    FROM major_incidents m LEFT JOIN major_incident_members mm ON mm.major_incident_id=m.id LEFT JOIN incidents i ON i.id=mm.incident_id
    WHERE m.id=$1 GROUP BY m.id`,[request.params.majorId]);
    if(!major.rowCount){await client.query("ROLLBACK");return response.status(404).json({error:"Major incident not found"});}const item=major.rows[0];
    if(!item.members){await client.query("ROLLBACK");return response.status(409).json({error:"Link at least one incident before resolving the major incident"});}
    if(item.unavailable>0){await client.query("ROLLBACK");return response.status(409).json({error:"All linked incidents must be responding before they can be resolved"});}
    if(!item.updated){await client.query("ROLLBACK");return response.status(409).json({error:"Add a major incident update before resolving all incidents"});}
    await client.query(`INSERT INTO incident_updates(incident_id,user_id,body) SELECT i.id,$2,'Resolved through '||$3||': '||$4 FROM major_incident_members mm JOIN incidents i ON i.id=mm.incident_id WHERE mm.major_incident_id=$1 AND i.status<>'resolved'`,[request.params.majorId,response.locals.user.id,item.reference,item.title]);
    const resolved=await client.query(`UPDATE incidents i SET status='resolved',resolved_at=now(),closed_by_user_id=$2 FROM major_incident_members mm WHERE mm.major_incident_id=$1 AND i.id=mm.incident_id AND i.status<>'resolved' RETURNING i.id`,[request.params.majorId,response.locals.user.id]);
    await client.query("UPDATE major_incidents SET status='resolved',resolved_at=now() WHERE id=$1",[request.params.majorId]);await client.query("COMMIT");return response.json({resolvedIncidents:resolved.rowCount,majorIncidentResolved:true});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

app.get("/api/devices", async (_request, response) => {
  const result = await pool.query(`SELECT d.*, COALESCE(json_agg(c ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]') AS checks
    FROM devices d LEFT JOIN checks c ON c.device_id = d.id GROUP BY d.id ORDER BY d.name`);
  response.json(result.rows);
});

app.get("/api/monitoring", async (_request, response) => {
  const result = await pool.query(`SELECT d.id,d.name,d.address,d.description,d.status,
    d.os_name AS "osName",d.os_version AS "osVersion",d.device_type AS "deviceType",d.vendor,d.model,
    d.profile_source AS "profileSource",d.profiled_at AS "profiledAt",p.id AS "pingCheckId",
    p.interval_seconds AS "intervalSeconds",p.last_status AS "pingStatus",p.last_run_at AS "lastRunAt",
    COALESCE(p.config->>'mode','icmp') AS "reachabilityMode",COALESCE((p.config->>'port')::integer,22) AS "tcpPort",
    latest.latency_ms AS "latencyMs",COALESCE((latest.metrics->>'packetLossPercent')::double precision,0) AS "packetLossPercent",
    COALESCE(history.points,'[]'::json) AS history,COALESCE(groups.items,'[]'::json) AS groups,d.enabled,
    maintenance.id AS "changeId",maintenance.change_reference AS "changeReference",maintenance.manager_name AS "changeManagerName",maintenance.started_at AS "maintenanceStartedAt",
    availability.uptime_seconds AS "uptimeSeconds",availability.downtime_seconds AS "downtimeSeconds",availability.uptime_percent AS "uptimePercent"
    FROM devices d
    LEFT JOIN LATERAL (SELECT * FROM checks WHERE device_id=d.id AND kind='ping' ORDER BY created_at LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT latency_ms,metrics FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('timestamp',x.finished_at,'latencyMs',x.latency_ms,'status',x.status) ORDER BY x.finished_at) AS points
      FROM (SELECT finished_at,latency_ms,status FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 30) x) history ON true
    LEFT JOIN LATERAL (SELECT round(COALESCE(sum(seconds) FILTER(WHERE status='up'),0))::bigint AS uptime_seconds,
      round(COALESCE(sum(seconds) FILTER(WHERE status='down'),0))::bigint AS downtime_seconds,
      CASE WHEN COALESCE(sum(seconds) FILTER(WHERE status IN ('up','down')),0)>0 THEN round((100*COALESCE(sum(seconds) FILTER(WHERE status='up'),0)/sum(seconds) FILTER(WHERE status IN ('up','down')))::numeric,3) ELSE NULL END AS uptime_percent
      FROM (SELECT status,extract(epoch FROM LEAST(COALESCE(lead(finished_at) OVER(ORDER BY finished_at),now()),now())-GREATEST(finished_at,now()-interval '30 days')) AS seconds
        FROM probe_results WHERE check_id=p.id AND finished_at>=now()-interval '30 days') samples) availability ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',g.id,'name',g.name,'color',g.color) ORDER BY g.name) AS items
      FROM device_group_memberships m JOIN device_groups g ON g.id=m.group_id WHERE m.device_id=d.id) groups ON true
    LEFT JOIN LATERAL (SELECT r.id,r.change_reference,u.display_name AS manager_name,r.started_at FROM change_record_devices m
      JOIN change_records r ON r.id=m.change_record_id JOIN users u ON u.id=r.change_manager_user_id WHERE m.device_id=d.id AND m.ended_at IS NULL LIMIT 1) maintenance ON true
    ORDER BY d.name`);
  response.json(result.rows);
});

app.get("/api/change-managers",async(_request,response)=>{
  const result=await pool.query(`SELECT id,display_name AS "displayName",email FROM users WHERE enabled=true AND role IN ('admin','operator') ORDER BY display_name`);
  response.json(result.rows);
});

app.get("/api/changes",async(_request,response)=>{
  const result=await pool.query(`SELECT r.id,r.change_reference AS "changeReference",r.started_at AS "startedAt",r.ended_at AS "endedAt",
    u.display_name AS "managerName",u.id AS "managerId",count(m.device_id)::int AS "deviceCount",array_agg(d.name ORDER BY d.name) AS "deviceNames"
    FROM change_records r JOIN users u ON u.id=r.change_manager_user_id JOIN change_record_devices m ON m.change_record_id=r.id
    JOIN devices d ON d.id=m.device_id GROUP BY r.id,u.id ORDER BY r.started_at DESC LIMIT 100`);
  response.json(result.rows);
});

app.post("/api/changes",async(request,response)=>{
  if(!requireOperator(response))return;
  const parsed=z.object({changeReference:z.string().trim().min(1).max(200),managerId:z.string().uuid(),deviceIds:z.array(z.string().uuid()).min(1).max(500)}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"A change record, change manager and at least one node are required"});
  const client=await pool.connect();try{await client.query("BEGIN");
    const manager=await client.query(`SELECT 1 FROM users WHERE id=$1 AND enabled=true AND role IN ('admin','operator')`,[parsed.data.managerId]);
    if(!manager.rowCount){await client.query("ROLLBACK");return response.status(400).json({error:"Select an active operator or administrator as change manager"});}
    const busy=await client.query(`SELECT d.name FROM change_record_devices m JOIN devices d ON d.id=m.device_id WHERE m.device_id=ANY($1::uuid[]) AND m.ended_at IS NULL`,[parsed.data.deviceIds]);
    if(busy.rowCount){await client.query("ROLLBACK");return response.status(409).json({error:`Already under maintenance: ${busy.rows.map(item=>item.name).join(", ")}`});}
    const record=await client.query(`INSERT INTO change_records(change_reference,change_manager_user_id,created_by_user_id) VALUES($1,$2,$3) RETURNING id`,[parsed.data.changeReference,parsed.data.managerId,response.locals.user.id]);
    await client.query(`INSERT INTO change_record_devices(change_record_id,device_id) SELECT $1,unnest($2::uuid[])`,[record.rows[0].id,parsed.data.deviceIds]);
    await client.query("COMMIT");return response.status(201).json(record.rows[0]);
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

app.post("/api/changes/:changeId/return",async(request,response)=>{
  if(!requireOperator(response))return;
  const client=await pool.connect();try{await client.query("BEGIN");
    const record=await client.query(`SELECT id,change_manager_user_id FROM change_records WHERE id=$1 AND ended_at IS NULL FOR UPDATE`,[request.params.changeId]);
    if(!record.rowCount){await client.query("ROLLBACK");return response.status(404).json({error:"Active change not found"});}
    if(record.rows[0].change_manager_user_id!==response.locals.user.id&&response.locals.user.role!=="admin"){await client.query("ROLLBACK");return response.status(403).json({error:"Only the assigned change manager or an administrator can return these nodes"});}
    await client.query(`UPDATE change_records SET ended_at=now(),ended_by_user_id=$2 WHERE id=$1`,[request.params.changeId,response.locals.user.id]);
    await client.query(`UPDATE change_record_devices SET ended_at=now() WHERE change_record_id=$1 AND ended_at IS NULL`,[request.params.changeId]);
    await client.query("COMMIT");return response.json({returned:true});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

app.get("/api/groups", async (_request, response) => {
  const result = await pool.query(`SELECT g.id,g.name,g.color,count(m.device_id)::int AS "deviceCount"
    FROM device_groups g LEFT JOIN device_group_memberships m ON m.group_id=g.id GROUP BY g.id ORDER BY g.name`);
  response.json(result.rows);
});

app.post("/api/groups", async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#41d69b") }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid group", issues: parsed.error.issues });
  const result = await pool.query(`INSERT INTO device_groups(name,color) VALUES($1,$2)
    ON CONFLICT(name) DO UPDATE SET color=EXCLUDED.color RETURNING *`, [parsed.data.name,parsed.data.color]);
  return response.status(201).json(result.rows[0]);
});

app.delete("/api/groups/:groupId", async (request, response) => {
  await pool.query("DELETE FROM device_groups WHERE id=$1", [request.params.groupId]); return response.status(204).end();
});

const deviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(255),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  pingIntervalSeconds: z.number().int().min(10).max(86400).default(60),
  reachabilityMode: z.enum(["icmp","tcp"]).default("icmp"), tcpPort: z.number().int().min(1).max(65535).default(22),
});

app.post("/api/devices", async (request, response) => {
  const parsed = deviceSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid device", issues: parsed.error.issues });
  const { name, address, description, enabled, pingIntervalSeconds, reachabilityMode, tcpPort } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("INSERT INTO devices(name,address,description,enabled) VALUES ($1,$2,$3,$4) RETURNING *", [name,address,description,enabled]);
    await client.query(`INSERT INTO checks(device_id,name,kind,interval_seconds,timeout_ms,config)
      VALUES($1,'Reachability','ping',$2,5000,$3)`, [result.rows[0].id,pingIntervalSeconds,{mode:reachabilityMode,port:tcpPort}]);
    await client.query("COMMIT"); return response.status(201).json(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const deviceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(255),
  description: z.string().max(1000).default(""), enabled: z.boolean(), pingIntervalSeconds: z.number().int().min(10).max(86400),
  osName: z.string().trim().max(120).nullable().optional(), osVersion: z.string().trim().max(120).nullable().optional(),
  deviceType: z.string().trim().max(120).nullable().optional(), vendor: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(), groupIds: z.array(z.string().uuid()).max(100).default([]),
  reachabilityMode: z.enum(["icmp","tcp"]), tcpPort: z.number().int().min(1).max(65535),
});

app.put("/api/devices/:deviceId", async (request, response) => {
  const parsed = deviceUpdateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid device", issues: parsed.error.issues });
  const v = parsed.data; const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(`UPDATE devices SET name=$2,address=$3,description=$4,enabled=$5,os_name=$6,os_version=$7,
      device_type=$8,vendor=$9,model=$10,profile_source=CASE WHEN $6::text IS NOT NULL OR $8::text IS NOT NULL THEN 'manual' ELSE profile_source END,
      profiled_at=CASE WHEN $6::text IS NOT NULL OR $8::text IS NOT NULL THEN now() ELSE profiled_at END,updated_at=now() WHERE id=$1 RETURNING *`,
      [request.params.deviceId,v.name,v.address,v.description,v.enabled,v.osName || null,v.osVersion || null,v.deviceType || null,v.vendor || null,v.model || null]);
    if (!device.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Device not found" }); }
    await client.query("UPDATE checks SET interval_seconds=$2,config=$3,next_run_at=LEAST(next_run_at,now()),updated_at=now() WHERE device_id=$1 AND kind='ping'", [request.params.deviceId,v.pingIntervalSeconds,{mode:v.reachabilityMode,port:v.tcpPort}]);
    await client.query("DELETE FROM device_group_memberships WHERE device_id=$1", [request.params.deviceId]);
    if (v.groupIds.length) await client.query("INSERT INTO device_group_memberships(device_id,group_id) SELECT $1,unnest($2::uuid[])", [request.params.deviceId,v.groupIds]);
    await client.query("COMMIT"); return response.json(device.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const checkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["ping", "http", "snmp", "ssh"]),
  intervalSeconds: z.number().int().min(10).max(86400).default(60),
  timeoutMs: z.number().int().min(250).max(120000).default(5000),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

app.post("/api/devices/:deviceId/checks", async (request, response) => {
  const parsed = checkSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid check", issues: parsed.error.issues });
  const value = parsed.data;
  const result = await pool.query(`INSERT INTO checks(device_id, name, kind, interval_seconds, timeout_ms, config, enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [request.params.deviceId, value.name, value.kind, value.intervalSeconds, value.timeoutMs, value.config, value.enabled]);
  return response.status(201).json(result.rows[0]);
});

app.post("/api/workers/lease", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const body = z.object({ name: z.string().min(1).max(120), version: z.string(), capabilities: z.array(z.string()) }).parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const worker = await client.query(`INSERT INTO workers(name, token_hash, version, capabilities, last_seen_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT(name) DO UPDATE SET version=$3, capabilities=$4, last_seen_at=now()
      RETURNING id`, [body.name, hashToken(process.env.WORKER_TOKEN ?? "local-development-token"), body.version, body.capabilities]);
    await client.query("UPDATE probe_jobs SET state='expired' WHERE state='leased' AND leased_until < now()");
    await client.query("UPDATE probe_jobs SET state='queued', worker_id=NULL, leased_until=NULL WHERE state='expired'");
    const job = await client.query(`WITH candidate AS (
      SELECT j.id FROM probe_jobs j JOIN checks c ON c.id=j.check_id
      WHERE j.state='queued' AND c.kind = ANY($1::text[]) ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE probe_jobs j SET state='leased', worker_id=$2, leased_until=now() + make_interval(secs => $3), id=j.id
      FROM candidate x WHERE j.id=x.id RETURNING j.id`, [body.capabilities, worker.rows[0].id, Number(process.env.JOB_LEASE_SECONDS ?? 45)]);
    if (!job.rowCount) {
      await client.query("COMMIT");
      return response.status(204).end();
    }
    const details = await client.query(`SELECT j.id, c.id AS "checkId", d.id AS "deviceId", c.kind,
      CASE WHEN c.kind='http' THEN COALESCE(c.config->>'url', d.address) ELSE d.address END AS target,
      c.timeout_ms AS "timeoutMs", c.config, j.leased_until AS "leasedUntil"
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id JOIN devices d ON d.id=c.device_id WHERE j.id=$1`, [job.rows[0].id]);
    await client.query("COMMIT");
    return response.json(details.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

app.post("/api/workers/jobs/:jobId/results", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const resultSchema = z.object({
    workerName: z.string(), status: z.enum(["up", "down", "degraded", "unknown"]),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime(), latencyMs: z.number().optional(),
    message: z.string().max(4000).optional(), metrics: z.record(z.string(), z.number()).default({}),
    observations: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  });
  const parsed = resultSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid result", issues: parsed.error.issues });
  const value = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(`SELECT j.check_id, j.worker_id, c.device_id, c.last_status
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id WHERE j.id=$1 AND j.state='leased' FOR UPDATE`, [request.params.jobId]);
    if (!job.rowCount) { await client.query("ROLLBACK"); return response.status(409).json({ error: "Job is not leased" }); }
    const row = job.rows[0];
    const inserted = await client.query(`INSERT INTO probe_results(job_id, check_id, worker_id, status, started_at, finished_at, latency_ms, message, metrics, observations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [request.params.jobId, row.check_id, row.worker_id, value.status, value.startedAt, value.finishedAt, value.latencyMs, value.message, value.metrics, value.observations]);
    await client.query(`INSERT INTO metric_samples(collected_at,device_id,check_id,metric_key,value)
      SELECT $1,$2,$3,key,value::double precision FROM jsonb_each_text($4::jsonb)
      ON CONFLICT(collected_at,device_id,metric_key) DO UPDATE SET value=EXCLUDED.value`,
      [value.finishedAt,row.device_id,row.check_id,value.metrics]);
    await client.query("UPDATE probe_jobs SET state='completed', completed_at=now() WHERE id=$1", [request.params.jobId]);
    await client.query("UPDATE checks SET last_status=$2, last_run_at=$3, updated_at=now() WHERE id=$1", [row.check_id, value.status, value.finishedAt]);
    const maintenance=await client.query("SELECT 1 FROM change_record_devices WHERE device_id=$1 AND ended_at IS NULL",[row.device_id]);
    if (value.status === "down" && !maintenance.rowCount) {
      const alreadyActive=await client.query("SELECT 1 FROM incident_signals WHERE check_id=$1 AND recovered_at IS NULL",[row.check_id]);
      if(!alreadyActive.rowCount){
        let incident=await client.query(`SELECT id FROM incidents WHERE device_id=$1 AND status<>'resolved' FOR UPDATE`,[row.device_id]);
        if(!incident.rowCount){
          incident=await client.query(`UPDATE incidents SET status='open',resolved_at=NULL,recovered_at=NULL,closed_by_user_id=NULL,
            recurrence_count=recurrence_count+1,last_activity_at=now() WHERE id=(SELECT id FROM incidents WHERE device_id=$1 AND status='resolved'
            AND resolved_at>now()-make_interval(secs=>$2) ORDER BY resolved_at DESC LIMIT 1 FOR UPDATE) RETURNING id`,[row.device_id,Number(process.env.INCIDENT_CORRELATION_SECONDS??300)]);
        }
        if(!incident.rowCount)incident=await client.query(`INSERT INTO incidents(device_id,check_id,opening_result_id,last_activity_at) VALUES($1,$2,$3,now()) RETURNING id`,[row.device_id,row.check_id,inserted.rows[0].id]);
        else await client.query("UPDATE incidents SET last_activity_at=now() WHERE id=$1",[incident.rows[0].id]);
        await client.query(`INSERT INTO incident_signals(incident_id,check_id,opening_result_id) VALUES($1,$2,$3)`,[incident.rows[0].id,row.check_id,inserted.rows[0].id]);
      }
    } else if (value.status === "up") {
      const signal=await client.query(`UPDATE incident_signals SET recovered_at=now(),closing_result_id=$2 WHERE check_id=$1 AND recovered_at IS NULL RETURNING incident_id`,[row.check_id,inserted.rows[0].id]);
      if(signal.rowCount)await client.query(`UPDATE incidents i SET status='pending_investigation',recovered_at=COALESCE(recovered_at,now()),closing_result_id=COALESCE(closing_result_id,$2),last_activity_at=now()
        WHERE i.id=$1 AND NOT EXISTS(SELECT 1 FROM incident_signals s WHERE s.incident_id=i.id AND s.recovered_at IS NULL)`,[signal.rows[0].incident_id,inserted.rows[0].id]);
    }
    await client.query(`UPDATE devices d SET
      status = CASE WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='down') THEN 'down'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='degraded') THEN 'degraded'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='up') THEN 'up' ELSE 'unknown' END,
      last_seen_at = CASE WHEN $2='up' THEN $3 ELSE last_seen_at END, updated_at=now() WHERE id=$1`,
      [row.device_id, value.status, value.finishedAt]);
    await client.query("COMMIT");
    return response.status(202).json({ accepted: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const webRoot = resolve(process.env.WEB_ROOT ?? "apps/web/dist");
app.use(express.static(webRoot));
app.get("/{*path}", (_request, response) => response.sendFile(resolve(webRoot, "index.html")));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const status=typeof error==="object"&&error!==null&&"status" in error&&typeof error.status==="number"?error.status:500;
  response.status(status).json({ error: status===400?"Invalid request body":"Internal server error" });
});

await migrate();
startScheduler();
startStorageMaintenance();
app.listen(port, "0.0.0.0", () => console.info(`HedgeSight ${version} listening on ${port}`));
