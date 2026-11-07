import { checkPlacementAnswers, nextPlacementItem, PLACEMENT_INSTRUCTIONS, PLACEMENT_STEPS, placementResult } from '../../../../learn/english';
import { failure, invalid, json, readJson, requireUser } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// Deterministic: no model, no storage. The client sends every answer so far; the server replays them to know the next question.
export async function POST(request: Request) {
  try {
    requireUser(request, true);
    const body = await readJson(request, 2048);
    const checked = checkPlacementAnswers(body.answers ?? []);
    if (!checked.ok) throw invalid('Cevap listesi geçersiz.');
    if (checked.answers.length >= PLACEMENT_STEPS) {
      const result = placementResult(checked.answers);
      return json({ done: true, result: { ...result, approximate: true, note: 'Bu yaklaşık bir ölçümdür, sınav değildir. Seviyeni daha sonra değiştirebilirsin.' } });
    }
    const item = nextPlacementItem(checked.answers);
    return json({ done: false, step: checked.answers.length + 1, total: PLACEMENT_STEPS,
      question: { id: item.id, kind: item.kind, instruction: PLACEMENT_INSTRUCTIONS[item.kind], ...(item.text ? { text: item.text } : {}), prompt: item.prompt, options: item.options } });
  } catch (error) { return failure(error, 'Orbit english placement failed'); }
}
