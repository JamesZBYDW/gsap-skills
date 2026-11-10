import { apiRequireTeamWrite } from '@/lib/team-write';
import { assertSameOrigin, errorJson, handle, json } from '@/lib/http';
import { db } from '@/server/db/client';
import { emailLinkSecret, passwordLinkStatements } from '@/server/email/password-links';
import { rateLimit } from '@/lib/ratelimit';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const actor = await apiRequireTeamWrite();
    const { id } = await context.params;
    const database = db();
    const login = await database
      .prepare(
        'SELECT u.email,u.must_change_password FROM investors i JOIN users u ON u.id=i.user_id WHERE i.id=?',
      )
      .bind(id)
      .first<{ email: string; must_change_password: number }>();
    if (!login) return errorJson('Create an investor login first.', 404);
    if (!(await rateLimit(database, 'staff-link:' + id, 3, 600_000)).allowed)
      return errorJson('Please wait before sending another link.', 429);
    const [issued] = await database.batch(
      passwordLinkStatements(
        database,
        login.email,
        login.must_change_password ? 'invite' : 'reset',
        emailLinkSecret(),
        Date.now(),
        id,
        actor.id,
      ),
    );
    if (!issued?.meta.changes) return errorJson('The login changed. Refresh and try again.', 409);
    return json({ ok: true });
  });
}
