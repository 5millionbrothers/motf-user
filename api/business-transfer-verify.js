const { json, requireEnv, supabaseRequest, authenticatedUser } = require("./_server");
const { allowCors, readBody, verifiedSession } = require("./_identity");
const { claimIdentitySession, assertIdentityMatchesProfile } = require("./_accounts");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROOF_MAX_AGE_MS = 15 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST only." });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const user = await authenticatedUser(String(req.headers.authorization || ""));
    if (!user?.id) return json(res, 401, { ok: false, message: "Login is required." });
    const body = await readBody(req);
    const transferId = String(body.transferId || "").trim();
    const identityToken = String(body.identityToken || "").trim();
    if (!UUID.test(transferId) || !identityToken) {
      return json(res, 400, { ok: false, message: "A transfer ID and identity token are required." });
    }
    const identity = await verifiedSession(identityToken, "profile_upgrade");
    if (identity.user_id !== user.id || identity.provider !== "kcp" || !identity.verified_ci_hash) {
      return json(res, 403, { ok: false, message: "Identity verification does not belong to this account." });
    }
    const verifiedAt = Date.parse(identity.verified_at);
    const age = Date.now() - verifiedAt;
    if (!Number.isFinite(verifiedAt) || age < 0 || age >= PROOF_MAX_AGE_MS) {
      return json(res, 409, { ok: false, message: "Fresh identity verification is required." });
    }
    const profile = await assertIdentityMatchesProfile(identity, user.id, true);

    // A compare-and-set claim prevents the same KCP result from funding two proofs.
    // On RPC failure the token stays consumed; the actor must verify again.
    await claimIdentitySession(identity, user.id);
    if (!profile.identity_ci_hash) {
      const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&identity_ci_hash=is.null&status=eq.approved&withdrawal_processed_at=is.null&select=id,identity_ci_hash`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          identity_ci_hash: identity.verified_ci_hash,
          identity_provider: "kcp",
          identity_verified_at: identity.verified_at,
          full_name: identity.verified_name,
          birth_date: identity.verified_birth_date,
        }),
      });
      if (!profiles?.length) {
        const current = await assertIdentityMatchesProfile(identity, user.id, true);
        if (current.identity_ci_hash !== identity.verified_ci_hash) {
          return json(res, 409, { ok: false, message: "Account identity changed during verification. Verify again." });
        }
      }
    }
    await supabaseRequest("/rest/v1/rpc/record_business_transfer_verification", {
      method: "POST",
      body: JSON.stringify({
        target_transfer_id: transferId,
        target_user_id: user.id,
        verified_at: identity.verified_at,
      }),
    });
    return json(res, 200, { ok: true, transferId, verifiedAt: identity.verified_at });
  } catch (error) {
    return json(res, error.statusCode || 500, { ok: false, message: error.message || "Transfer verification failed." });
  }
};
