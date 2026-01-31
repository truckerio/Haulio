import { z } from "zod";
import { ASSIST_MODEL_VERSION } from "./scoring";

export const suggestionLogSchema = z.object({
  logId: z.string().optional(),
  modelVersion: z.string().min(1).default(ASSIST_MODEL_VERSION),
  weightsVersion: z.string().optional(),
  suggestions: z.any().optional(),
  chosenDriverId: z.string().optional(),
  chosenTruckId: z.string().optional(),
  overrideReason: z.string().optional(),
  overrideNotes: z.string().optional(),
});

export type SuggestionLogPayload = z.infer<typeof suggestionLogSchema>;

export function parseSuggestionLogPayload(input: unknown) {
  return suggestionLogSchema.safeParse(input);
}
