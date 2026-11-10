-- Older invitation/recovery links expire when credentials or their destination change.
CREATE TRIGGER invalidate_password_links AFTER UPDATE OF password_hash, email ON users
WHEN OLD.password_hash <> NEW.password_hash OR OLD.email <> NEW.email
BEGIN
  UPDATE password_resets SET used_at = unixepoch() * 1000
  WHERE user_id = NEW.id AND used_at IS NULL;
END;
