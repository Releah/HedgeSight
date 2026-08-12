import { resolve } from "node:path";
import { cpus, freemem, hostname, loadavg, totalmem } from "node:os";
import express from "express";
import helmet from "helmet";
import * as oidc from "openid-client";
import { z } from "zod";
import { createSession, currentUser, destroySession, hashToken, passwordHash, passwordMatches, requireUser, validToken } from "./auth.js";
import { databaseDescription, migrate, pool, saveDatabaseConnection, testAndPrepareDatabase } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { startStorageMaintenance } from "./maintenance.js";
import { storageRouter } from "./storage.js";
import { backupRouter } from "./backups.js";
import { systemLogsRouter, writeSystemLog } from "./systemLogs.js";
import { reportRouter } from "./reports.js";

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
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(12).max(256) });
type OidcRuntimeSettings = { enabled:boolean;localAccountsEnabled:boolean;automaticProvisioning:boolean;defaultRole:"viewer"|"operator"|"admin";groupClaim:string;requestedScopes:string;viewerGroups:string[];operatorGroups:string[];adminGroups:string[];issuerUrl:string|null;clientId:string|null;clientSecret:string|null;redirectUri:string|null;source:"database"|"environment" };
async function loadOidcSettings(): Promise<OidcRuntimeSettings> {
  const key=process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me";
  const result=await pool.query(`SELECT enabled,local_accounts_enabled AS "localAccountsEnabled",automatic_provisioning AS "automaticProvisioning",default_role AS "defaultRole",group_claim AS "groupClaim",requested_scopes AS "requestedScopes",viewer_groups AS "viewerGroups",operator_groups AS "operatorGroups",admin_groups AS "adminGroups",issuer_url AS "issuerUrl",client_id AS "clientId",redirect_uri AS "redirectUri",
    CASE WHEN client_secret_encrypted IS NULL THEN NULL ELSE pgp_sym_decrypt(client_secret_encrypted,$1) END AS "clientSecret" FROM oidc_settings WHERE singleton=true`,[key]);
  if(result.rowCount)return {...result.rows[0],source:"database"};
  return {enabled:Boolean(process.env.OIDC_ISSUER_URL&&process.env.OIDC_CLIENT_ID&&process.env.OIDC_REDIRECT_URI),localAccountsEnabled:true,automaticProvisioning:true,defaultRole:"viewer",groupClaim:"groups",requestedScopes:"openid email profile",viewerGroups:[],operatorGroups:[],adminGroups:[],issuerUrl:process.env.OIDC_ISSUER_URL||null,clientId:process.env.OIDC_CLIENT_ID||null,clientSecret:process.env.OIDC_CLIENT_SECRET||null,redirectUri:process.env.OIDC_REDIRECT_URI||null,source:"environment"};
}
async function effectiveLocalAccountsEnabled(settings:OidcRuntimeSettings){
  if(settings.localAccountsEnabled||process.env.LOCAL_AUTH_RECOVERY==="true")return true;
  const linkedAdmin=await pool.query("SELECT 1 FROM users WHERE enabled=true AND role='admin' AND oidc_subject IS NOT NULL LIMIT 1");
  return !linkedAdmin.rowCount;
}
function oidcGroups(claims:Record<string,unknown>,claim:string){const value=claims[claim];return (Array.isArray(value)?value:typeof value==="string"?value.split(/[ ,]+/):[]).filter((item):item is string=>typeof item==="string").map(item=>item.trim().toLowerCase()).filter(Boolean);}
function oidcRole(settings:OidcRuntimeSettings,claims:Record<string,unknown>){const groups=new Set(oidcGroups(claims,settings.groupClaim)),matches=(configured:string[])=>configured.some(group=>groups.has(group.toLowerCase()));return matches(settings.adminGroups)?"admin":matches(settings.operatorGroups)?"operator":matches(settings.viewerGroups)?"viewer":settings.defaultRole;}
let oidcConfiguration: { key:string; value:Promise<oidc.Configuration> } | null = null;
async function discoverOidc(settings:Pick<OidcRuntimeSettings,"issuerUrl"|"clientId"|"clientSecret">){
  if(!settings.issuerUrl||!settings.clientId)throw new Error("Issuer URL and client ID are required");
  const configuration=await oidc.discovery(new URL(settings.issuerUrl),settings.clientId,settings.clientSecret??undefined);
  const metadata=configuration.serverMetadata();
  if(!metadata.authorization_endpoint||!metadata.token_endpoint||!metadata.jwks_uri)throw new Error("Provider discovery is missing authorization, token, or signing-key endpoints");
  return configuration;
}
function getOidcConfiguration(settings:OidcRuntimeSettings) {
  if(!settings.enabled||!settings.issuerUrl||!settings.clientId||!settings.redirectUri)throw new Error("OIDC is not configured");
  const key=`${settings.issuerUrl}|${settings.clientId}|${settings.clientSecret??""}`;
  if(oidcConfiguration?.key!==key)oidcConfiguration={key,value:discoverOidc(settings)};
  return oidcConfiguration.value;
}

app.get("/api/auth/status", async (_request, response) => {
  const [result,oidcSettings] = await Promise.all([pool.query("SELECT EXISTS(SELECT 1 FROM users) AS configured"),loadOidcSettings()]);
  response.json({ setupRequired: !result.rows[0].configured, oidcEnabled: oidcSettings.enabled, localAccountsEnabled: await effectiveLocalAccountsEnabled(oidcSettings) });
});

const databaseSetupSchema=z.object({connectionString:z.string().trim().min(1).max(4000)});
function validPostgresUrl(value:string){try{return ["postgres:","postgresql:"].includes(new URL(value).protocol);}catch{return false;}}
app.get("/api/auth/database",async(_request,response)=>response.json(databaseDescription()));
app.post("/api/auth/database",async(request,response)=>{const users=await pool.query("SELECT 1 FROM users LIMIT 1");if(users.rowCount)return response.status(403).json({error:"Database setup is only available before the first administrator is created"});const parsed=databaseSetupSchema.safeParse(request.body);if(!parsed.success||!validPostgresUrl(parsed.data.connectionString))return response.status(400).json({error:"Enter a valid postgres:// or postgresql:// connection URL"});try{await testAndPrepareDatabase(parsed.data.connectionString);await saveDatabaseConnection(parsed.data.connectionString);response.json({connected:true,restarting:true});setTimeout(()=>process.exit(0),1000);}catch(error){return response.status(400).json({error:error instanceof Error?`Connection failed: ${error.message}`:"Remote PostgreSQL connection failed"});}});

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
  const oidcSettings=await loadOidcSettings();
  if (!(await effectiveLocalAccountsEnabled(oidcSettings))) return response.status(403).json({ error: "Local sign-in is disabled" });
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(401).json({ error: "Invalid account name, email or password" });
  const result = await pool.query(`SELECT id,password_hash FROM users
    WHERE enabled=true AND (lower(email)=lower($1) OR lower(display_name)=lower($1)) LIMIT 2`, [parsed.data.identifier]);
  const valid = result.rowCount === 1 && result.rows[0].password_hash && await passwordMatches(parsed.data.password, result.rows[0].password_hash);
  if (!valid) return response.status(401).json({ error: "Invalid account name, email or password" });
  await pool.query("UPDATE users SET last_login_at=now() WHERE id=$1", [result.rows[0].id]);
  await createSession(request, response, result.rows[0].id);
  return response.json({ authenticated: true });
});

app.post("/api/auth/logout", async (request, response) => { await destroySession(request, response); return response.status(204).end(); });

