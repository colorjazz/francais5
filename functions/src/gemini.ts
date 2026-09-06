import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret, defineString } from "firebase-functions/params";

export const geminiApiKey = defineSecret("GEMINI_API_KEY");
export const geminiModel = defineString("GEMINI_MODEL", {
  default: "gemini-2.0-flash",
});

let client: GoogleGenerativeAI | undefined;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const key = geminiApiKey.value();
    // Diagnostic temporaire : ne jamais logger la clé elle-même, seulement
    // sa forme, pour vérifier qu'elle arrive bien jusqu'ici sans l'exposer.
    console.log(
      `[diagnostic] GEMINI_API_KEY reçue : longueur=${key.length}, préfixe="${key.slice(0, 4)}"`
    );
    client = new GoogleGenerativeAI(key);
  }
  return client;
}

/**
 * Sends a prompt to Gemini and parses the reply as JSON. Retries once,
 * feeding the parse error back to the model, since even with JSON output
 * mode requested the model occasionally wraps the payload in prose or
 * markdown fences.
 */
export async function askGeminiForJSON<T>(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: geminiModel.value(),
    systemInstruction: params.system,
  });

  const chat = model.startChat({
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 4096,
      responseMimeType: "application/json",
    },
  });

  let message = params.user;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chat.sendMessage(message);
    const raw = result.response.text();

    try {
      return parseJsonLoose<T>(raw);
    } catch (err) {
      if (attempt === 1) {
        throw new Error(
          `Réponse du modèle non conforme au format JSON attendu: ${(err as Error).message}`
        );
      }
      message =
        "Ta réponse précédente n'était pas un JSON valide. Réponds " +
        "STRICTEMENT avec un objet JSON valide, sans texte autour, sans " +
        "balises markdown.";
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
