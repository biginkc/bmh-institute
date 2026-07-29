// Round-6 Codex review of PR #130, finding 4: the Andrea Oral Check pilot's
// production-target preflight used `supabase status`, which reports the LOCAL
// Supabase stack. It cannot say anything about which remote project a
// deployment connection points at, so it could report a perfectly healthy
// local environment while the operator was aimed somewhere else entirely. The
// reviewer's specific escape route was a cloned test project holding the same
// release record and the same catalog hash: it would satisfy every SQL
// assertion in the preflight and the postflight while real production stayed
// untouched.
//
// The fix is to resolve the project identity from the connection itself,
// before any query result is trusted, and to refuse anything that is not
// exactly the Institute production project. Supabase's session pooler
// authenticates as `postgres.<project-ref>`, which makes the ref a property of
// the connection rather than something the target database can claim about
// itself. That is what this resolves, and everything below is deliberately
// strict: the whole finding is that a look-alike passed, so a near miss is
// refused rather than parsed generously.

export const INSTITUTE_PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";

const ALLOWED_SCHEMES = new Set(["postgres:", "postgresql:"]);
const REQUIRED_DATABASE = "postgres";
// Supabase pooler hostnames look like aws-1-us-west-1.pooler.supabase.com. The
// region prefix varies by project, the suffix does not. Anchored at both ends
// so a host that merely CONTAINS the real one cannot pass.
const POOLER_HOST_PATTERN = /^[a-z0-9-]+\.pooler\.supabase\.com$/;

// Round-7 review, finding 1: the round-6 preflight asserted
// current_user = 'postgres.<ref>'. That is the pooler ROUTING username, not
// the database role. Verified read-only against both real projects: on
// Institute production and on the BMH test project current_user is plain
// `postgres`, so that assertion could never have passed and the documented
// dry run and apply would have failed on the intended connection before
// reaching any migration.
//
// The replacement has to be something that provably identifies the project
// from inside the session, which rules out anything the session merely
// repeats back. pg_control_system().system_identifier is the cluster's own
// unique id, it is readable by the postgres role on Supabase, and it differs
// between projects. Verified read-only: Institute production reports
// 7626352619084395911 and the BMH test project reports 7637215626725903220,
// so this value discriminates exactly the mis-aim that matters most here.
export const INSTITUTE_PRODUCTION_SYSTEM_IDENTIFIER = "7626352619084395911";
export const INSTITUTE_PRODUCTION_DB_ROLE = "postgres";

export type ProductionDbTarget = {
  readonly projectRef: string;
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly database: string;
  /**
   * The connection with its password removed. Safe to print and safe to pass
   * as a process argument. Round-7 finding 3: the raw URL must never reach
   * argv or an error message.
   */
  readonly canonicalUrlWithoutPassword: string;
  readonly password: string;
};

export type ProductionDbTargetResult =
  | ({ readonly ok: true } & ProductionDbTarget)
  | { readonly ok: false; readonly error: string };

function refuse(error: string): ProductionDbTargetResult {
  return { ok: false, error };
}

/**
 * Resolves a database connection string to the Supabase project it actually
 * connects to, and refuses anything that is not Institute production.
 *
 * The returned value never carries the password, and no refusal message ever
 * quotes the connection string, so this is safe to print and safe to log.
 */