app.get("/api/auth/oidc/start", async (request, response) => {
  try {
  const settings=await loadOidcSettings();
  if (!settings.enabled||!settings.redirectUri) return response.status(404).json({ error: "OIDC is not configured" });
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  await pool.query("DELETE FROM oidc_flows WHERE expires_at<=now()");
  await pool.query("INSERT INTO oidc_flows(state_hash,code_verifier,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [hashToken(state), verifier]);
  const url = oidc.buildAuthorizationUrl(await getOidcConfiguration(settings), { redirect_uri: settings.redirectUri, scope: settings.requestedScopes, state, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" });
  return response.redirect(url.href);
  } catch(error) {
    await writeSystemLog("error","api","oidc-start",error instanceof Error?error.message:String(error),{});
    return response.redirect("/login?error=provider");
  }
});

app.get("/api/auth/oidc/callback", async (request, response) => {
  try{
    const settings=await loadOidcSettings();
    if(request.query.error)return response.redirect(`/login?error=denied`);
    if (!settings.enabled||!settings.redirectUri||!settings.issuerUrl || typeof request.query.state !== "string") return response.redirect("/login?error=oidc");
    const flow = await pool.query("DELETE FROM oidc_flows WHERE state_hash=$1 AND expires_at>now() RETURNING code_verifier", [hashToken(request.query.state)]);
    if (!flow.rowCount) return response.redirect("/login?error=state");
    const callback = new URL(settings.redirectUri); callback.search = new URL(request.originalUrl, "http://localhost").search;
    const configuration=await getOidcConfiguration(settings),tokens = await oidc.authorizationCodeGrant(configuration, callback, { pkceCodeVerifier: flow.rows[0].code_verifier, expectedState: request.query.state });
    const tokenClaims=tokens.claims();if(!tokenClaims?.sub)return response.redirect("/login?error=claims");
    let claims:Record<string,unknown>={...tokenClaims};
    if(tokens.access_token){try{claims={...claims,...await oidc.fetchUserInfo(configuration,tokens.access_token,tokenClaims.sub)};}catch{/* Providers may return all required claims in the ID token. */}}
    if(typeof claims.email!=="string")return response.redirect("/login?error=email");
    const issuer=typeof tokenClaims.iss==="string"?tokenClaims.iss:settings.issuerUrl,email=claims.email.toLowerCase(),displayName=typeof claims.name==="string"?claims.name:typeof claims.preferred_username==="string"?claims.preferred_username:email;
    const role=oidcRole(settings,claims),existing=await pool.query("SELECT id,enabled,oidc_issuer,oidc_subject FROM users WHERE lower(email)=lower($1)",[email]);
    if(existing.rowCount&&!existing.rows[0].enabled)return response.redirect("/login?error=disabled");
    if(existing.rowCount&&existing.rows[0].oidc_subject&&(existing.rows[0].oidc_issuer!==issuer||existing.rows[0].oidc_subject!==tokenClaims.sub))return response.redirect("/login?error=link");
    if(!existing.rowCount&&!settings.automaticProvisioning)return response.redirect("/login?error=provisioning");
    const user=existing.rowCount
      ?await pool.query("UPDATE users SET display_name=$2,oidc_issuer=$3,oidc_subject=$4,last_login_at=now(),updated_at=now() WHERE id=$1 RETURNING id",[existing.rows[0].id,displayName,issuer,tokenClaims.sub])
      :await pool.query(`INSERT INTO users(email,display_name,oidc_issuer,oidc_subject,role,last_login_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id`,[email,displayName,issuer,tokenClaims.sub,role]);
    await createSession(request,response,user.rows[0].id);return response.redirect("/#overview");
  }catch(error){await writeSystemLog("error","api","oidc-callback",error instanceof Error?error.message:String(error),{});return response.redirect("/login?error=provider");}
});

app.get("/api/public/status", async (_request, response) => {
  const [counts, incidents, changes, publicIncidents] = await Promise.all([pool.query(`SELECT CASE WHEN active.device_id IS NOT NULL THEN 'maintenance' ELSE d.status END AS status,count(*)::int AS count
    FROM devices d LEFT JOIN (SELECT DISTINCT m.device_id FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id WHERE m.ended_at IS NULL AND r.started_at<=now() AND r.estimated_end_at>now()) active ON active.device_id=d.id
    WHERE d.enabled=true GROUP BY 1`), pool.query(`SELECT count(*)::int AS count FROM incidents i WHERE status<>'resolved'
    AND NOT EXISTS(SELECT 1 FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id WHERE m.device_id=i.device_id AND m.ended_at IS NULL AND r.started_at<=now() AND r.estimated_end_at>now())`),
    pool.query(`SELECT r.change_reference AS "changeReference",r.public_description AS "publicDescription",r.started_at AS "startedAt",r.estimated_end_at AS "estimatedEndAt",
      CASE WHEN r.started_at>now() THEN 'scheduled' WHEN r.estimated_end_at<=now() THEN 'overdue' ELSE 'active' END AS status,count(m.device_id)::int AS "deviceCount"
      FROM change_records r JOIN change_record_devices m ON m.change_record_id=r.id AND m.ended_at IS NULL
      WHERE r.ended_at IS NULL GROUP BY r.id ORDER BY r.started_at LIMIT 20`),
    pool.query(`SELECT i.id,i.status,i.opened_at AS "openedAt",i.recovered_at AS "recoveredAt",i.public_message AS "publicMessage",i.public_message_updated_at AS "updatedAt"
      FROM incidents i WHERE i.status<>'resolved' AND i.archived_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id WHERE m.device_id=i.device_id AND m.ended_at IS NULL AND r.ended_at IS NULL AND r.started_at<=now() AND r.estimated_end_at>now())
      ORDER BY i.opened_at DESC LIMIT 20`)]);
  const summary = { up: 0, down: 0, degraded: 0, monitoring_error:0, unknown: 0, maintenance: 0 };
  for (const row of counts.rows) summary[row.status as keyof typeof summary] = row.count;
  const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
  const alertingTotal=total-summary.maintenance;
  const overallStatus = summary.down ? "outage" : (summary.degraded||summary.monitoring_error) ? "degraded" : (!alertingTotal || summary.up === alertingTotal) ? "operational" : "unknown";
  response.set("Cache-Control", "public, max-age=15").json({ overallStatus, counts: { ...summary, total }, activeIncidents: incidents.rows[0].count, incidents:publicIncidents.rows, changes:changes.rows, lastUpdated: new Date().toISOString() });
});

app.use("/api", requireUser);
app.use("/api", storageRouter);
app.use("/api", backupRouter);
app.use("/api", systemLogsRouter);
app.use("/api",reportRouter);

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

app.get("/api/settings/database",async(request,response)=>{if(!requireAdmin(request,response))return;response.json(databaseDescription());});
app.post("/api/settings/database",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=databaseSetupSchema.extend({confirmed:z.literal(true)}).safeParse(request.body);if(!parsed.success||!validPostgresUrl(parsed.data.connectionString))return response.status(400).json({error:"Enter a valid PostgreSQL URL and confirm the database switch"});try{await testAndPrepareDatabase(parsed.data.connectionString);await saveDatabaseConnection(parsed.data.connectionString);response.json({connected:true,restarting:true});setTimeout(()=>process.exit(0),1000);}catch(error){return response.status(400).json({error:error instanceof Error?`Connection failed: ${error.message}`:"Remote PostgreSQL connection failed"});}});

app.get("/api/settings/configuration/export",async(request,response)=>{if(!requireAdmin(request,response))return;const [groups,devices,retention]=await Promise.all([
  pool.query(`SELECT name,color FROM device_groups ORDER BY name`),
  pool.query(`SELECT d.name,d.address,d.description,d.enabled,d.os_name AS "osName",d.os_version AS "osVersion",d.device_type AS "deviceType",d.vendor,d.model,
    COALESCE((SELECT json_agg(g.name ORDER BY g.name) FROM device_group_memberships gm JOIN device_groups g ON g.id=gm.group_id WHERE gm.device_id=d.id),'[]') AS groups,
    COALESCE((SELECT json_agg(json_build_object('name',c.name,'kind',c.kind,'enabled',c.enabled,'intervalSeconds',c.interval_seconds,'timeoutMs',c.timeout_ms,'config',c.config) ORDER BY c.created_at) FROM checks c WHERE c.device_id=d.id),'[]') AS checks,
    cred.name AS "sshCredentialName",ssh.port AS "sshPort" FROM devices d LEFT JOIN device_ssh_credentials ssh ON ssh.device_id=d.id LEFT JOIN credentials cred ON cred.id=ssh.credential_id WHERE d.id<>'00000000-0000-0000-0000-000000000001' ORDER BY d.name`),
  pool.query(`SELECT raw_days AS "rawDays",five_minute_days AS "fiveMinuteDays",hourly_days AS "hourlyDays",daily_days AS "dailyDays",incident_days AS "incidentDays",configuration_days AS "configurationDays" FROM retention_settings WHERE id=true`)
]);const payload={format:"hedgesight-configuration",version:1,exportedAt:new Date().toISOString(),includesSecrets:false,groups:groups.rows,devices:devices.rows,retention:retention.rows[0]};response.setHeader("Content-Disposition",`attachment; filename="hedgesight-configuration-${new Date().toISOString().slice(0,10)}.json"`);response.json(payload);});

const importSchema=z.object({format:z.literal("hedgesight-configuration"),version:z.literal(1),groups:z.array(z.object({name:z.string().min(1).max(80),color:z.string().regex(/^#[0-9a-f]{6}$/i)})).max(1000),devices:z.array(z.object({name:z.string().min(1).max(120),address:z.string().min(1).max(255),description:z.string().max(1000).default(""),enabled:z.boolean().default(true),osName:z.string().nullable().optional(),osVersion:z.string().nullable().optional(),deviceType:z.string().nullable().optional(),vendor:z.string().nullable().optional(),model:z.string().nullable().optional(),groups:z.array(z.string()).default([]),checks:z.array(z.object({name:z.string(),kind:z.enum(["ping","http","snmp","ssh","vsphere"]),enabled:z.boolean(),intervalSeconds:z.number().int(),timeoutMs:z.number().int(),config:z.record(z.string(),z.unknown())})).default([]),sshCredentialName:z.string().nullable().optional(),sshPort:z.number().int().nullable().optional()})).max(10000),retention:z.object({rawDays:z.number().int(),fiveMinuteDays:z.number().int(),hourlyDays:z.number().int(),dailyDays:z.number().int(),incidentDays:z.number().int(),configurationDays:z.number().int()})});
app.post("/api/settings/configuration/import",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=z.object({mode:z.enum(["merge","replace"]),configuration:importSchema}).safeParse(request.body);if(!parsed.success){const issues=parsed.error.issues.slice(0,5).map(issue=>`${issue.path.join(".")||"package"}: ${issue.message}`);return response.status(400).json({error:`This is not a valid HedgeSight configuration package. ${issues.join("; ")}`,issues});}const client=await pool.connect();try{await client.query("BEGIN");if(parsed.data.mode==="replace"){await client.query(`DELETE FROM devices WHERE id<>'00000000-0000-0000-0000-000000000001'`);await client.query("DELETE FROM device_groups");}const groupIds=new Map<string,string>();for(const group of parsed.data.configuration.groups){const result=await client.query(`INSERT INTO device_groups(name,color) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET color=$2 RETURNING id`,[group.name,group.color]);groupIds.set(group.name,result.rows[0].id);}let imported=0,missingCredentials=0;for(const device of parsed.data.configuration.devices){let result=await client.query(`SELECT id FROM devices WHERE name=$1 AND address=$2 LIMIT 1`,[device.name,device.address]);if(result.rowCount)await client.query(`UPDATE devices SET description=$2,enabled=$3,os_name=$4,os_version=$5,device_type=$6,vendor=$7,model=$8,updated_at=now() WHERE id=$1`,[result.rows[0].id,device.description,device.enabled,device.osName??null,device.osVersion??null,device.deviceType??null,device.vendor??null,device.model??null]);else result=await client.query(`INSERT INTO devices(name,address,description,enabled,os_name,os_version,device_type,vendor,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[device.name,device.address,device.description,device.enabled,device.osName??null,device.osVersion??null,device.deviceType??null,device.vendor??null,device.model??null]);const deviceId=result.rows[0].id;await client.query("DELETE FROM checks WHERE device_id=$1",[deviceId]);for(const check of device.checks)await client.query(`INSERT INTO checks(device_id,name,kind,enabled,interval_seconds,timeout_ms,config) VALUES($1,$2,$3,$4,$5,$6,$7)`,[deviceId,check.name,check.kind,check.enabled,check.intervalSeconds,check.timeoutMs,check.config]);await client.query("DELETE FROM device_group_memberships WHERE device_id=$1",[deviceId]);for(const name of device.groups){const groupId=groupIds.get(name);if(groupId)await client.query(`INSERT INTO device_group_memberships(device_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[deviceId,groupId]);}if(device.sshCredentialName){const credential=await client.query("SELECT id FROM credentials WHERE name=$1",[device.sshCredentialName]);if(credential.rowCount)await client.query(`INSERT INTO device_ssh_credentials(device_id,credential_id,port) VALUES($1,$2,$3) ON CONFLICT(device_id) DO UPDATE SET credential_id=$2,port=$3,host_key_fingerprint=NULL`,[deviceId,credential.rows[0].id,device.sshPort??22]);else missingCredentials++;}imported++;}const retention=parsed.data.configuration.retention;await client.query(`UPDATE retention_settings SET raw_days=$1,five_minute_days=$2,hourly_days=$3,daily_days=$4,incident_days=$5,configuration_days=$6,updated_at=now() WHERE id=true`,[retention.rawDays,retention.fiveMinuteDays,retention.hourlyDays,retention.dailyDays,retention.incidentDays,retention.configurationDays]);await client.query("COMMIT");return response.json({imported,missingCredentials});}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}});

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
  const localAccountsEnabled=await effectiveLocalAccountsEnabled(settings);
  response.json({
    localAccountsEnabled,
    localAuthRecoveryActive:localAccountsEnabled&&!settings.localAccountsEnabled,
    oidc: { enabled: settings.enabled, automaticProvisioning:settings.automaticProvisioning,defaultRole:settings.defaultRole,groupClaim:settings.groupClaim,requestedScopes:settings.requestedScopes,viewerGroups:settings.viewerGroups,operatorGroups:settings.operatorGroups,adminGroups:settings.adminGroups,issuerUrl: settings.issuerUrl, clientId:settings.clientId, clientIdConfigured:Boolean(settings.clientId), clientSecretConfigured: Boolean(settings.clientSecret), redirectUri: settings.redirectUri,source:settings.source },
    sessionDays: Math.max(1, Number(process.env.SESSION_DAYS ?? 7)), cookieSecure: process.env.COOKIE_SECURE === "true", trustProxy: process.env.TRUST_PROXY === "true",
  });
});

app.put("/api/settings/authentication/oidc",async(request,response)=>{
  if(!requireAdmin(request,response))return;
  const parsed=z.object({enabled:z.boolean(),localAccountsEnabled:z.boolean().default(true),automaticProvisioning:z.boolean().default(true),defaultRole:z.enum(["viewer","operator","admin"]).default("viewer"),groupClaim:z.string().trim().min(1).max(120).default("groups"),requestedScopes:z.string().trim().regex(/^openid(?: [A-Za-z0-9._:-]+)*$/).max(500).default("openid email profile"),viewerGroups:z.array(z.string().trim().min(1).max(200)).max(100).default([]),operatorGroups:z.array(z.string().trim().min(1).max(200)).max(100).default([]),adminGroups:z.array(z.string().trim().min(1).max(200)).max(100).default([]),issuerUrl:z.union([z.string().trim().url(),z.literal("")]),clientId:z.string().trim().max(500),clientSecret:z.string().max(2000).optional().default(""),redirectUri:z.union([z.string().trim().url(),z.literal("")])}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"Enter valid issuer and callback URLs"});
  if(parsed.data.enabled&&(!parsed.data.issuerUrl||!parsed.data.clientId||!parsed.data.redirectUri))return response.status(400).json({error:"Issuer URL, client ID and callback URL are required when OIDC is enabled"});
  if(!parsed.data.localAccountsEnabled&&!parsed.data.enabled)return response.status(400).json({error:"Enable and configure OIDC before disabling local sign-in"});
  if(!parsed.data.localAccountsEnabled){
    const linkedAdmin=await pool.query("SELECT 1 FROM users WHERE enabled=true AND role='admin' AND oidc_subject IS NOT NULL LIMIT 1");
    if(!linkedAdmin.rowCount)return response.status(409).json({error:"Local sign-in stays enabled until an administrator has signed in successfully through OIDC at least once"});
  }
  const key=process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me";
  if(parsed.data.enabled){const current=await loadOidcSettings(),secret=parsed.data.clientSecret||current.clientSecret;if(!secret)return response.status(400).json({error:"Client secret is required for the confidential OIDC client"});try{await discoverOidc({issuerUrl:parsed.data.issuerUrl,clientId:parsed.data.clientId,clientSecret:secret});}catch(error){return response.status(400).json({error:`Provider discovery failed: ${error instanceof Error?error.message:"unable to contact issuer"}`});}}
  await pool.query(`INSERT INTO oidc_settings(singleton,enabled,local_accounts_enabled,automatic_provisioning,default_role,group_claim,requested_scopes,viewer_groups,operator_groups,admin_groups,issuer_url,client_id,client_secret_encrypted,redirect_uri,updated_by)
    VALUES(true,$1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),CASE WHEN $12='' THEN NULL ELSE pgp_sym_encrypt($12,$13) END,NULLIF($14,''),$15)
    ON CONFLICT(singleton) DO UPDATE SET enabled=EXCLUDED.enabled,local_accounts_enabled=EXCLUDED.local_accounts_enabled,automatic_provisioning=EXCLUDED.automatic_provisioning,default_role=EXCLUDED.default_role,group_claim=EXCLUDED.group_claim,requested_scopes=EXCLUDED.requested_scopes,viewer_groups=EXCLUDED.viewer_groups,operator_groups=EXCLUDED.operator_groups,admin_groups=EXCLUDED.admin_groups,issuer_url=EXCLUDED.issuer_url,client_id=EXCLUDED.client_id,
    client_secret_encrypted=CASE WHEN $12='' THEN oidc_settings.client_secret_encrypted ELSE EXCLUDED.client_secret_encrypted END,
    redirect_uri=EXCLUDED.redirect_uri,updated_at=now(),updated_by=EXCLUDED.updated_by`,[parsed.data.enabled,parsed.data.localAccountsEnabled,parsed.data.automaticProvisioning,parsed.data.defaultRole,parsed.data.groupClaim,parsed.data.requestedScopes,parsed.data.viewerGroups,parsed.data.operatorGroups,parsed.data.adminGroups,parsed.data.issuerUrl,parsed.data.clientId,parsed.data.clientSecret,key,parsed.data.redirectUri,response.locals.user.id]);
  oidcConfiguration=null;
  return response.json({saved:true,tested:parsed.data.enabled});
});

app.post("/api/settings/authentication/oidc/test",async(request,response)=>{if(!requireAdmin(request,response))return;try{const saved=await loadOidcSettings(),input=z.object({issuerUrl:z.string().trim().url(),clientId:z.string().trim().min(1),clientSecret:z.string().optional().default("")}).safeParse(request.body);const settings=input.success?{issuerUrl:input.data.issuerUrl,clientId:input.data.clientId,clientSecret:input.data.clientSecret||saved.clientSecret}:saved;if(!settings.issuerUrl||!settings.clientId)return response.status(409).json({error:"Enter an issuer URL and client ID first"});if(!settings.clientSecret)return response.status(409).json({error:"Enter the client secret, or save one first"});const configuration=await discoverOidc(settings),metadata=configuration.serverMetadata();return response.json({ok:true,issuer:metadata.issuer,authorizationEndpoint:metadata.authorization_endpoint,tokenEndpoint:metadata.token_endpoint,userInfoEndpoint:metadata.userinfo_endpoint??null,jwksUri:metadata.jwks_uri,pkceSupported:metadata.code_challenge_methods_supported?.includes("S256")??false});}catch(error){return response.status(400).json({error:`Provider test failed: ${error instanceof Error?error.message:"unable to contact issuer"}`});}});

app.get("/api/dashboard", async (_request, response) => {
  const [counts, devices, workers, incidents, changes, databaseRuntime] = await Promise.all([
    pool.query(`SELECT CASE WHEN active.device_id IS NOT NULL THEN 'maintenance' ELSE d.status END AS status,count(*)::int AS count
      FROM devices d LEFT JOIN (SELECT DISTINCT m.device_id FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id WHERE m.ended_at IS NULL AND r.started_at<=now() AND r.estimated_end_at>now()) active ON active.device_id=d.id GROUP BY 1`),
    pool.query(`SELECT d.id, d.name, d.address, d.status, d.last_seen_at AS "lastSeenAt",
      count(c.id)::int AS checks FROM devices d LEFT JOIN checks c ON c.device_id = d.id
      GROUP BY d.id ORDER BY d.name`),
    pool.query(`SELECT id, name, version, capabilities, runtime_metrics AS "runtimeMetrics",last_seen_at AS "lastSeenAt",
      CASE WHEN last_seen_at > now() - interval '60 seconds' THEN 'online' ELSE 'offline' END AS status
      FROM workers ORDER BY name`),
    pool.query(`SELECT i.id, d.name AS "deviceName", c.name AS "checkName", i.status,
      i.opened_at AS "openedAt", i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",u.display_name AS "investigatorName",
      (maintenance.id IS NOT NULL) AS "coveredByChange",maintenance.change_reference AS "changeReference",maintenance.manager_name AS "changeManagerName"
      FROM incidents i JOIN checks c ON c.id = i.check_id JOIN devices d ON d.id = c.device_id
      LEFT JOIN users u ON u.id=i.investigating_user_id
      LEFT JOIN LATERAL (SELECT change.id,change.change_reference,manager.display_name AS manager_name FROM change_record_devices membership JOIN change_records change ON change.id=membership.change_record_id JOIN users manager ON manager.id=change.change_manager_user_id WHERE membership.device_id=i.device_id AND membership.ended_at IS NULL AND change.ended_at IS NULL AND change.started_at<=now() AND change.estimated_end_at>now() ORDER BY change.started_at DESC LIMIT 1) maintenance ON true
      WHERE i.archived_at IS NULL
      ORDER BY i.opened_at DESC LIMIT 10`),
    pool.query(`SELECT r.id,r.change_reference AS "changeReference",r.public_description AS "publicDescription",u.id AS "managerId",u.display_name AS "managerName",r.started_at AS "startedAt",r.estimated_end_at AS "estimatedEndAt",
      CASE WHEN r.started_at>now() THEN 'scheduled' WHEN r.estimated_end_at<now() THEN 'overdue' ELSE 'active' END AS status,
      count(m.device_id)::int AS "deviceCount",array_agg(d.name ORDER BY d.name) AS "deviceNames"
      FROM change_records r JOIN users u ON u.id=r.change_manager_user_id JOIN change_record_devices m ON m.change_record_id=r.id AND m.ended_at IS NULL
      JOIN devices d ON d.id=m.device_id WHERE r.ended_at IS NULL GROUP BY r.id,u.id ORDER BY r.started_at DESC`),
    pool.query(`SELECT pg_database_size(current_database())::text AS "sizeBytes",
      count(*) FILTER (WHERE datname=current_database())::int AS "activeConnections",
      current_setting('max_connections')::int AS "maxConnections",
      COALESCE((SELECT xact_commit+xact_rollback FROM pg_stat_database WHERE datname=current_database()),0)::text AS transactions,
      COALESCE((SELECT round(100*blks_hit::numeric/NULLIF(blks_hit+blks_read,0),1) FROM pg_stat_database WHERE datname=current_database()),100)::float AS "cacheHitPercent",
      COALESCE(inet_server_addr()::text,'local') AS hostname FROM pg_stat_activity`),
  ]);
  const summary = { up: 0, down: 0, degraded: 0, monitoring_error:0, unknown: 0 };
  let maintenanceCount=0;
  for (const row of counts.rows) { if(row.status==="maintenance") maintenanceCount=row.count; else summary[row.status as keyof typeof summary] = row.count; }
  const totalMemory=totalmem(),usedMemory=totalMemory-freemem();
  response.json({ counts: summary, maintenanceCount, devices: devices.rows, workers: workers.rows, recentIncidents: incidents.rows, activeChanges:changes.rows,
    infrastructure:{sampledAt:new Date().toISOString(),application:{version,uptimeSeconds:Math.round(process.uptime()),memoryBytes:process.memoryUsage().rss,memoryUsedPercent:Number((usedMemory/totalMemory*100).toFixed(1)),load1:Number(loadavg()[0].toFixed(2)),cpuCount:cpus().length,hostname:hostname()},database:databaseRuntime.rows[0]} });
});

app.get("/api/platform/database-tables",async(_request,response)=>{
  const result=await pool.query(`SELECT schemaname AS schema,relname AS name,n_live_tup::text AS "estimatedRows",
    pg_total_relation_size(relid)::text AS "totalBytes",pg_relation_size(relid)::text AS "dataBytes",pg_indexes_size(relid)::text AS "indexBytes"
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC,schemaname,relname`);
  response.json({sampledAt:new Date().toISOString(),tables:result.rows});
});

app.get("/api/incidents",async(_request,response)=>{
  const result=await pool.query(`SELECT i.id,i.status,i.priority,i.opened_at AS "openedAt",i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",i.archived_at AS "archivedAt",
    d.id AS "deviceId",d.name AS "deviceName",d.address,d.status AS "deviceStatus",c.name AS "checkName",c.kind AS "checkKind",
    u.display_name AS "investigatorName",(SELECT count(*)::int FROM incident_updates x WHERE x.incident_id=i.id) AS "updateCount",
    m.id AS "majorIncidentId",CASE WHEN m.id IS NULL THEN NULL ELSE 'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') END AS "majorIncidentReference",
    m.title AS "majorIncidentTitle",m.severity AS "majorIncidentSeverity",m.status AS "majorIncidentStatus"
    FROM incidents i JOIN checks c ON c.id=i.check_id JOIN devices d ON d.id=c.device_id LEFT JOIN users u ON u.id=i.investigating_user_id
    LEFT JOIN major_incident_members mm ON mm.incident_id=i.id LEFT JOIN major_incidents m ON m.id=mm.major_incident_id
    ORDER BY CASE WHEN i.status='resolved' THEN 1 ELSE 0 END,CASE i.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,i.opened_at DESC LIMIT 200`);
  response.json(result.rows);
});

app.get("/api/incidents/:incidentId",async(request,response)=>{
  const result=await pool.query(`SELECT i.id,i.status,i.priority,i.opened_at AS "openedAt",i.recovered_at AS "recoveredAt",i.resolved_at AS "resolvedAt",i.archived_at AS "archivedAt",
    d.id AS "deviceId",d.name AS "deviceName",d.address,d.description AS "deviceDescription",d.status AS "deviceStatus",
    c.name AS "checkName",c.kind AS "checkKind",c.last_status AS "checkStatus",primary_check.last_status AS "availabilityStatus",opening.message AS "openingMessage",i.public_message AS "publicMessage",i.public_message_updated_at AS "publicMessageUpdatedAt",
    investigator.id AS "investigatorId",investigator.display_name AS "investigatorName",closer.display_name AS "closedByName"
    FROM incidents i JOIN checks c ON c.id=i.check_id JOIN devices d ON d.id=c.device_id
    LEFT JOIN probe_results opening ON opening.id=i.opening_result_id LEFT JOIN users investigator ON investigator.id=i.investigating_user_id
    LEFT JOIN users closer ON closer.id=i.closed_by_user_id LEFT JOIN LATERAL (SELECT last_status FROM checks WHERE device_id=i.device_id AND kind='ping' ORDER BY created_at LIMIT 1) primary_check ON true WHERE i.id=$1`,[request.params.incidentId]);
  if(!result.rowCount)return response.status(404).json({error:"Incident not found"});
  const updates=await pool.query(`SELECT x.id,x.body,x.created_at AS "createdAt",COALESCE(u.display_name,'System') AS "authorName",u.id AS "authorId"
    FROM incident_updates x LEFT JOIN users u ON u.id=x.user_id WHERE x.incident_id=$1 ORDER BY x.created_at`,[request.params.incidentId]);
  response.json({...result.rows[0],updates:updates.rows});
});

app.put("/api/incidents/:incidentId/priority",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({priority:z.enum(["P1","P2","P3","P4"])}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Choose P1, P2, P3 or P4"});const result=await pool.query("UPDATE incidents SET priority=$2,last_activity_at=now() WHERE id=$1 RETURNING priority",[request.params.incidentId,parsed.data.priority]);if(!result.rowCount)return response.status(404).json({error:"Incident not found"});response.json(result.rows[0]);});

app.post("/api/incidents/:incidentId/claim",async(request,response)=>{
  const user=response.locals.user;
  const result=await pool.query(`UPDATE incidents i SET status='under_investigation',investigating_user_id=$2
    WHERE i.id=$1 AND i.status IN ('open','pending_investigation','under_investigation')
      AND (i.investigating_user_id IS NULL OR i.investigating_user_id=$2) RETURNING i.id`,[request.params.incidentId,user.id]);
  if(!result.rowCount)return response.status(409).json({error:"This incident is resolved or assigned to another investigator"});
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

app.put("/api/incidents/:incidentId/public-message",async(request,response)=>{
  if(!requireOperator(response))return;
  const parsed=z.object({message:z.string().trim().max(2000)}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"Public incident messages must be 2,000 characters or fewer"});
  const message=parsed.data.message||null;
  const result=await pool.query(`UPDATE incidents SET public_message=$2,public_message_updated_at=now(),public_message_updated_by_user_id=$3 WHERE id=$1 RETURNING id`,[request.params.incidentId,message,response.locals.user.id]);
  if(!result.rowCount)return response.status(404).json({error:"Incident not found"});
  return response.json({saved:true,publicMessage:message});
});

app.post("/api/incidents/:incidentId/resolve",async(request,response)=>{
  const result=await pool.query(`UPDATE incidents i SET status='resolved',recovered_at=COALESCE(i.recovered_at,now()),resolved_at=now(),closed_by_user_id=$2
    WHERE i.id=$1 AND i.status<>'resolved' AND EXISTS(SELECT 1 FROM checks primary_check WHERE primary_check.device_id=i.device_id AND primary_check.kind='ping' AND primary_check.last_status='up')
      AND EXISTS(SELECT 1 FROM incident_updates x WHERE x.incident_id=i.id) RETURNING id`,[request.params.incidentId,response.locals.user.id]);
  if(!result.rowCount)return response.status(409).json({error:"Primary availability must be responding and the incident must have at least one update before it can be resolved"});
  void queueIncidentEvent(request.params.incidentId,"incident_resolved",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{incidentId:request.params.incidentId}));
  return response.json({resolved:true});
});
app.post("/api/incidents/:incidentId/archive",async(request,response)=>{const result=await pool.query(`UPDATE incidents SET archived_at=now(),archived_by_user_id=$2 WHERE id=$1 AND status='resolved' AND archived_at IS NULL RETURNING id`,[request.params.incidentId,response.locals.user.id]);if(!result.rowCount)return response.status(409).json({error:"Only a resolved, unarchived incident can be archived"});return response.json({archived:true});});

app.get("/api/monitoring-alerts",async(_request,response)=>{const result=await pool.query(`SELECT a.id,a.kind,a.state,a.message,a.occurrence_count AS "occurrenceCount",a.first_seen_at AS "firstSeenAt",a.last_seen_at AS "lastSeenAt",d.id AS "deviceId",d.name AS "deviceName",d.address,c.id AS "checkId",c.name AS "checkName",c.kind AS "checkKind" FROM monitoring_alerts a JOIN devices d ON d.id=a.device_id JOIN checks c ON c.id=a.check_id WHERE a.state='open' ORDER BY CASE a.kind WHEN 'monitoring_unavailable' THEN 1 ELSE 2 END,a.last_seen_at DESC`);response.json(result.rows);});
app.post("/api/monitoring-alerts/:alertId/dismiss",async(request,response)=>{if(!requireOperator(response))return;const result=await pool.query(`UPDATE monitoring_alerts SET state='dismissed' WHERE id=$1 AND state='open' RETURNING id`,[request.params.alertId]);response.json({dismissed:Boolean(result.rowCount)});});
app.post("/api/monitoring-alerts/:alertId/incident",async(request,response)=>{if(!requireOperator(response))return;const client=await pool.connect();try{await client.query('BEGIN');const alert=await client.query(`SELECT * FROM monitoring_alerts WHERE id=$1 AND state='open' FOR UPDATE`,[request.params.alertId]);if(!alert.rowCount){await client.query('ROLLBACK');return response.status(409).json({error:'Alert is no longer active'});}let incident=await client.query(`SELECT id FROM incidents WHERE device_id=$1 AND status<>'resolved' LIMIT 1`,[alert.rows[0].device_id]);if(!incident.rowCount)incident=await client.query(`INSERT INTO incidents(device_id,check_id,recovered_at,status,last_activity_at) VALUES($1,$2,now(),'pending_investigation',now()) RETURNING id`,[alert.rows[0].device_id,alert.rows[0].check_id]);await client.query(`INSERT INTO incident_updates(incident_id,user_id,body) VALUES($1,$2,$3)`,[incident.rows[0].id,response.locals.user.id,`Incident manually raised from monitoring alert: ${alert.rows[0].message}`]);await client.query(`UPDATE monitoring_alerts SET state='incident',linked_incident_id=$2 WHERE id=$1`,[request.params.alertId,incident.rows[0].id]);await client.query('COMMIT');response.status(201).json({incidentId:incident.rows[0].id});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}});
app.post("/api/monitoring-alerts/:alertId/task",async(request,response)=>{if(!requireOperator(response))return;const client=await pool.connect();try{await client.query('BEGIN');const alert=await client.query(`SELECT a.*,d.name AS device_name,c.name AS check_name FROM monitoring_alerts a JOIN devices d ON d.id=a.device_id JOIN checks c ON c.id=a.check_id WHERE a.id=$1 AND a.state='open' FOR UPDATE OF a`,[request.params.alertId]);if(!alert.rowCount){await client.query('ROLLBACK');return response.status(409).json({error:'Alert is no longer active'});}const item=alert.rows[0],task=await client.query(`INSERT INTO tasks(title,description,priority,created_by_user_id) VALUES($1,$2,'P2',$3) RETURNING id`,[`${item.device_name}: ${item.check_name}`,`Follow up monitoring alert: ${item.message}`,response.locals.user.id]);await client.query(`UPDATE monitoring_alerts SET state='task',linked_task_id=$2 WHERE id=$1`,[request.params.alertId,task.rows[0].id]);await client.query('COMMIT');response.status(201).json({taskId:task.rows[0].id});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}});

const alertFolderSchema=z.object({name:z.string().trim().min(1).max(120),mutedUntil:z.string().datetime().nullable().optional()});
const alertChannelSchema=z.object({name:z.string().trim().min(1).max(120),kind:z.enum(["discord","teams","webhook"]),endpoint:z.string().url().max(4000),enabled:z.boolean().default(true)});
const alertTriggers=["check_down","check_degraded","check_recovered","incident_created","incident_resolved","major_incident_created","major_incident_resolved","maintenance_created","maintenance_started","maintenance_ended","maintenance_overrun","task_created","task_assigned","task_completed"] as const;
const alertRuleSchema=z.object({name:z.string().trim().min(1).max(160),folderId:z.string().uuid().nullable().default(null),triggerKind:z.enum(alertTriggers),severity:z.enum(["info","warning","critical"]).default("warning"),messageTemplate:z.string().trim().min(1).max(4000).default("$SEVERITY: $EVENT for $NODE at $TIME. $MESSAGE"),deviceIds:z.array(z.string().uuid()).max(500).default([]),checkKinds:z.array(z.string().max(40)).max(20).default([]),channelIds:z.array(z.string().uuid()).max(50).default([]),audienceGroupIds:z.array(z.string().uuid()).max(50).default([]),cooldownSeconds:z.number().int().min(0).max(604800).default(300),notifyRecovery:z.boolean().default(true),enabled:z.boolean().default(true)}).refine(value=>value.channelIds.length>0||value.audienceGroupIds.length>0);
const channelKey=()=>process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me";
function alertPayload(kind:string,title:string,message:string,severity:string){
  if(kind==="discord")return {content:`**${severity.toUpperCase()} · ${title}**\n${message}`};
  if(kind==="teams")return {type:"message",attachments:[{contentType:"application/vnd.microsoft.card.adaptive",content:{type:"AdaptiveCard",version:"1.4",body:[{type:"TextBlock",weight:"Bolder",size:"Medium",text:`${severity.toUpperCase()} · ${title}`},{type:"TextBlock",wrap:true,text:message}]}}]};
  return {source:"HedgeSight",title,message,severity,timestamp:new Date().toISOString()};
}
async function sendAlertWebhook(kind:string,endpoint:string,title:string,message:string,severity:string){const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","user-agent":"HedgeSight-Alerting/1.0"},body:JSON.stringify(alertPayload(kind,title,message,severity)),signal:AbortSignal.timeout(10_000)});if(!response.ok)throw Object.assign(new Error(`Remote endpoint returned HTTP ${response.status}`),{status:response.status});return response.status;}
type AlertEvent={triggerKind:string;deviceId?:string|null;deviceName?:string;checkId?:string|null;checkName?:string;checkKind?:string;message:string;entityType?:string;entityId?:string;reference?:string;actor?:string};
function renderAlertMessage(template:string,event:AlertEvent,severity:string,at=new Date()){const values:Record<string,string>={$NODE:event.deviceName??"HedgeSight",$TIME:at.toLocaleString("en-GB",{timeZone:"Europe/London"}),$TIME_ISO:at.toISOString(),$CHECK:event.checkName??"",$CHECK_TYPE:(event.checkKind??"").toUpperCase(),$STATUS:event.triggerKind.replace("check_","").replaceAll("_"," "),$EVENT:event.triggerKind.replaceAll("_"," "),$REFERENCE:event.reference??"",$ACTOR:event.actor??"System",$SEVERITY:severity.toUpperCase(),$MESSAGE:event.message};return template.replace(/\$(?:TIME_ISO|CHECK_TYPE|REFERENCE|SEVERITY|MESSAGE|STATUS|EVENT|ACTOR|CHECK|NODE|TIME)\b/g,token=>values[token]??token);}
async function queueAlertEvent(event:AlertEvent){
  const rules=await pool.query(`SELECT r.* FROM alert_rules r LEFT JOIN alert_folders f ON f.id=r.folder_id WHERE r.enabled=true AND (r.trigger_kind=$1 OR ($1='check_recovered' AND r.notify_recovery=true AND r.trigger_kind IN ('check_down','check_degraded') AND EXISTS(SELECT 1 FROM alert_occurrences o WHERE o.rule_id=r.id AND o.check_id=$2 AND o.trigger_kind=r.trigger_kind))) AND (r.muted_until IS NULL OR r.muted_until<=now()) AND (f.id IS NULL OR f.muted_until IS NULL OR f.muted_until<=now()) AND ($1='check_recovered' OR r.last_triggered_at IS NULL OR r.last_triggered_at<=now()-make_interval(secs=>r.cooldown_seconds))`,[event.triggerKind,event.checkId??null]);
  for(const rule of rules.rows){
    const conditions=rule.conditions??{},deviceIds:string[]=conditions.deviceIds??[],checkKinds:string[]=conditions.checkKinds??[];
    if(deviceIds.length&&(!event.deviceId||!deviceIds.includes(event.deviceId)))continue;
    if(checkKinds.length&&(!event.checkKind||!checkKinds.includes(event.checkKind)))continue;
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const title=`${event.deviceName} · ${event.checkName}`,message=renderAlertMessage(rule.message_template,event,rule.severity);
      const occurrence=await client.query(`INSERT INTO alert_occurrences(rule_id,rule_name,trigger_kind,severity,device_id,check_id,title,message,context,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[rule.id,rule.name,event.triggerKind,rule.severity,event.deviceId??null,event.checkId??null,title,message,event,event.entityType??null,event.entityId??null]);
      await client.query(`INSERT INTO alert_deliveries(occurrence_id,channel_id,channel_name,channel_kind) SELECT $1,c.id,c.name,c.kind FROM alert_channels c WHERE c.id IN (SELECT unnest($2::uuid[]) UNION SELECT ngc.channel_id FROM notification_group_channels ngc JOIN notification_groups ng ON ng.id=ngc.group_id WHERE ng.enabled=true AND ngc.group_id=ANY($3::uuid[])) AND c.enabled=true AND (c.muted_until IS NULL OR c.muted_until<=now())`,[occurrence.rows[0].id,rule.channel_ids,rule.audience_group_ids]);
      await client.query("UPDATE alert_rules SET last_triggered_at=now(),updated_at=now() WHERE id=$1",[rule.id]);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
}
async function queueIncidentEvent(id:string,triggerKind:"incident_created"|"incident_resolved",actor:string){const result=await pool.query(`SELECT i.id,d.id AS device_id,d.name AS device_name,c.id AS check_id,c.name AS check_name,c.kind AS check_kind,i.priority FROM incidents i JOIN devices d ON d.id=i.device_id JOIN checks c ON c.id=i.check_id WHERE i.id=$1`,[id]);if(!result.rowCount)return;const item=result.rows[0];await queueAlertEvent({triggerKind,deviceId:item.device_id,deviceName:item.device_name,checkId:item.check_id,checkName:item.check_name,checkKind:item.check_kind,entityType:"incident",entityId:id,reference:`INC-${id.slice(0,8).toUpperCase()}`,actor,message:`${item.priority} incident ${triggerKind==="incident_created"?"opened":"resolved"} for ${item.device_name}.`});}
async function queueMajorEvent(id:string,triggerKind:"major_incident_created"|"major_incident_resolved",actor:string){const result=await pool.query(`SELECT id,title,severity,'MI-'||to_char(opened_at,'YYYY')||'-'||lpad(number::text,4,'0') AS reference FROM major_incidents WHERE id=$1`,[id]);if(!result.rowCount)return;const item=result.rows[0];await queueAlertEvent({triggerKind,deviceName:item.title,entityType:"major_incident",entityId:id,reference:item.reference,actor,message:`${item.severity} major incident ${triggerKind.endsWith("created")?"declared":"resolved"}: ${item.title}.`});}
async function queueChangeEvent(id:string,triggerKind:"maintenance_created"|"maintenance_started"|"maintenance_ended"|"maintenance_overrun",actor:string){const result=await pool.query(`SELECT r.id,r.change_reference,r.public_description,u.display_name AS manager_name,array_agg(d.name ORDER BY d.name) AS devices FROM change_records r JOIN users u ON u.id=r.change_manager_user_id JOIN change_record_devices m ON m.change_record_id=r.id JOIN devices d ON d.id=m.device_id WHERE r.id=$1 GROUP BY r.id,u.display_name`,[id]);if(!result.rowCount)return;const item=result.rows[0];await queueAlertEvent({triggerKind,deviceName:item.devices.join(", "),entityType:"maintenance",entityId:id,reference:item.change_reference,actor,message:`${item.public_description} Change manager: ${item.manager_name}.`});}
async function queueTaskEvent(id:string,triggerKind:"task_created"|"task_assigned"|"task_completed",actor:string){const result=await pool.query(`SELECT t.id,t.title,t.priority,u.display_name AS assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_user_id WHERE t.id=$1`,[id]);if(!result.rowCount)return;const item=result.rows[0];await queueAlertEvent({triggerKind,deviceName:item.title,entityType:"task",entityId:id,reference:`TASK-${id.slice(0,8).toUpperCase()}`,actor,message:`${item.priority} task ${triggerKind.replace("task_","")}${item.assignee?` for ${item.assignee}`:""}: ${item.title}.`});}
async function processAlertDeliveries(){
  const deliveries=await pool.query(`UPDATE alert_deliveries d SET status='sending',attempts=attempts+1,updated_at=now() WHERE d.id IN (SELECT id FROM alert_deliveries WHERE status IN ('queued','failed') AND next_attempt_at<=now() AND attempts<5 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING d.id,d.channel_id,d.channel_kind,d.attempts,d.occurrence_id`);
  for(const delivery of deliveries.rows){try{const detail=await pool.query(`SELECT pgp_sym_decrypt(c.endpoint_encrypted,$2) AS endpoint,o.title,o.message,o.severity FROM alert_deliveries d JOIN alert_channels c ON c.id=d.channel_id JOIN alert_occurrences o ON o.id=d.occurrence_id WHERE d.id=$1`,[delivery.id,channelKey()]);if(!detail.rowCount)throw new Error("Channel was removed");const item=detail.rows[0],status=await sendAlertWebhook(delivery.channel_kind,item.endpoint,item.title,item.message,item.severity);await pool.query("UPDATE alert_deliveries SET status='delivered',delivered_at=now(),response_status=$2,last_error=NULL,updated_at=now() WHERE id=$1",[delivery.id,status]);await pool.query("UPDATE alert_channels SET last_success_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",[delivery.channel_id]);}catch(error){const message=error instanceof Error?error.message:String(error),final=delivery.attempts>=5;await pool.query(`UPDATE alert_deliveries SET status='failed',last_error=$2,next_attempt_at=CASE WHEN $3 THEN next_attempt_at ELSE now()+make_interval(secs=>LEAST(3600,30*power(2,attempts))) END,updated_at=now() WHERE id=$1`,[delivery.id,message,final]);await pool.query("UPDATE alert_channels SET last_failure_at=now(),last_error=$2,updated_at=now() WHERE id=$1",[delivery.channel_id,message]);}}
}
async function processWorkflowNotificationEvents(){
  const events=await pool.query(`WITH candidates AS (
    SELECT id,'maintenance_started'::text AS kind FROM change_records WHERE ended_at IS NULL AND started_at<=now() AND estimated_end_at>now()
    UNION ALL SELECT id,'maintenance_overrun' FROM change_records WHERE ended_at IS NULL AND estimated_end_at<=now()
  ) INSERT INTO notification_event_marks(entity_type,entity_id,event_kind)
    SELECT 'maintenance',id,kind FROM candidates ON CONFLICT DO NOTHING RETURNING entity_id,event_kind`);
  for(const event of events.rows)await queueChangeEvent(event.entity_id,event.event_kind,"System scheduler");
}

app.get("/api/alerts",async(_request,response)=>{const [folders,rules,channels,groups,users,deliveries,summary]=await Promise.all([pool.query(`SELECT f.id,f.name,f.position,f.muted_until AS "mutedUntil",count(r.id)::int AS "ruleCount" FROM alert_folders f LEFT JOIN alert_rules r ON r.folder_id=f.id GROUP BY f.id ORDER BY f.position,f.name`),pool.query(`SELECT r.id,r.name,r.folder_id AS "folderId",r.trigger_kind AS "triggerKind",r.severity,r.message_template AS "messageTemplate",r.conditions,r.channel_ids AS "channelIds",r.audience_group_ids AS "audienceGroupIds",r.enabled,r.muted_until AS "mutedUntil",r.cooldown_seconds AS "cooldownSeconds",r.notify_recovery AS "notifyRecovery",r.last_triggered_at AS "lastTriggeredAt" FROM alert_rules r ORDER BY r.name`),pool.query(`SELECT id,name,kind,enabled,muted_until AS "mutedUntil",last_success_at AS "lastSuccessAt",last_failure_at AS "lastFailureAt",last_error AS "lastError",true AS "endpointConfigured" FROM alert_channels ORDER BY name`),pool.query(`SELECT g.id,g.name,g.description,g.enabled,COALESCE(array_agg(DISTINCT gu.user_id) FILTER(WHERE gu.user_id IS NOT NULL),'{}') AS "userIds",COALESCE(array_agg(DISTINCT gc.channel_id) FILTER(WHERE gc.channel_id IS NOT NULL),'{}') AS "channelIds" FROM notification_groups g LEFT JOIN notification_group_users gu ON gu.group_id=g.id LEFT JOIN notification_group_channels gc ON gc.group_id=g.id GROUP BY g.id ORDER BY g.name`),pool.query(`SELECT id,display_name AS "displayName",email,role FROM users WHERE enabled=true ORDER BY display_name`),pool.query(`SELECT d.id,d.channel_name AS "channelName",d.channel_kind AS "channelKind",d.status,d.attempts,d.last_error AS "lastError",d.delivered_at AS "deliveredAt",d.created_at AS "createdAt",o.title,o.message,o.severity,o.trigger_kind AS "triggerKind" FROM alert_deliveries d JOIN alert_occurrences o ON o.id=d.occurrence_id ORDER BY d.created_at DESC LIMIT 200`),pool.query(`SELECT (SELECT count(*) FROM alert_rules WHERE enabled=true)::int AS "enabledRules",(SELECT count(*) FROM alert_channels WHERE enabled=true)::int AS "enabledChannels",(SELECT count(*) FROM alert_deliveries WHERE status='failed')::int AS "failedDeliveries",(SELECT count(*) FROM alert_deliveries WHERE status='delivered' AND delivered_at>now()-interval '24 hours')::int AS "deliveredToday"`)]);response.json({folders:folders.rows,rules:rules.rows,channels:channels.rows,groups:groups.rows,users:users.rows,deliveries:deliveries.rows,summary:summary.rows[0]});});
app.post("/api/alerts/groups",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000).default(""),userIds:z.array(z.string().uuid()).max(500).default([]),channelIds:z.array(z.string().uuid()).max(50).default([])}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a valid audience group"});const client=await pool.connect();try{await client.query("BEGIN");const group=await client.query(`INSERT INTO notification_groups(name,description) VALUES($1,$2) RETURNING id`,[parsed.data.name,parsed.data.description]);for(const id of parsed.data.userIds)await client.query(`INSERT INTO notification_group_users(group_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[group.rows[0].id,id]);for(const id of parsed.data.channelIds)await client.query(`INSERT INTO notification_group_channels(group_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[group.rows[0].id,id]);await client.query("COMMIT");response.status(201).json(group.rows[0]);}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}});
app.put("/api/alerts/groups/:id",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000),enabled:z.boolean(),userIds:z.array(z.string().uuid()).max(500),channelIds:z.array(z.string().uuid()).max(50)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid audience group"});const client=await pool.connect();try{await client.query("BEGIN");await client.query(`UPDATE notification_groups SET name=$2,description=$3,enabled=$4,updated_at=now() WHERE id=$1`,[request.params.id,parsed.data.name,parsed.data.description,parsed.data.enabled]);await client.query(`DELETE FROM notification_group_users WHERE group_id=$1`,[request.params.id]);await client.query(`DELETE FROM notification_group_channels WHERE group_id=$1`,[request.params.id]);for(const id of parsed.data.userIds)await client.query(`INSERT INTO notification_group_users(group_id,user_id) VALUES($1,$2)`,[request.params.id,id]);for(const id of parsed.data.channelIds)await client.query(`INSERT INTO notification_group_channels(group_id,channel_id) VALUES($1,$2)`,[request.params.id,id]);await client.query("COMMIT");response.json({saved:true});}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}});
app.delete("/api/alerts/groups/:id",async(request,response)=>{if(!requireAdmin(request,response))return;await pool.query(`DELETE FROM notification_groups WHERE id=$1`,[request.params.id]);response.status(204).end();});
app.post("/api/alerts/folders",async(request,response)=>{if(!requireOperator(response))return;const parsed=alertFolderSchema.safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a folder name"});const result=await pool.query(`INSERT INTO alert_folders(name,position,muted_until) VALUES($1,(SELECT COALESCE(max(position),-1)+1 FROM alert_folders),$2) RETURNING id`,[parsed.data.name,parsed.data.mutedUntil??null]);response.status(201).json(result.rows[0]);});
app.patch("/api/alerts/folders/:id",async(request,response)=>{if(!requireOperator(response))return;const parsed=alertFolderSchema.safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a folder name"});await pool.query("UPDATE alert_folders SET name=$2,muted_until=$3,updated_at=now() WHERE id=$1",[request.params.id,parsed.data.name,parsed.data.mutedUntil??null]);response.json({saved:true});});
app.delete("/api/alerts/folders/:id",async(request,response)=>{if(!requireOperator(response))return;await pool.query("DELETE FROM alert_folders WHERE id=$1",[request.params.id]);response.status(204).end();});
app.post("/api/alerts/channels",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=alertChannelSchema.safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a valid channel name, type and HTTPS webhook URL"});const result=await pool.query(`INSERT INTO alert_channels(name,kind,endpoint_encrypted,enabled) VALUES($1,$2,pgp_sym_encrypt($3,$4),$5) RETURNING id`,[parsed.data.name,parsed.data.kind,parsed.data.endpoint,channelKey(),parsed.data.enabled]);response.status(201).json(result.rows[0]);});
app.post("/api/alerts/channels/:id/test",async(request,response)=>{if(!requireAdmin(request,response))return;try{const result=await pool.query(`SELECT kind,pgp_sym_decrypt(endpoint_encrypted,$2) AS endpoint FROM alert_channels WHERE id=$1`,[request.params.id,channelKey()]);if(!result.rowCount)return response.status(404).json({error:"Channel not found"});await sendAlertWebhook(result.rows[0].kind,result.rows[0].endpoint,"Test notification","This channel is connected to HedgeSight.","info");response.json({ok:true});}catch(error){response.status(400).json({error:error instanceof Error?error.message:"Test failed"});}});
app.patch("/api/alerts/channels/:id/state",async(request,response)=>{if(!requireAdmin(request,response))return;const parsed=z.object({enabled:z.boolean(),mutedUntil:z.string().datetime().nullable().optional()}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid channel state"});await pool.query("UPDATE alert_channels SET enabled=$2,muted_until=$3,updated_at=now() WHERE id=$1",[request.params.id,parsed.data.enabled,parsed.data.mutedUntil??null]);response.json({saved:true});});
app.delete("/api/alerts/channels/:id",async(request,response)=>{if(!requireAdmin(request,response))return;await pool.query("DELETE FROM alert_channels WHERE id=$1",[request.params.id]);response.status(204).end();});
app.post("/api/alerts/rules",async(request,response)=>{if(!requireOperator(response))return;const parsed=alertRuleSchema.safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Complete the rule and select a channel or audience"});const v=parsed.data,result=await pool.query(`INSERT INTO alert_rules(name,folder_id,trigger_kind,severity,message_template,conditions,channel_ids,audience_group_ids,cooldown_seconds,notify_recovery,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[v.name,v.folderId,v.triggerKind,v.severity,v.messageTemplate,{deviceIds:v.deviceIds,checkKinds:v.checkKinds},v.channelIds,v.audienceGroupIds,v.cooldownSeconds,v.notifyRecovery,v.enabled]);response.status(201).json(result.rows[0]);});
app.post("/api/alerts/rules/:id/test",async(request,response)=>{if(!requireOperator(response))return;const result=await pool.query(`SELECT r.*,d.id AS device_id,d.name AS device_name,c.id AS check_id,c.name AS check_name,c.kind AS check_kind FROM alert_rules r CROSS JOIN LATERAL (SELECT d.id,d.name FROM devices d WHERE jsonb_array_length(COALESCE(r.conditions->'deviceIds','[]'::jsonb))=0 OR d.id::text IN (SELECT jsonb_array_elements_text(r.conditions->'deviceIds')) ORDER BY d.name LIMIT 1) d CROSS JOIN LATERAL (SELECT c.id,c.name,c.kind FROM checks c WHERE c.device_id=d.id AND (jsonb_array_length(COALESCE(r.conditions->'checkKinds','[]'::jsonb))=0 OR c.kind IN (SELECT jsonb_array_elements_text(r.conditions->'checkKinds'))) ORDER BY c.kind LIMIT 1) c WHERE r.id=$1`,[request.params.id]);if(!result.rowCount)return response.status(409).json({error:"No matching device and check are available for this rule"});const rule=result.rows[0],event={triggerKind:rule.trigger_kind,deviceName:rule.device_name,checkName:rule.check_name,checkKind:rule.check_kind,message:"This is a HedgeSight test alert."},title=`TEST · ${rule.device_name} · ${rule.check_name}`,message=renderAlertMessage(rule.message_template,event,rule.severity);const occurrence=await pool.query(`INSERT INTO alert_occurrences(rule_id,rule_name,trigger_kind,severity,device_id,check_id,title,message,context) VALUES($1,$2,'test',$3,$4,$5,$6,$7,$8) RETURNING id`,[rule.id,rule.name,rule.severity,rule.device_id,rule.check_id,title,message,{test:true,...event}]);const queued=await pool.query(`INSERT INTO alert_deliveries(occurrence_id,channel_id,channel_name,channel_kind) SELECT $1,c.id,c.name,c.kind FROM alert_channels c WHERE c.id=ANY($2::uuid[]) AND c.enabled=true RETURNING id`,[occurrence.rows[0].id,rule.channel_ids]);response.json({queued:queued.rowCount});});
app.patch("/api/alerts/rules/:id",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({folderId:z.string().uuid().nullable().optional(),enabled:z.boolean().optional(),mutedUntil:z.string().datetime().nullable().optional(),name:z.string().trim().min(1).max(160).optional()}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid rule update"});const v=parsed.data;await pool.query(`UPDATE alert_rules SET folder_id=CASE WHEN $2::boolean THEN $3::uuid ELSE folder_id END,enabled=COALESCE($4,enabled),muted_until=CASE WHEN $5::boolean THEN $6::timestamptz ELSE muted_until END,name=COALESCE($7,name),updated_at=now() WHERE id=$1`,[request.params.id,Object.hasOwn(v,"folderId"),v.folderId??null,v.enabled??null,Object.hasOwn(v,"mutedUntil"),v.mutedUntil??null,v.name??null]);response.json({saved:true});});
app.delete("/api/alerts/rules/:id",async(request,response)=>{if(!requireOperator(response))return;await pool.query("DELETE FROM alert_rules WHERE id=$1",[request.params.id]);response.status(204).end();});

app.get("/api/major-incidents",async(_request,response)=>{
  const result=await pool.query(`SELECT m.id,m.number,'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') AS reference,
    m.title,m.impact,m.severity,m.status,m.opened_at AS "openedAt",m.resolved_at AS "resolvedAt",m.archived_at AS "archivedAt",u.display_name AS "ownerName",
    count(DISTINCT mm.incident_id)::int AS "incidentCount",count(DISTINCT mu.id)::int AS "updateCount"
    FROM major_incidents m LEFT JOIN users u ON u.id=m.owner_user_id LEFT JOIN major_incident_members mm ON mm.major_incident_id=m.id
    LEFT JOIN major_incident_updates mu ON mu.major_incident_id=m.id GROUP BY m.id,u.display_name ORDER BY m.opened_at DESC`);response.json(result.rows);
});
app.get("/api/major-incidents/:majorId",async(request,response)=>{
  const main=await pool.query(`SELECT m.id,m.number,'MI-'||to_char(m.opened_at,'YYYY')||'-'||lpad(m.number::text,4,'0') AS reference,m.title,m.impact,m.severity,m.status,m.opened_at AS "openedAt",m.resolved_at AS "resolvedAt",m.archived_at AS "archivedAt",u.display_name AS "ownerName" FROM major_incidents m LEFT JOIN users u ON u.id=m.owner_user_id WHERE m.id=$1`,[request.params.majorId]);if(!main.rowCount)return response.status(404).json({error:"Major incident not found"});
  const [members,updates]=await Promise.all([pool.query(`SELECT i.id,d.name AS "deviceName",i.status,i.opened_at AS "openedAt" FROM major_incident_members mm JOIN incidents i ON i.id=mm.incident_id JOIN devices d ON d.id=i.device_id WHERE mm.major_incident_id=$1 ORDER BY i.opened_at`,[request.params.majorId]),pool.query(`SELECT x.id,x.body,x.created_at AS "createdAt",COALESCE(u.display_name,'Deleted user') AS "authorName" FROM major_incident_updates x LEFT JOIN users u ON u.id=x.user_id WHERE x.major_incident_id=$1 ORDER BY x.created_at`,[request.params.majorId])]);response.json({...main.rows[0],incidents:members.rows,updates:updates.rows});
});
app.post("/api/major-incidents",async(request,response)=>{
  const parsed=z.object({title:z.string().trim().min(1).max(200),impact:z.string().trim().max(2000).default(""),severity:z.enum(["major","critical"]).default("major"),incidentIds:z.array(z.string().uuid()).default([])}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid major incident"});
  const client=await pool.connect();try{await client.query("BEGIN");const result=await client.query(`INSERT INTO major_incidents(title,impact,severity,owner_user_id,created_by_user_id) VALUES($1,$2,$3,$4,$4) RETURNING id`,[parsed.data.title,parsed.data.impact,parsed.data.severity,response.locals.user.id]);for(const id of parsed.data.incidentIds)await client.query(`INSERT INTO major_incident_members(major_incident_id,incident_id) VALUES($1,$2) ON CONFLICT(incident_id) DO UPDATE SET major_incident_id=EXCLUDED.major_incident_id`,[result.rows[0].id,id]);await client.query("COMMIT");void queueMajorEvent(result.rows[0].id,"major_incident_created",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{majorIncidentId:result.rows[0].id}));return response.status(201).json(result.rows[0]);}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
app.post("/api/major-incidents/:majorId/updates",async(request,response)=>{const parsed=z.object({body:z.string().trim().min(1).max(4000)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Update is required"});const result=await pool.query(`INSERT INTO major_incident_updates(major_incident_id,user_id,body) VALUES($1,$2,$3) RETURNING id`,[request.params.majorId,response.locals.user.id,parsed.data.body]);return response.status(201).json(result.rows[0]);});
app.post("/api/major-incidents/:majorId/members",async(request,response)=>{const parsed=z.object({incidentIds:z.array(z.string().uuid())}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid incidents"});let linked=0;for(const id of parsed.data.incidentIds){const result=await pool.query(`INSERT INTO major_incident_members(major_incident_id,incident_id) SELECT $1,i.id FROM incidents i WHERE i.id=$2 AND i.status<>'resolved' AND EXISTS(SELECT 1 FROM major_incidents m WHERE m.id=$1 AND m.status<>'resolved' AND m.archived_at IS NULL) ON CONFLICT(incident_id) DO UPDATE SET major_incident_id=EXCLUDED.major_incident_id RETURNING incident_id`,[request.params.majorId,id]);linked+=result.rowCount??0;}if(!linked)return response.status(409).json({error:"Only active incidents can be linked to an open major incident"});return response.json({linked});});
app.post("/api/major-incidents/:majorId/resolve",async(request,response)=>{await pool.query("UPDATE major_incidents SET status='resolved',resolved_at=now() WHERE id=$1",[request.params.majorId]);void queueMajorEvent(request.params.majorId,"major_incident_resolved",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{majorIncidentId:request.params.majorId}));return response.json({resolved:true});});
app.post("/api/major-incidents/:majorId/archive",async(request,response)=>{if(!requireOperator(response))return;const result=await pool.query(`UPDATE major_incidents SET archived_at=now(),archived_by_user_id=$2 WHERE id=$1 AND status='resolved' AND archived_at IS NULL RETURNING id`,[request.params.majorId,response.locals.user.id]);if(!result.rowCount)return response.status(409).json({error:"Only a resolved, unarchived major incident can be archived"});response.json({archived:true});});
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

app.get("/api/credentials",async(_request,response)=>{if(!requireOperator(response))return;const result=await pool.query(`SELECT c.id,c.name,c.username,c.created_at AS "createdAt",c.updated_at AS "updatedAt",(count(DISTINCT ssh.device_id)+count(DISTINCT vs.device_id))::int AS "deviceCount" FROM credentials c LEFT JOIN device_ssh_credentials ssh ON ssh.credential_id=c.id LEFT JOIN device_vsphere_credentials vs ON vs.credential_id=c.id GROUP BY c.id ORDER BY c.name`);response.json(result.rows);});
app.post("/api/credentials",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({name:z.string().trim().min(1).max(120),username:z.string().trim().min(1).max(120),password:z.string().min(1).max(2000)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Name, username and password are required"});try{const result=await pool.query(`INSERT INTO credentials(name,username,password_encrypted,created_by_user_id) VALUES($1,$2,pgp_sym_encrypt($3,$4),$5) RETURNING id`,[parsed.data.name,parsed.data.username,parsed.data.password,process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me",response.locals.user.id]);return response.status(201).json(result.rows[0]);}catch(error){if((error as {code?:string}).code==="23505")return response.status(409).json({error:"A credential with that name already exists"});throw error;}});
app.put("/api/credentials/:credentialId",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({name:z.string().trim().min(1).max(120),username:z.string().trim().min(1).max(120),password:z.string().max(2000).default("")}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Name and username are required"});const result=await pool.query(`UPDATE credentials SET name=$2,username=$3,password_encrypted=CASE WHEN $4='' THEN password_encrypted ELSE pgp_sym_encrypt($4,$5) END,updated_at=now() WHERE id=$1 RETURNING id`,[request.params.credentialId,parsed.data.name,parsed.data.username,parsed.data.password,process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me"]);return response.json({updated:Boolean(result.rowCount)});});
app.delete("/api/credentials/:credentialId",async(request,response)=>{if(!requireOperator(response))return;try{const result=await pool.query(`DELETE FROM credentials WHERE id=$1 RETURNING id`,[request.params.credentialId]);if(!result.rowCount)return response.status(404).json({error:"Credential not found"});return response.status(204).end();}catch(error){if((error as {code?:string}).code==="23503")return response.status(409).json({error:"Remove this credential from assigned devices first"});throw error;}});

app.get("/api/monitoring", async (_request, response) => {
  const result = await pool.query(`SELECT d.id,d.name,d.address,d.description,d.status,
    d.os_name AS "osName",d.os_version AS "osVersion",d.device_type AS "deviceType",d.vendor,d.model,
    d.profile_source AS "profileSource",d.profiled_at AS "profiledAt",d.ssh_profile AS "sshProfile",d.ssh_profiled_at AS "sshProfiledAt",d.vsphere_profile AS "vsphereProfile",d.vsphere_profiled_at AS "vsphereProfiledAt",p.id AS "pingCheckId",
    p.interval_seconds AS "intervalSeconds",p.last_status AS "pingStatus",p.last_run_at AS "lastRunAt",
    COALESCE(p.config->>'mode','icmp') AS "reachabilityMode",COALESCE((p.config->>'port')::integer,22) AS "tcpPort",
    latest.latency_ms AS "latencyMs",COALESCE((latest.metrics->>'packetLossPercent')::double precision,0) AS "packetLossPercent",
    COALESCE(history.points,'[]'::json) AS history,COALESCE(groups.items,'[]'::json) AS groups,d.enabled,
    maintenance.id AS "changeId",maintenance.change_reference AS "changeReference",maintenance.public_description AS "changeDescription",maintenance.manager_name AS "changeManagerName",maintenance.started_at AS "maintenanceStartedAt",
    maintenance.estimated_end_at AS "maintenanceEstimatedEndAt",maintenance.change_status AS "changeStatus",ssh.credential_id AS "sshCredentialId",ssh.port AS "sshPort",cred.name AS "sshCredentialName",sc.enabled AS "sshEnabled",sc.interval_seconds AS "sshIntervalSeconds",sc.last_status AS "sshStatus",sc.last_run_at AS "sshLastRunAt",COALESCE(sc.config,'{}') AS "sshThresholds",vs.credential_id AS "vsphereCredentialId",vs.port AS "vspherePort",vs.verify_tls AS "vsphereVerifyTls",vc.enabled AS "vsphereEnabled",vc.interval_seconds AS "vsphereIntervalSeconds",vc.last_status AS "vsphereStatus",vc.last_run_at AS "vsphereLastRunAt",COALESCE(vc.config,'{}') AS "vsphereThresholds",
    availability.uptime_seconds AS "uptimeSeconds",availability.downtime_seconds AS "downtimeSeconds",availability.maintenance_downtime_seconds AS "maintenanceDowntimeSeconds",availability.uptime_percent AS "uptimePercent"
    FROM devices d
    LEFT JOIN LATERAL (SELECT * FROM checks WHERE device_id=d.id AND kind='ping' ORDER BY created_at LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT * FROM checks WHERE device_id=d.id AND kind='ssh' ORDER BY created_at LIMIT 1) sc ON true
    LEFT JOIN LATERAL (SELECT * FROM checks WHERE device_id=d.id AND kind='vsphere' ORDER BY created_at LIMIT 1) vc ON true
    LEFT JOIN device_ssh_credentials ssh ON ssh.device_id=d.id LEFT JOIN credentials cred ON cred.id=ssh.credential_id
    LEFT JOIN device_vsphere_credentials vs ON vs.device_id=d.id
    LEFT JOIN LATERAL (SELECT latency_ms,metrics FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('timestamp',x.finished_at,'latencyMs',x.latency_ms,'status',x.status) ORDER BY x.finished_at) AS points
      FROM (SELECT finished_at,latency_ms,status FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 30) x) history ON true
    LEFT JOIN LATERAL (WITH samples AS (
        SELECT status,GREATEST(finished_at,now()-interval '30 days') AS sample_start,
          LEAST(COALESCE(lead(finished_at) OVER(ORDER BY finished_at),now()),now()) AS sample_end
        FROM probe_results WHERE check_id=p.id AND finished_at>=now()-interval '30 days'
      ),split AS (
        SELECT s.status,extract(epoch FROM s.sample_end-s.sample_start) AS total_seconds,
          COALESCE((SELECT sum(extract(epoch FROM LEAST(s.sample_end,COALESCE(m.ended_at,now()),r.estimated_end_at)-GREATEST(s.sample_start,r.started_at)))
            FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id
            WHERE m.device_id=d.id AND r.started_at<s.sample_end AND LEAST(COALESCE(m.ended_at,now()),r.estimated_end_at)>s.sample_start),0) AS maintenance_seconds
        FROM samples s WHERE s.sample_end>s.sample_start
      ),totals AS (
        SELECT COALESCE(sum(GREATEST(total_seconds-maintenance_seconds,0)) FILTER(WHERE status='up'),0) AS up_seconds,
          COALESCE(sum(GREATEST(total_seconds-maintenance_seconds,0)) FILTER(WHERE status='down'),0) AS down_seconds,
          COALESCE(sum(LEAST(total_seconds,maintenance_seconds)) FILTER(WHERE status='down'),0) AS maintenance_down_seconds FROM split
      ) SELECT round(up_seconds)::bigint AS uptime_seconds,round(down_seconds)::bigint AS downtime_seconds,
        round(maintenance_down_seconds)::bigint AS maintenance_downtime_seconds,
        CASE WHEN up_seconds+down_seconds>0 THEN round((100*up_seconds/(up_seconds+down_seconds))::numeric,3) ELSE NULL END AS uptime_percent FROM totals) availability ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',g.id,'name',g.name,'color',g.color) ORDER BY g.name) AS items
      FROM device_group_memberships m JOIN device_groups g ON g.id=m.group_id WHERE m.device_id=d.id) groups ON true
    LEFT JOIN LATERAL (SELECT r.id,r.change_reference,r.public_description,u.display_name AS manager_name,r.started_at,r.estimated_end_at,
      CASE WHEN r.started_at>now() THEN 'scheduled' WHEN r.estimated_end_at<now() THEN 'overdue' ELSE 'active' END AS change_status FROM change_record_devices m
      JOIN change_records r ON r.id=m.change_record_id JOIN users u ON u.id=r.change_manager_user_id WHERE m.device_id=d.id AND m.ended_at IS NULL LIMIT 1) maintenance ON true
    ORDER BY d.name`);
  response.json(result.rows);
});

app.get("/api/change-managers",async(_request,response)=>{
  const result=await pool.query(`SELECT id,display_name AS "displayName",email FROM users WHERE enabled=true AND role IN ('admin','operator') ORDER BY display_name`);
  response.json(result.rows);
});

app.get("/api/changes",async(_request,response)=>{
  const result=await pool.query(`SELECT r.id,r.change_reference AS "changeReference",r.public_description AS "publicDescription",r.started_at AS "startedAt",r.estimated_end_at AS "estimatedEndAt",r.ended_at AS "endedAt",
    u.display_name AS "managerName",u.id AS "managerId",count(m.device_id)::int AS "deviceCount",array_agg(d.name ORDER BY d.name) AS "deviceNames",
    CASE WHEN r.ended_at IS NOT NULL THEN 'completed' WHEN r.started_at>now() THEN 'scheduled' WHEN r.estimated_end_at<=now() THEN 'overdue' ELSE 'active' END AS status
    FROM change_records r JOIN users u ON u.id=r.change_manager_user_id JOIN change_record_devices m ON m.change_record_id=r.id
    JOIN devices d ON d.id=m.device_id GROUP BY r.id,u.id ORDER BY r.started_at DESC LIMIT 100`);
  response.json(result.rows);
});

app.put("/api/changes/:changeId",async(request,response)=>{
  if(!requireOperator(response))return;
  const parsed=z.object({changeReference:z.string().trim().min(1).max(200),publicDescription:z.string().trim().min(1).max(1000),managerId:z.string().uuid(),startedAt:z.string().datetime(),estimatedEndAt:z.string().datetime()}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"Enter a valid change record, manager and maintenance window"});
  if(new Date(parsed.data.estimatedEndAt)<=new Date(parsed.data.startedAt)||new Date(parsed.data.estimatedEndAt)<=new Date())return response.status(400).json({error:"Estimated end must be after the start time and in the future"});
  const manager=await pool.query(`SELECT 1 FROM users WHERE id=$1 AND enabled=true AND role IN ('admin','operator')`,[parsed.data.managerId]);
  if(!manager.rowCount)return response.status(400).json({error:"Select an active operator or administrator as change manager"});
  const result=await pool.query(`UPDATE change_records SET change_reference=$2,public_description=$3,change_manager_user_id=$4,started_at=$5,estimated_end_at=$6
    WHERE id=$1 AND ended_at IS NULL RETURNING id`,[request.params.changeId,parsed.data.changeReference,parsed.data.publicDescription,parsed.data.managerId,parsed.data.startedAt,parsed.data.estimatedEndAt]);
  if(!result.rowCount)return response.status(404).json({error:"Open change not found"});
  return response.json({updated:true});
});

app.post("/api/changes",async(request,response)=>{
  if(!requireOperator(response))return;
  const parsed=z.object({changeReference:z.string().trim().min(1).max(200),publicDescription:z.string().trim().min(1).max(1000),managerId:z.string().uuid(),deviceIds:z.array(z.string().uuid()).min(1).max(500),startedAt:z.string().datetime(),estimatedEndAt:z.string().datetime()}).safeParse(request.body);
  if(!parsed.success)return response.status(400).json({error:"A change record, change manager and at least one node are required"});
  if(new Date(parsed.data.estimatedEndAt)<=new Date(parsed.data.startedAt)||new Date(parsed.data.estimatedEndAt)<=new Date())return response.status(400).json({error:"Estimated end must be after the start time and in the future"});
  const client=await pool.connect();try{await client.query("BEGIN");
    const manager=await client.query(`SELECT 1 FROM users WHERE id=$1 AND enabled=true AND role IN ('admin','operator')`,[parsed.data.managerId]);
    if(!manager.rowCount){await client.query("ROLLBACK");return response.status(400).json({error:"Select an active operator or administrator as change manager"});}
    const busy=await client.query(`SELECT d.name FROM change_record_devices m JOIN devices d ON d.id=m.device_id WHERE m.device_id=ANY($1::uuid[]) AND m.ended_at IS NULL`,[parsed.data.deviceIds]);
    if(busy.rowCount){await client.query("ROLLBACK");return response.status(409).json({error:`Already under maintenance: ${busy.rows.map(item=>item.name).join(", ")}`});}
    const record=await client.query(`INSERT INTO change_records(change_reference,public_description,change_manager_user_id,created_by_user_id,started_at,estimated_end_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[parsed.data.changeReference,parsed.data.publicDescription,parsed.data.managerId,response.locals.user.id,parsed.data.startedAt,parsed.data.estimatedEndAt]);
    await client.query(`INSERT INTO change_record_devices(change_record_id,device_id) SELECT $1,unnest($2::uuid[])`,[record.rows[0].id,parsed.data.deviceIds]);
    await client.query("COMMIT");void queueChangeEvent(record.rows[0].id,"maintenance_created",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{changeId:record.rows[0].id}));return response.status(201).json(record.rows[0]);
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
    await client.query("COMMIT");void queueChangeEvent(request.params.changeId,"maintenance_ended",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{changeId:request.params.changeId}));return response.json({returned:true});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

app.get("/api/task-assignees",async(_request,response)=>{const result=await pool.query(`SELECT id,display_name AS "displayName",email FROM users WHERE enabled=true ORDER BY display_name`);response.json(result.rows);});
app.get("/api/task-lanes",async(_request,response)=>{const result=await pool.query(`SELECT key,name,position,is_completion_lane AS "isCompletionLane" FROM task_lanes ORDER BY position`);response.json(result.rows);});
app.post("/api/task-lanes",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({name:z.string().trim().min(1).max(80)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a lane name"});const key=`lane_${Date.now().toString(36)}`,result=await pool.query(`INSERT INTO task_lanes(key,name,position) VALUES($1,$2,COALESCE((SELECT max(position)+10 FROM task_lanes),10)) RETURNING key,name,position,is_completion_lane AS "isCompletionLane"`,[key,parsed.data.name]);response.status(201).json(result.rows[0]);});
app.put("/api/task-lanes/:key",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({name:z.string().trim().min(1).max(80)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a lane name"});const result=await pool.query(`UPDATE task_lanes SET name=$2 WHERE key=$1 RETURNING key,name,position,is_completion_lane AS "isCompletionLane"`,[request.params.key,parsed.data.name]);response.json(result.rows[0]);});
app.put("/api/task-lane-order",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({keys:z.array(z.string().min(1).max(40)).min(1).max(50)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid lane order"});const existing=await pool.query("SELECT key FROM task_lanes");if(existing.rowCount!==parsed.data.keys.length||existing.rows.some(row=>!parsed.data.keys.includes(row.key)))return response.status(400).json({error:"Lane order must include every lane"});for(const [index,key] of parsed.data.keys.entries())await pool.query("UPDATE task_lanes SET position=$2 WHERE key=$1",[key,(index+1)*10]);response.json({saved:true});});
app.get("/api/task-tags",async(_request,response)=>{const result=await pool.query(`SELECT id,name,color FROM task_tags ORDER BY name`);response.json(result.rows);});
app.post("/api/task-tags",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({name:z.string().trim().min(1).max(40),color:z.string().regex(/^#[0-9a-f]{6}$/i)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a tag name and colour"});try{const result=await pool.query(`INSERT INTO task_tags(name,color) VALUES($1,$2) RETURNING id,name,color`,[parsed.data.name,parsed.data.color]);response.status(201).json(result.rows[0]);}catch(error){if((error as {code?:string}).code==='23505')return response.status(409).json({error:"That tag already exists"});throw error;}});
app.get("/api/tasks",async(_request,response)=>{const result=await pool.query(`SELECT t.id,t.title,t.description,t.status,t.priority,t.created_at AS "createdAt",t.updated_at AS "updatedAt",u.id AS "assigneeId",u.display_name AS "assigneeName",COALESCE((SELECT json_agg(json_build_object('id',tag.id,'name',tag.name,'color',tag.color) ORDER BY tag.name) FROM task_tag_links link JOIN task_tags tag ON tag.id=link.tag_id WHERE link.task_id=t.id),'[]') AS tags,
  count(DISTINCT ti.incident_id)::int AS "incidentCount",count(DISTINCT tu.id)::int AS "updateCount"
  FROM tasks t LEFT JOIN users u ON u.id=t.assignee_user_id LEFT JOIN task_incidents ti ON ti.task_id=t.id LEFT JOIN task_updates tu ON tu.task_id=t.id
  GROUP BY t.id,u.id ORDER BY t.updated_at DESC`);response.json(result.rows);});
app.get("/api/tasks/:taskId",async(request,response)=>{const main=await pool.query(`SELECT t.id,t.title,t.description,t.status,t.created_at AS "createdAt",t.updated_at AS "updatedAt",u.id AS "assigneeId",u.display_name AS "assigneeName" FROM tasks t LEFT JOIN users u ON u.id=t.assignee_user_id WHERE t.id=$1`,[request.params.taskId]);if(!main.rowCount)return response.status(404).json({error:"Task not found"});const [incidents,updates]=await Promise.all([pool.query(`SELECT i.id,i.status,i.opened_at AS "openedAt",d.name AS "deviceName" FROM task_incidents ti JOIN incidents i ON i.id=ti.incident_id JOIN devices d ON d.id=i.device_id WHERE ti.task_id=$1 ORDER BY i.opened_at DESC`,[request.params.taskId]),pool.query(`SELECT x.id,x.body,x.created_at AS "createdAt",COALESCE(u.display_name,'Deleted user') AS "authorName" FROM task_updates x LEFT JOIN users u ON u.id=x.user_id WHERE x.task_id=$1 ORDER BY x.created_at`,[request.params.taskId])]);response.json({...main.rows[0],incidents:incidents.rows,updates:updates.rows});});
app.post("/api/tasks",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({title:z.string().trim().min(1).max(200),description:z.string().trim().max(4000).default(""),assigneeId:z.string().uuid().nullable().optional(),incidentIds:z.array(z.string().uuid()).max(200).default([])}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Enter a task title"});const client=await pool.connect();try{await client.query("BEGIN");const result=await client.query(`INSERT INTO tasks(title,description,assignee_user_id,created_by_user_id) VALUES($1,$2,$3,$4) RETURNING id`,[parsed.data.title,parsed.data.description,parsed.data.assigneeId??null,response.locals.user.id]);for(const incidentId of parsed.data.incidentIds)await client.query(`INSERT INTO task_incidents(task_id,incident_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[result.rows[0].id,incidentId]);await client.query("COMMIT");void queueTaskEvent(result.rows[0].id,parsed.data.assigneeId?"task_assigned":"task_created",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{taskId:result.rows[0].id}));return response.status(201).json(result.rows[0]);}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}});
app.put("/api/tasks/:taskId",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({title:z.string().trim().min(1).max(200),description:z.string().trim().max(4000),status:z.enum(["backlog","in_progress","testing","completed"]),assigneeId:z.string().uuid().nullable()}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid task"});const result=await pool.query(`UPDATE tasks SET title=$2,description=$3,status=$4,assignee_user_id=$5,updated_at=now(),completed_at=CASE WHEN $4='completed' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=$1 RETURNING id`,[request.params.taskId,parsed.data.title,parsed.data.description,parsed.data.status,parsed.data.assigneeId]);return response.json({updated:Boolean(result.rowCount)});});
app.patch("/api/tasks/:taskId/status",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({status:z.string().min(1).max(40)}).safeParse(request.body);const lane=parsed.success?await pool.query("SELECT is_completion_lane FROM task_lanes WHERE key=$1",[parsed.data.status]):null;if(!parsed.success||!lane?.rowCount)return response.status(400).json({error:"Invalid lane"});await pool.query(`UPDATE tasks SET status=$2,updated_at=now(),completed_at=CASE WHEN (SELECT is_completion_lane FROM task_lanes WHERE key=$2) THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=$1`,[request.params.taskId,parsed.data.status]);if(lane.rows[0].is_completion_lane)void queueTaskEvent(request.params.taskId,"task_completed",response.locals.user.displayName).catch(error=>writeSystemLog("error","api","notification-event",String(error),{taskId:request.params.taskId}));return response.json({updated:true});});
app.get("/api/tasks/:taskId/classification",async(request,response)=>{const task=await pool.query(`SELECT priority FROM tasks WHERE id=$1`,[request.params.taskId]);if(!task.rowCount)return response.status(404).json({error:"Task not found"});const tags=await pool.query(`SELECT tag.id,tag.name,tag.color FROM task_tag_links link JOIN task_tags tag ON tag.id=link.tag_id WHERE link.task_id=$1 ORDER BY tag.name`,[request.params.taskId]);response.json({priority:task.rows[0].priority,tags:tags.rows});});
app.put("/api/tasks/:taskId/classification",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({priority:z.enum(["P1","P2","P3","P4"]),tagIds:z.array(z.string().uuid()).max(30)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Invalid priority or tags"});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE tasks SET priority=$2,updated_at=now() WHERE id=$1",[request.params.taskId,parsed.data.priority]);await client.query("DELETE FROM task_tag_links WHERE task_id=$1",[request.params.taskId]);for(const tagId of parsed.data.tagIds)await client.query("INSERT INTO task_tag_links(task_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[request.params.taskId,tagId]);await client.query("COMMIT");response.json({saved:true});}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}});
app.post("/api/tasks/:taskId/incidents",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({incidentIds:z.array(z.string().uuid()).min(1).max(200)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Select incidents"});for(const id of parsed.data.incidentIds)await pool.query(`INSERT INTO task_incidents(task_id,incident_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[request.params.taskId,id]);await pool.query("UPDATE tasks SET updated_at=now() WHERE id=$1",[request.params.taskId]);return response.json({linked:parsed.data.incidentIds.length});});
app.post("/api/tasks/:taskId/updates",async(request,response)=>{if(!requireOperator(response))return;const parsed=z.object({body:z.string().trim().min(1).max(4000)}).safeParse(request.body);if(!parsed.success)return response.status(400).json({error:"Update required"});const result=await pool.query(`INSERT INTO task_updates(task_id,user_id,body) VALUES($1,$2,$3) RETURNING id`,[request.params.taskId,response.locals.user.id,parsed.data.body]);await pool.query("UPDATE tasks SET updated_at=now() WHERE id=$1",[request.params.taskId]);return response.status(201).json(result.rows[0]);});

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
  sshEnabled:z.boolean().default(false),sshCredentialId:z.string().uuid().nullable().default(null),sshPort:z.number().int().min(1).max(65535).default(22),sshIntervalSeconds:z.number().int().min(60).max(86400).default(900),cpuThresholdPercent:z.number().min(1).max(100).default(90),memoryThresholdPercent:z.number().min(1).max(100).default(90),diskThresholdPercent:z.number().min(1).max(100).default(90),interfaceThresholdPercent:z.number().min(1).max(100).default(90),interfaceErrorThreshold:z.number().int().min(0).max(1000000).default(1),monitoredComponents:z.array(z.string().min(1).max(500)).max(1000).default([]),
  vsphereEnabled:z.boolean().default(false),vsphereCredentialId:z.string().uuid().nullable().default(null),vspherePort:z.number().int().min(1).max(65535).default(443),vsphereVerifyTls:z.boolean().default(true),vsphereIntervalSeconds:z.number().int().min(60).max(86400).default(300),vsphereCpuThresholdPercent:z.number().min(1).max(100).default(90),vsphereMemoryThresholdPercent:z.number().min(1).max(100).default(90),vsphereDatastoreThresholdPercent:z.number().min(1).max(100).default(90),vsphereMonitoredComponents:z.array(z.string().min(1).max(500)).max(1000).default([]),
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
    if(v.sshEnabled&&v.sshCredentialId){const sshConfig={cpuThresholdPercent:v.cpuThresholdPercent,memoryThresholdPercent:v.memoryThresholdPercent,diskThresholdPercent:v.diskThresholdPercent,interfaceThresholdPercent:v.interfaceThresholdPercent,interfaceErrorThreshold:v.interfaceErrorThreshold,monitoredComponents:v.monitoredComponents};await client.query(`INSERT INTO device_ssh_credentials(device_id,credential_id,port) VALUES($1,$2,$3) ON CONFLICT(device_id) DO UPDATE SET credential_id=$2,port=$3,host_key_fingerprint=CASE WHEN device_ssh_credentials.credential_id=$2 THEN device_ssh_credentials.host_key_fingerprint ELSE NULL END`,[request.params.deviceId,v.sshCredentialId,v.sshPort]);await client.query(`INSERT INTO checks(device_id,name,kind,enabled,interval_seconds,timeout_ms,config) SELECT $1,'Linux resources','ssh',true,$2,20000,$3 WHERE NOT EXISTS(SELECT 1 FROM checks WHERE device_id=$1 AND kind='ssh')`,[request.params.deviceId,v.sshIntervalSeconds,sshConfig]);await client.query(`UPDATE checks SET name='Linux resources',enabled=true,interval_seconds=$2,config=$3,next_run_at=now(),updated_at=now() WHERE device_id=$1 AND kind='ssh'`,[request.params.deviceId,v.sshIntervalSeconds,sshConfig]);}else{await client.query(`UPDATE checks SET enabled=false,updated_at=now() WHERE device_id=$1 AND kind='ssh'`,[request.params.deviceId]);await client.query(`DELETE FROM device_ssh_credentials WHERE device_id=$1`,[request.params.deviceId]);}
    if(v.vsphereEnabled&&v.vsphereCredentialId){const config={cpuThresholdPercent:v.vsphereCpuThresholdPercent,memoryThresholdPercent:v.vsphereMemoryThresholdPercent,diskThresholdPercent:v.vsphereDatastoreThresholdPercent,monitoredComponents:v.vsphereMonitoredComponents};await client.query(`INSERT INTO device_vsphere_credentials(device_id,credential_id,port,verify_tls) VALUES($1,$2,$3,$4) ON CONFLICT(device_id) DO UPDATE SET credential_id=$2,port=$3,verify_tls=$4,updated_at=now()`,[request.params.deviceId,v.vsphereCredentialId,v.vspherePort,v.vsphereVerifyTls]);await client.query(`INSERT INTO checks(device_id,name,kind,enabled,interval_seconds,timeout_ms,config) SELECT $1,'VMware vSphere resources','vsphere',true,$2,30000,$3 WHERE NOT EXISTS(SELECT 1 FROM checks WHERE device_id=$1 AND kind='vsphere')`,[request.params.deviceId,v.vsphereIntervalSeconds,config]);await client.query(`UPDATE checks SET enabled=true,interval_seconds=$2,config=$3,next_run_at=now(),updated_at=now() WHERE device_id=$1 AND kind='vsphere'`,[request.params.deviceId,v.vsphereIntervalSeconds,config]);}else{await client.query(`UPDATE checks SET enabled=false,updated_at=now() WHERE device_id=$1 AND kind='vsphere'`,[request.params.deviceId]);await client.query(`DELETE FROM device_vsphere_credentials WHERE device_id=$1`,[request.params.deviceId]);}
    await client.query("COMMIT"); return response.json(device.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const checkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["ping", "http", "snmp", "ssh", "vsphere"]),
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
  const body = z.object({ name: z.string().min(1).max(120), version: z.string(), capabilities: z.array(z.string()),runtimeMetrics:z.object({hostname:z.string().max(255),platform:z.string().max(80),platformVersion:z.string().max(255),cpuCount:z.number().int().positive(),load1:z.number().nonnegative(),memoryBytes:z.string(),memoryUsedPercent:z.number().min(0).max(100),uptimeSeconds:z.number().nonnegative()}).default({hostname:"unknown",platform:"unknown",platformVersion:"unknown",cpuCount:1,load1:0,memoryBytes:"0",memoryUsedPercent:0,uptimeSeconds:0}) }).parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const worker = await client.query(`INSERT INTO workers(name, token_hash, version, capabilities, runtime_metrics, last_seen_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT(name) DO UPDATE SET version=$3, capabilities=$4, runtime_metrics=$5,last_seen_at=now()
      RETURNING id`, [body.name, hashToken(process.env.WORKER_TOKEN ?? "local-development-token"), body.version, body.capabilities,body.runtimeMetrics]);
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
      c.timeout_ms AS "timeoutMs",CASE WHEN c.kind='ssh' THEN c.config||jsonb_build_object('username',sshcred.username,'password',pgp_sym_decrypt(sshcred.password_encrypted,$2),'port',ssh.port,'hostKeyFingerprint',ssh.host_key_fingerprint) WHEN c.kind='vsphere' THEN c.config||jsonb_build_object('username',vscred.username,'password',pgp_sym_decrypt(vscred.password_encrypted,$2),'port',vs.port,'verifyTls',vs.verify_tls) ELSE c.config END AS config,j.leased_until AS "leasedUntil"
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id JOIN devices d ON d.id=c.device_id LEFT JOIN device_ssh_credentials ssh ON ssh.device_id=d.id LEFT JOIN credentials sshcred ON sshcred.id=ssh.credential_id LEFT JOIN device_vsphere_credentials vs ON vs.device_id=d.id LEFT JOIN credentials vscred ON vscred.id=vs.credential_id WHERE j.id=$1`, [job.rows[0].id,process.env.CONFIG_ENCRYPTION_KEY??"local-development-configuration-key-change-me"]);
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
    observations: z.record(z.string(), z.unknown()).default({}),
  });
  const parsed = resultSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid result", issues: parsed.error.issues });
  const value = parsed.data;
  const client = await pool.connect();
  let lifecycleIncidentId:string|null=null;
  try {
    await client.query("BEGIN");
    const job = await client.query(`SELECT j.check_id, j.worker_id, c.device_id, c.last_status,c.kind,c.name AS check_name,d.name AS device_name
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id JOIN devices d ON d.id=c.device_id WHERE j.id=$1 AND j.state='leased' FOR UPDATE`, [request.params.jobId]);
    if (!job.rowCount) { await client.query("ROLLBACK"); return response.status(409).json({ error: "Job is not leased" }); }
    const row = job.rows[0];
    await writeSystemLog(value.status==="up"?"debug":value.status==="degraded"?"warn":"error","worker",`${row.kind}-probe`,value.message??`${row.kind} probe returned ${value.status}`,{deviceId:row.device_id,checkId:row.check_id,status:value.status,latencyMs:value.latencyMs??null});
    const inserted = await client.query(`INSERT INTO probe_results(job_id, check_id, worker_id, status, started_at, finished_at, latency_ms, message, metrics, observations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [request.params.jobId, row.check_id, row.worker_id, value.status, value.startedAt, value.finishedAt, value.latencyMs, value.message, value.metrics, value.observations]);
    await client.query(`INSERT INTO metric_samples(collected_at,device_id,check_id,metric_key,value)
      SELECT $1,$2,$3,key,value::double precision FROM jsonb_each_text($4::jsonb)
      ON CONFLICT(collected_at,device_id,metric_key) DO UPDATE SET value=EXCLUDED.value`,
      [value.finishedAt,row.device_id,row.check_id,value.metrics]);
    await client.query("UPDATE probe_jobs SET state='completed', completed_at=now() WHERE id=$1", [request.params.jobId]);
    await client.query("UPDATE checks SET last_status=$2, last_run_at=$3, updated_at=now() WHERE id=$1", [row.check_id, value.status, value.finishedAt]);
    if(row.kind==="ssh"&&["up","degraded"].includes(value.status))await client.query(`UPDATE devices SET os_name=COALESCE(NULLIF($2,''),os_name),os_version=COALESCE(NULLIF($3,''),os_version),device_type='Server',profile_source='ssh',profiled_at=$4,ssh_profile=$5,ssh_profiled_at=$4,updated_at=now() WHERE id=$1`,[row.device_id,String(value.observations.osName??"Linux"),String(value.observations.osVersion??""),value.finishedAt,value.observations]);
    if(row.kind==="vsphere"&&["up","degraded"].includes(value.status))await client.query(`UPDATE devices SET os_name='VMware ESXi',os_version=COALESCE(NULLIF($2,''),os_version),device_type='Hypervisor',vendor=COALESCE(NULLIF($3,''),vendor),model=COALESCE(NULLIF($4,''),model),profile_source='vsphere',profiled_at=$5,vsphere_profile=$6,vsphere_profiled_at=$5,updated_at=now() WHERE id=$1`,[row.device_id,String(value.observations.osVersion??""),String(value.observations.vendor??""),String(value.observations.model??""),value.finishedAt,value.observations]);
    if(row.kind==="ssh"&&["up","degraded"].includes(value.status)&&value.observations.hostKeyFingerprint)await client.query(`UPDATE device_ssh_credentials SET host_key_fingerprint=COALESCE(host_key_fingerprint,$2) WHERE device_id=$1`,[row.device_id,String(value.observations.hostKeyFingerprint)]);
    const maintenance=await client.query(`SELECT 1 FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id
      WHERE m.device_id=$1 AND m.ended_at IS NULL AND r.started_at<=now() AND r.estimated_end_at>now()`,[row.device_id]);
    if(row.kind!=="ping"){
      const alertKind=value.status==="degraded"?"degraded":!["up"].includes(value.status)?"monitoring_unavailable":null;
      if(alertKind)await client.query(`INSERT INTO monitoring_alerts(device_id,check_id,kind,message) VALUES($1,$2,$3,$4) ON CONFLICT(check_id,kind) WHERE state='open' DO UPDATE SET message=EXCLUDED.message,last_seen_at=now(),occurrence_count=monitoring_alerts.occurrence_count+1`,[row.device_id,row.check_id,alertKind,value.message??`${row.kind} returned ${value.status}`]);
      if(value.status==="up")await client.query(`UPDATE monitoring_alerts SET state='cleared',cleared_at=now(),last_seen_at=now() WHERE check_id=$1 AND state='open'`,[row.check_id]);
    }
    if (row.kind==="ping" && value.status==="down" && !maintenance.rowCount) {
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
        lifecycleIncidentId=incident.rows[0].id;
        await client.query(`INSERT INTO incident_signals(incident_id,check_id,opening_result_id) VALUES($1,$2,$3)`,[incident.rows[0].id,row.check_id,inserted.rows[0].id]);
        const expired=await client.query(`SELECT r.id,r.change_reference,r.estimated_end_at,u.display_name AS manager_name
          FROM change_record_devices m JOIN change_records r ON r.id=m.change_record_id JOIN users u ON u.id=r.change_manager_user_id
          WHERE m.device_id=$1 AND r.estimated_end_at<=now() AND r.estimated_end_at>now()-interval '24 hours'
            AND COALESCE(m.ended_at,now())>=r.estimated_end_at ORDER BY r.estimated_end_at DESC LIMIT 1`,[row.device_id]);
        if(expired.rowCount){
          const noted=await client.query(`INSERT INTO incident_change_notifications(incident_id,change_record_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING incident_id`,[incident.rows[0].id,expired.rows[0].id]);
          if(noted.rowCount)await client.query(`INSERT INTO incident_updates(incident_id,user_id,body) VALUES($1,NULL,$2)`,[incident.rows[0].id,`Maintenance window ${expired.rows[0].change_reference} ended at ${new Date(expired.rows[0].estimated_end_at).toISOString()}, but monitoring still reports the node down. Assigned change manager: ${expired.rows[0].manager_name}.`]);
        }
      }
    } else if (row.kind==="ping" && value.status === "up") {
      const signal=await client.query(`UPDATE incident_signals SET recovered_at=now(),closing_result_id=$2 WHERE check_id=$1 AND recovered_at IS NULL RETURNING incident_id`,[row.check_id,inserted.rows[0].id]);
      if(signal.rowCount)await client.query(`UPDATE incidents i SET status='pending_investigation',recovered_at=COALESCE(recovered_at,now()),closing_result_id=COALESCE(closing_result_id,$2),last_activity_at=now()
        WHERE i.id=$1 AND NOT EXISTS(SELECT 1 FROM incident_signals s WHERE s.incident_id=i.id AND s.recovered_at IS NULL)`,[signal.rows[0].incident_id,inserted.rows[0].id]);
    }
    await client.query(`UPDATE devices d SET
      status = CASE WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND kind='ping' AND last_status='down') THEN 'down'
                    WHEN NOT EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND kind='ping' AND last_status='up') THEN 'unknown'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND kind<>'ping' AND last_status='degraded') THEN 'degraded'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND kind<>'ping' AND last_status IN ('down','unknown') AND last_run_at IS NOT NULL) THEN 'monitoring_error'
                    ELSE 'up' END,
      last_seen_at = CASE WHEN $2='up' THEN $3 ELSE last_seen_at END, updated_at=now() WHERE id=$1`,
      [row.device_id, value.status, value.finishedAt]);
    await client.query("COMMIT");
    if(lifecycleIncidentId)void queueIncidentEvent(lifecycleIncidentId,"incident_created","System monitoring").catch(error=>writeSystemLog("error","api","notification-event",String(error),{incidentId:lifecycleIncidentId}));
    const triggerKind=value.status!==row.last_status?(value.status==="down"?"check_down":value.status==="degraded"?"check_degraded":value.status==="up"&&row.last_status&&row.last_status!=="up"?"check_recovered":null):null;
    if(triggerKind)try{await queueAlertEvent({triggerKind,deviceId:row.device_id,deviceName:row.device_name,checkId:row.check_id,checkName:row.check_name,checkKind:row.kind,message:value.message??`${row.check_name} changed from ${row.last_status??"unknown"} to ${value.status}`});}catch(error){await writeSystemLog("error","api","alert-evaluation",error instanceof Error?error.message:String(error),{deviceId:row.device_id,checkId:row.check_id});}
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
setInterval(()=>void processAlertDeliveries().catch(error=>writeSystemLog("error","api","alert-delivery",error instanceof Error?error.message:String(error),{})),10_000).unref();
setInterval(()=>void processWorkflowNotificationEvents().catch(error=>writeSystemLog("error","api","notification-events",error instanceof Error?error.message:String(error),{})),30_000).unref();
app.listen(port, "0.0.0.0", () => console.info(`HedgeSight ${version} listening on ${port}`));
