import 'server-only';

// Server entry point for password hashing; the implementation is shared with
// the Node admin-bootstrap CLI (see password-core.ts).
export { hashPassword, verifyPassword, needsRehash, passwordPolicyError } from './password-core';
