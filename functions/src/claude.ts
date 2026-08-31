import Anthropic from "@anthropic-ai/sdk";
import { defineSecret, defineString } from "firebase-functions/params";

export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
export const anthropicModel = defineString("ANTHROPIC_MODEL", {
  default: "claude-sonnet-5",
});

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: anthropicApiKey.value() });
  }
  return client;
}

/**
 * Sends a prompt to Claude and parses the reply as JSON. Retries once,
 * feeding the parse error back to the model, since even careful prompting
 * occasionally yields a reply with stray prose around the JSON payload.
 */
export async function askClaudeForJSON<T>(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = getClient();
  const model = anthropicModel.value();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: params.user },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

    try {
      return parseJsonLoose<T>(raw);
    } catch (err) {
      if (attempt === 1) {
        throw new Error(
          `Réponse du modèle non conforme au format JSON attendu: ${(err as Error).message}`
        );
      }
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content:
          "Ta réponse précédente n'était pas un JSON valide. Réponds " +
          "STRICTEMENT avec un objet JSON valide, sans texte autour, sans " +
          "balises markdown.",
      });
    }
  }

  throw new Error("Échec de l'appel au modèle.");
}

function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate) as T;
}
