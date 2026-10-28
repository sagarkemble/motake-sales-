import { z } from "zod";

import type {
  ResumeHeldResult,
  WhatsAppTokenState,
  WhatsAppTokenStatus,
} from "../notification/model";

// A pasted WhatsApp access token. Checked with Meta before it is saved; never echoed back.
export const updateWhatsAppTokenInputSchema = z.object({
  token: z.string().trim().min(1).max(2048),
});
export type UpdateWhatsAppTokenInput = z.input<typeof updateWhatsAppTokenInputSchema>;

// `unknown`: the notification app is not configured or did not answer.
export type WhatsAppTokenSettingsState = WhatsAppTokenState | "unknown";

// What the Admin banner and the Fix access token dialog show (Spec J-0). Never the token: only its last 4 characters.
export interface WhatsAppTokenSettings {
  state: WhatsAppTokenSettingsState;
  checkedAt: Date | null;
  // Null while the state is unknown.
  heldCount: number | null;
  last4: string | null;
  updatedAt: Date | null;
  updatedBy: { id: string; name: string | null } | null;
}

// The notification app's token procedures, reached through the typed notification client with the
// internal key. A refused resumeHeld throws an error whose `refusalOf` reason is token_not_working.
export interface NotificationTokenGateway {
  tokenStatus(): Promise<WhatsAppTokenStatus>;
  refreshToken(): Promise<WhatsAppTokenStatus>;
  resumeHeld(): Promise<ResumeHeldResult>;
}

export type { ResumeHeldResult, WhatsAppTokenStatus };
