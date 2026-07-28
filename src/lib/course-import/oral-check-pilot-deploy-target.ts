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

export type ProductionDbTarget = {
  readonly projectRef: string;
  readonly host: string;
  readonly user: string;
  readonly database: string;
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

  const host = parsed.hostname;
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

  return {
    ok: true,
    projectRef,
    host,
    user,
    database,
  };
}
