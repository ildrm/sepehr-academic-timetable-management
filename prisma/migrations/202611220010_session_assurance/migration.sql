ALTER TABLE web_session ADD COLUMN authentication_source text NOT NULL DEFAULT 'development'
  CHECK (authentication_source IN ('development','oidc'));
ALTER TABLE web_session ADD COLUMN staff_assurance boolean NOT NULL DEFAULT false;
CREATE INDEX web_session_expiry ON web_session(expires_at);
