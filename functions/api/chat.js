const GEMINI_MODEL = "gemini-3.8-flash";
const OPENAI_MODEL = "gpt-5.6-luna";

const SYSTEM_PROMPT = `
Você é a NEXA, assistente virtual do site.

Responda em português do Brasil.
Seja natural, objetiva e útil.
Seu nome é NEXA.
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

async function askGemini(env, message, history) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não encontrada no Cloudflare.");
  }

  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

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
          parts: [{ text: SYSTEM_PROMPT }]
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

  if (!response.ok) {
    throw new Error(
      `Gemini ${response.status}: ${
        data?.error?.message || "erro desconhecido"
      }`
    );
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    throw new Error("Gemini não retornou texto.");
  }

  return reply;
}

async function askOpenAI(env, message, history) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não encontrada no Cloudflare.");
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
    throw new Error(
      `OpenAI ${response.status}: ${
        data?.error?.message || "erro desconhecido"
      }`
    );
  }

  if (data?.output_text) {
    return data.output_text.trim();
  }

  let reply = "";

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        reply += content.text;
      }
    }
  }

  reply = reply.trim();

  if (!reply) {
    throw new Error("OpenAI não retornou texto.");
  }

  return reply;
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const message = body?.message?.trim();

    if (!message) {
      return json(
        {
          error: "Mensagem vazia."
        },
        400
      );
    }

    const history = Array.isArray(body.history)
      ? body.history.slice(-12)
      : [];

    let geminiError = null;

    // =========================
    // TENTA GEMINI
    // =========================

    try {
      const reply = await askGemini(
        context.env,
        message,
        history
      );

      return json({
        reply,
        provider: "gemini"
      });

    } catch (error) {
      geminiError = error?.message || "Erro desconhecido";

      console.error(
        "GEMINI FALHOU:",
        geminiError
      );
    }

    // =========================
    // TENTA OPENAI
    // =========================

    try {
      const reply = await askOpenAI(
        context.env,
        message,
        history
      );

      return json({
        reply,
        provider: "openai"
      });

    } catch (error) {
      const openaiError =
        error?.message || "Erro desconhecido";

      console.error(
        "OPENAI FALHOU:",
        openaiError
      );

      return json(
        {
          error:
            `Gemini: ${geminiError} | OpenAI: ${openaiError}`
        },
        503
      );
    }

  } catch (error) {
    console.error(
      "NEXA API:",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Erro interno."
      },
      500
    );
  }
}
