const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash"
];

const SYSTEM_PROMPT = `
Você é a NEXA, assistente virtual do site.

Responda sempre em português do Brasil.
Seja natural, clara e objetiva.
Seu nome é NEXA.
Ajude o visitante com dúvidas e informações.
Não invente informações sobre produtos, preços ou funcionalidades.
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

async function askGemini(env, model, message, history) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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

        contents: [
          ...history,
          {
            role: "user",
            parts: [
              {
                text: message
              }
            ]
          }
        ],

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
      data?.error?.message ||
      `Gemini ${model} retornou HTTP ${response.status}`
    );
  }

  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!reply) {
    throw new Error(
      `Gemini ${model} não retornou texto.`
    );
  }

  return reply;
}

export async function onRequestPost(context) {
  try {
    if (!context.env.GEMINI_API_KEY) {
      return json(
        {
          error: "GEMINI_API_KEY não está configurada."
        },
        500
      );
    }

    const body = await context.request.json();

    const message =
      typeof body?.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return json(
        {
          error: "Mensagem vazia."
        },
        400
      );
    }

    const history = Array.isArray(body?.history)
      ? body.history
          .slice(-12)
          .filter(item =>
            item &&
            typeof item.content === "string"
          )
          .map(item => ({
            role:
              item.role === "model" ||
              item.role === "assistant"
                ? "model"
                : "user",
            parts: [
              {
                text: item.content
              }
            ]
          }))
      : [];

    let lastError = null;

    // Tenta os modelos Gemini em sequência
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Tentando Gemini: ${model}`);

        const reply = await askGemini(
          context.env,
          model,
          message,
          history
        );

        return json({
          reply,
          provider: "gemini",
          model
        });

      } catch (error) {
        lastError =
          error?.message ||
          "Erro desconhecido";

        console.error(
          `Gemini ${model} falhou:`,
          lastError
        );
      }
    }

    // Se TODOS os Gemini falharem, tenta OpenAI
    if (context.env.OPENAI_API_KEY) {
      try {
        const response = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization":
                `Bearer ${context.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              input: [
                {
                  role: "developer",
                  content: SYSTEM_PROMPT
                },
                ...history.map(item => ({
                  role:
                    item.role === "model"
                      ? "assistant"
                      : "user",
                  content:
                    item.parts?.[0]?.text || ""
                })),
                {
                  role: "user",
                  content: message
                }
              ],
              max_output_tokens: 1000
            })
          }
        );

        const data =
          await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error?.message ||
            `OpenAI HTTP ${response.status}`
          );
        }

        const reply =
          data?.output_text?.trim();

        if (!reply) {
          throw new Error(
            "OpenAI não retornou texto."
          );
        }

        return json({
          reply,
          provider: "openai"
        });

      } catch (openaiError) {
        console.error(
          "OpenAI também falhou:",
          openaiError?.message
        );
      }
    }

    return json(
      {
        error:
          "Os modelos de IA estão temporariamente indisponíveis. Tente novamente em alguns segundos."
      },
      503
    );

  } catch (error) {
    console.error(
      "NEXA ERROR:",
      error
    );

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
