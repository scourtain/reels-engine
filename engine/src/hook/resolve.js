import { placeCaption } from "../build/placement.js";
import { planHook } from "./layout.js";

export const BEHIND_NOT_READY = "Type behind the head is not available here.";

// Turns a cut list's hook_card into a plan the composition can draw, or says in plain words why it was left off.
// behind: async (plan) => { available, reason, notes } for the two looks that sit behind the person. Without it those looks are refused.
export async function resolveHook({ cl, style, font, duration, behind = null }) {
  if (cl.hook_card?.enabled !== true) return { hook: null, warnings: [] };
  const cap = style.captions;
  const captionBox = placeCaption({ position: cl.caption_position ?? cap.position, faceBox: cl.face_box, size: cap.size, mode: cap.mode });
  const plan = planHook({ card: cl.hook_card, faceBox: cl.face_box, font, captionBox, duration });
  const off = (reason) => ({ hook: null, warnings: [`Hook card left off: ${reason}`] });
  if (!plan.available) return off(plan.reason);
  const own = plan.warnings ?? [];
  if (plan.layer !== "behind") return { hook: plan, warnings: own };
  if (!behind) return off(BEHIND_NOT_READY);
  const verdict = await behind(plan);
  return verdict.available ? { hook: plan, warnings: [...own, ...verdict.notes] } : off(verdict.reason);
}
