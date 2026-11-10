import 'server-only';
import { apiRequireTeam } from './auth';
import { getImpersonatedInvestorId } from './session';
import { HttpError } from './http';

/** Staff writes are available from the team console after leaving investor preview. */
export async function apiRequireTeamWrite() {
  const user = await apiRequireTeam();
  if (await getImpersonatedInvestorId())
    throw new HttpError(403, 'Exit the read-only investor view to make changes.');
  return user;
}
