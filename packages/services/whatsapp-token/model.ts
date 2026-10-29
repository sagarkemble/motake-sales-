import { z } from "zod";

import type {
  ResumeHeldResult,
  WhatsAppPausedReason,
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

// What the Admin banner and the Fix access token dialog show (Spec J-0). Never the token.
export interface WhatsAppTokenSettings {
  // Send waiting messages is refused only while this is `invalid`.
  state: WhatsAppTokenSettingsState;
  // Why messages are paused (the banner shows only then); null while not paused or unknown.
  pausedReason: WhatsAppPausedReason | null;
  // Messages waiting (token-held plus payment-held). Null while the state is unknown.
  heldCount: number | null;
  // When Meta last accepted a send. Null if never or while the state is unknown.
  lastWorkedAt: Date | null;
}

// The notification app's token procedures, reached through the typed notification client with the
// internal key. A refused resumeHeld throws an error whose `refusalOf` reason is token_not_working.
export interface NotificationTokenGateway {
  tokenStatus(): Promise<WhatsAppTokenStatus>;
  refreshToken(): Promise<WhatsAppTokenStatus>;
  resumeHeld(): Promise<ResumeHeldResult>;
}

export type { ResumeHeldResult, WhatsAppPausedReason, WhatsAppTokenStatus };