export function resolveProductionDbTarget(
  databaseUrl: string,
): ProductionDbTargetResult {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    return refuse("No database URL was provided.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch {
    return refuse("The database URL could not be parsed as a URL.");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return refuse(
      `Expected a postgres:// or postgresql:// connection string, got scheme ${parsed.protocol.replace(":", "")}.`,
    );
  }

  // Round-7 review, finding 2. PostgreSQL connection URIs accept query
  // parameters, and host, port, user and dbname among them OVERRIDE the
  // authority. Validating the authority and then handing the raw string to a
  // client means the client can connect somewhere else entirely: the reviewer
  // demonstrated an authority naming production plus
  // ?host=127.0.0.1&user=postgres.otherproject&dbname=otherdb passing this
  // gate. Every parameter is refused rather than allow-listing the ones known
  // to be dangerous today, because an allow-list is how this comes back the
  // next time libpq grows a parameter. The URL is also rebuilt from resolved
  // parts below, so even a parameter that slipped through here would not
  // survive into the connection the caller actually uses.
  if (databaseUrl.includes("?")) {
    return refuse(
      "The database URL carries query parameters. PostgreSQL URI parameters such as host, port, user and dbname override the authority, so a URL that names production can connect elsewhere. Supply a connection string with no parameters.",
    );
  }
  if (databaseUrl.includes("#")) {
    return refuse("The database URL carries a fragment, which is not valid in a connection string.");
  }

  const host = parsed.hostname;
  // libpq multi-host syntax (host1,host2) lets a second host win. new URL()
  // does not reliably reject it, so refuse it explicitly.
  if (host.includes(",") || parsed.href.split("@").length > 2) {
    return refuse(
      "The database URL names more than one host or contains more than one authority separator. Supply a single unambiguous host.",
    );
  }
  if (host.length === 0) {
    return refuse("The database URL has no host.");
  }
  if (!POOLER_HOST_PATTERN.test(host)) {
    return refuse(
      `Host ${host} is not a Supabase pooler host. The project ref can only be proven over the pooler connection (postgres.<ref>@<region>.pooler.supabase.com), which is also the connection supabase db push uses. A direct or local connection cannot prove which project it is.`,
    );
  }

  // decodeURIComponent because a pooler username is percent-encoded in a URL.
  let user: string;
  try {
    user = decodeURIComponent(parsed.username);
  } catch {
    return refuse("The database URL has an unparseable username.");
  }
  if (user.length === 0) {
    return refuse("The database URL has no username, so the project ref cannot be resolved.");
  }

  // Exactly two dot-separated parts: the role, then the ref. Not startsWith,
  // not includes, and not a split that tolerates extra segments -- each of
  // those would accept a look-alike.
  const parts = user.split(".");
  if (parts.length !== 2) {
    return refuse(
      `Connected as ${user}, which does not carry a project ref. Expected postgres.<project-ref> on the Supabase pooler.`,
    );
  }
  const [role, projectRef] = parts;
  if (role !== "postgres") {
    return refuse(`Expected the pooler role postgres, got ${role}.`);
  }
  if (projectRef !== INSTITUTE_PRODUCTION_PROJECT_REF) {
    return refuse(
      `Connected to project ${projectRef}, expected ${INSTITUTE_PRODUCTION_PROJECT_REF} (BMH Institute production). Refusing before any write.`,
    );
  }

  const database = parsed.pathname.replace(/^\//, "");
  if (database !== REQUIRED_DATABASE) {
    return refuse(
      `Expected database ${REQUIRED_DATABASE}, got ${database.length === 0 ? "none" : database}.`,
    );
  }

  let password: string;
  try {
    password = decodeURIComponent(parsed.password);
  } catch {
    return refuse("The database URL has an unparseable password.");
  }
  if (password.length === 0) {
    return refuse(
      "The database URL carries no password. Supply the full connection string rather than one that would prompt or fail partway through the apply.",
    );
  }

  const port = parsed.port.length > 0 ? parsed.port : "5432";

  // Rebuilt from the resolved parts rather than echoed back, so nothing that
  // was not explicitly validated above can ride along into the connection the
  // caller uses. The password is deliberately absent.
  const canonicalUrlWithoutPassword =
    `postgresql://${encodeURIComponent(user)}@${host}:${port}/${database}`;

  return {
    ok: true,
    projectRef,
    host,
    port,
    user,
    database,
    canonicalUrlWithoutPassword,
    password,
  };
}
