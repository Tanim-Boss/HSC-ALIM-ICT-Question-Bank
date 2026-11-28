import 'server-only';

/**
 * `GET /api/v1/staff/questions/[id]` — Phase 04G staff question detail.
 *
 * Thin HTTP adapter over the existing staff boundary (OD-17 §3, §15):
 * read the path parameter → delegate to `getStaffQuestion` →
 * project an explicit camelCase DTO → set headers.
 *
 * What it deliberately does not do
 * --------------------------------
 *   · No Prisma access. `getStaffQuestion`
 *     (`server/questions/staff-boundary.ts`) → `getQuestionForStaff`
 *     (`server/questions/authoring/queries.ts`) owns the authorized staff
 *     detail projection.
 *   · No new authorization model. `requireActor()` resolves the verified actor
 *     and `authorize(…, 'question.read_staff')` runs inside the query service,
 *     before the row is read. The id in the URL is a resource locator, never a
 *     credential, and no caller-supplied actor id or role is accepted.
 *   · No privilege widening: answer key and rubric appear in the response only
 *     because the existing staff projection returns them to a caller that
 *     already passed `question.read_staff`. An unauthenticated or student
 *     caller receives 401/403 and an empty body — never a partial record.
 *
 * Missing resource: `getQuestionForStaff` raises `NOT_FOUND`, mapped to a safe
 * 404 by `errorResponse`. The existing staff read model is global (OD-17 §6
 * keeps institutional scoping out of this phase), so 404 discloses nothing the
 * caller is not already allowed to learn.
 *
 * Next.js 16: route parameters are asynchronous — `params` is a Promise and is
 * awaited before use.
 */

import { getStaffQuestion } from '@/server/questions/staff-boundary';
import { getQuestionInputSchema } from '@/server/questions/authoring/schemas';

import { toStaffQuestionDetailDto } from '@/server/questions/read-api/dto';
import { errorResponse, jsonResponse, newRequestId } from '@/server/questions/read-api/errors';
import { parseStaffInput } from '@/server/questions/read-api/input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = 'GET /api/v1/staff/questions/[id]';

/** The shape Next.js 16 generates for a dynamic route in `next typegen`. */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();

  try {
    const { id } = await context.params;

    // Strict validation through the EXISTING schema: a non-UUID id is
    // `VALIDATION_FAILED` (422) with `field: 'questionId'`, exactly as the
    // authoring services report it. `strictObject` also means a malformed
    // parameter object cannot smuggle extra keys into the domain call. Identity
    // is established before a validation failure is reported, so an anonymous
    // caller learns nothing about the accepted id shape.
    const input = await parseStaffInput(getQuestionInputSchema, { questionId: id });

    const question = await getStaffQuestion(input);

    return jsonResponse(toStaffQuestionDetailDto(question), 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId, ROUTE);
  }
}
