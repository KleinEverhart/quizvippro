import { db } from './db';

export async function attemptIdFor(participantId: string): Promise<string | null> {
  const { data } = await db().from('attempts').select('id').eq('participant_id', participantId).maybeSingle();
  return data?.id ?? null;
}
