import { z } from "zod";

/** Only name and e-mail are collected (spec RF-06). */
export const registrationInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(80, "Use no máximo 80 caracteres.")
    .regex(/^[^<>{}\\]*$/, "Use apenas letras, espaços e pontuação comum."),
  email: z.string().trim().max(254, "E-mail muito longo.").pipe(z.email("Informe um e-mail válido.")),
  acceptedRules: z.literal("on", { error: "Confirme que leu as regras." }),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

/**
 * Canonical form used for de-duplication. Lowercases the whole address;
 * provider-specific rules (dots, plus aliases) are intentionally not applied.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
