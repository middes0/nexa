const GEMINI_MODEL = "gemini-3.8-flash";
const OPENAI_MODEL = "gpt-5.6-luna";

const MAX_GEMINI_RETRIES = 2;
const RETRY_DELAY = 1200;

const SYSTEM_PROMPT = `
Você é a NEXA, a assistente virtual do site.

Regras:
- Responda sempre em português do Brasil.
- Seja clara, natural e objetiva.
- Não diga que você é uma IA da Google ou da OpenAI.
- Seu nome é NEXA.
- Ajude o visitante com dúvidas, informações e navegação pelo site.
- Se não souber algo, diga claramente que não sabe.
- Não invente informações sobre produtos, preços ou funcionalidades do site.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTemporaryError(status, text = "") {
  const lower = text.toLowerCase();

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lower.includes("high demand") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("try again later")
  );
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .filter(item => item && typeof item.content === "string")
    .map(item => ({
      role:
        item.role === "assistant" || item.role === "model"
          ? "model"
          : "user",
      content: item.content.slice(0, 6000)
    }));
}

/* =========================
   GEMINI
========================= */

async function askGemini(env, message, history) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não está configurada.");
  }

  const contents = [
    ...history.map(item => ({
      role: item.role,
      parts: [{ text: item.content }]
    })),
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: SYSTEM_PROMPT
                }
              ]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000
            }
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const reply =
          data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!reply) {
          throw new Error("O Gemini não retornou uma resposta.");
        }

        return {
          reply,
          provider: "gemini"
        };
      }

      const errorMessage =
        data?.error?.message ||
        `Erro do Gemini (${response.status})`;

      lastError = new Error(errorMessage);

      if (
        !isTemporaryError(response.status, errorMessage) ||
        attempt >= MAX_GEMINI_RETRIES
      ) {
        break;
      }

      await sleep(RETRY_DELAY * (attempt + 1));
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_GEMINI_RETRIES) {
        break;
      }

      await sleep(RETRY_DELAY * (attempt + 1));
    }
  }

  throw lastError || new Error("Gemini indisponível.");
}

/* =========================
   OPENAI
========================= */

async function askOpenAI(env, message, history) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não está configurada.");
  }

  const input = [
    {
      role: "developer",
      content: SYSTEM_PROMPT
    },
    ...history.map(item => ({
      role: item.role === "model" ? "assistant" : "user",
      content: item.content
    })),
    {
      role: "user",
      content: message
    }
  ];

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input,
        max_output_tokens: 1000
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.error?.message ||
      `Erro da OpenAI (${response.status})`;

    throw new Error(errorMessage);
  }

  let reply = "";

  if (typeof data?.output_text === "string") {
    reply = data.output_text;
  }

  if (!reply && Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const content of item.content) {
        if (typeof content?.text === "string") {
          reply += content.text;
        }
      }
    }
  }

  reply = reply.trim();

  if (!reply) {
    throw new Error("A OpenAI não retornou uma resposta.");
  }

  return {
    reply,
    provider: "openai"
  };
}

/* =========================
   API
========================= */

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => null);

    if (!body || typeof body.message !== "string") {
      return json(
        {
          error: "Mensagem inválida."
        },
        400
      );
    }

    const message = body.message.trim();

    if (!message) {
      return json(
        {
          error: "Digite uma mensagem."
        },
        400
      );
    }

    if (message.length > 6000) {
      return json(
        {
          error: "Mensagem muito grande."
        },
        400
      );
    }

    const history = normalizeHistory(body.history);

    // 1º: Gemini
    try {
      const result = await askGemini(
        context.env,
        message,
        history
      );

      return json(result);
    } catch (geminiError) {
      console.warn(
        "Gemini falhou. Tentando OpenAI:",
        geminiError?.message
      );
    }

    // 2º: OpenAI
    try {
      const result = await askOpenAI(
        context.env,
        message,
        history
      );

      return json(result);
    } catch (openaiError) {
      console.error(
        "Gemini e OpenAI falharam.",
        openaiError?.message
      );

      return json(
        {
          error:
            "Não foi possível obter uma resposta agora. Gemini e OpenAI estão indisponíveis no momento."
        },
        503
      );
    }
  } catch (error) {
    console.error("NEXA API error:", error);

    return json(
      {
        error:
          error?.message ||
          "Erro interno da NEXA."
      },
      500
    );
  }
}
