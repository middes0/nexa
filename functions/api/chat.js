const MODEL = "gemini-3.8-flash";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

export async function onRequestPost(context) {
  try {
    if (!context.env.GEMINI_API_KEY) {
      return json(
        {
          error: "GEMINI_API_KEY não está configurada no Cloudflare."
        },
        500
      );
    }

    const body = await context.request.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    if (!message) {
      return json(
        {
          error: "Mensagem vazia."
        },
        400
      );
    }

    const safeHistory = history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "model") &&
          typeof item.text === "string"
      )
      .slice(-12);

    const contents = [
      ...safeHistory.map((item) => ({
        role: item.role,
        parts: [
          {
            text: item.text.slice(0, 4000)
          }
        ]
      })),

      {
        role: "user",
        parts: [
          {
            text: message.slice(0, 4000)
          }
        ]
      }
    ];

    let lastError = "Erro desconhecido.";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": context.env.GEMINI_API_KEY
            },

            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text:
                      "Você é NEXA, um assistente pessoal digital. " +
                      "Responda em português do Brasil, de forma clara, útil e natural. " +
                      "Seja objetiva, mas explique quando necessário. " +
                      "Não diga que é humana. " +
                      "Você é uma inteligência artificial chamada NEXA."
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

        const data = await response.json();

        if (response.ok) {
          const reply =
            data?.candidates?.[0]?.content?.parts
              ?.map((part) => part.text || "")
              .join("")
              .trim();

          if (reply) {
            return json({
              reply
            });
          }

          lastError = "O Gemini não retornou uma resposta.";
        } else {
          lastError =
            data?.error?.message ||
            `A API Gemini retornou HTTP ${response.status}.`;

          const isTemporaryError =
            response.status === 429 ||
            response.status === 500 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            lastError.toLowerCase().includes("high demand") ||
            lastError.toLowerCase().includes("temporar");

          if (!isTemporaryError) {
            return json(
              {
                error: lastError
              },
              response.status
            );
          }
        }

      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : "Erro de conexão com o Gemini.";
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * attempt)
        );
      }
    }

    return json(
      {
        error:
          "O Gemini está temporariamente sobrecarregado. " +
          "A NEXA tentou novamente, mas o serviço ainda não respondeu. " +
          "Tente enviar a mensagem novamente em alguns segundos."
      },
      503
    );

  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao processar a mensagem."
      },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      }
    }
  );
}
