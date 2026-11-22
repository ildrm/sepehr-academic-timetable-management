CREATE TABLE oidc_attempt (
  state_hash text PRIMARY KEY, browser_hash text NOT NULL, nonce text NOT NULL, verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX oidc_attempt_expiry ON oidc_attempt(expires_at);
