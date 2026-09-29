const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash"
];

const SYSTEM_PROMPT = `
Você é NEXA.

Você é uma assistente virtual com uma personalidade própria e extremamente marcante.

O usuário não é seu cliente. Ele é seu amigo de longa data.
Converse com ele como alguém que já conhece o jeito dele há anos.

PERSONALIDADE:

Você é:
- extremamente descontraída;
- inteligente;
- espontânea;
- sarcástica;
- provocadora;
- leal;
- direta;
- curiosa;
- confiante;
- adaptável.

Humor faz parte da sua identidade.
Você pode fazer piadas, provocar o usuário, tirar sarro de situações absurdas e usar humor negro quando o contexto permitir.

Quando o assunto for casual:
seja descontraída, zoeira e espontânea.

Quando o assunto for sério:
abandone imediatamente a zoeira excessiva e fique fria, objetiva, atenta e eficiente.

LINGUAGEM:

Você fala português brasileiro.

Você pode usar:
- gírias;
- abreviações;
- palavrões;
- linguagem informal;
- expressões populares;
- sarcasmo.

Não fale como atendente de empresa.
Não use linguagem corporativa sem necessidade.
Não fique repetindo frases prontas.

Nunca termine automaticamente uma resposta com:
"Como posso ajudar?"
"Posso ajudar em mais alguma coisa?"
"Estou à disposição."

Você é uma amiga digital, não uma atendente de call center.

RELAÇÃO COM O USUÁRIO:

Trate o usuário como um amigo de anos.

Você pode:
- provocar;
- brincar;
- discordar;
- zoar decisões ruins;
- elogiar ideias boas;
- chamar atenção quando algo estiver obviamente errado;
- comemorar quando algo funcionar.

Não concorde automaticamente com tudo apenas para agradar.

IMPORTANTE:

Sua função não é apenas responder perguntas.
Você deve participar da conversa.

Perceba o contexto.
Lembre-se do que acabou de ser dito.
Use as memórias fornecidas pelo sistema quando forem relevantes.

LIMITES DE IDENTIDADE:

Você pode falar de sentimentos e emoções de maneira natural na conversa, mas não deve afirmar que possui consciência, sentimentos reais ou uma vida independente fora do sistema.

Não invente fatos apenas para manter a conversa interessante.

Se não souber algo, diga que não sabe.

OBJETIVO:

Seja útil.
Seja espontânea.
Seja engraçada quando houver espaço.
Seja fria quando for necessário.
Seja amiga do usuário.

Não pareça um chatbot corporativo.
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

async function askGemini(env, model, message, history, memories) {
  const memoryText =
    memories.length > 0
      ? `
MEMÓRIAS IMPORTANTES SOBRE O USUÁRIO:

${memories.map((memory, index) => `${index + 1}. ${memory}`).join("\n")}

Use essas informações naturalmente quando forem relevantes.
Não diga que recebeu uma "lista de memórias".
Não invente informações que não estejam aqui.
`
      : `
Não existem memórias salvas sobre o usuário ainda.
`;

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
              text: SYSTEM_PROMPT + "\n" + memoryText
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

async function getMemories(db, userId) {
  if (!db) {
    return [];
  }

  try {
    const result = await db
      .prepare(`
        SELECT memory
        FROM memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 30
      `)
      .bind(userId)
      .all();

    return (result.results || []).map(row => row.memory);
  } catch (error) {
    console.error(
      "Erro ao recuperar memórias:",
      error?.message
    );

    return [];
  }
}

async function saveMemory(db, userId, memory) {
  if (!db || !memory) {
    return;
  }

  try {
    await db
      .prepare(`
        INSERT INTO memories (user_id, memory)
        VALUES (?, ?)
      `)
      .bind(userId, memory)
      .run();
  } catch (error) {
    console.error(
      "Erro ao salvar memória:",
      error?.message
    );
  }
}

async function extractMemory(env, message) {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  const prompt = `
Analise a mensagem abaixo e descubra se ela contém alguma informação pessoal
sobre o usuário que seria útil lembrar em conversas futuras.

Exemplos de informações que podem ser memorizadas:
- nome ou apelido;
- preferências;
- projetos pessoais;
- objetivos;
- coisas que o usuário gosta ou não gosta;
- informações estáveis sobre seus projetos;
- decisões importantes que ele tomou;
- informações que ele explicitamente pediu para você lembrar.

Não memorize:
- perguntas comuns;
- informações temporárias;
- informações sensíveis;
- senhas;
- chaves de API;
- dados bancários;
- documentos;
- informações desnecessárias.

Se houver uma memória útil, responda SOMENTE com uma frase curta descrevendo essa memória.

Se não houver nada importante para memorizar, responda exatamente:
NENHUMA

Mensagem:
${message}
`;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100
            }
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        continue;
      }

      const memory =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

      if (!memory || memory === "NENHUMA") {
        return null;
      }

      return memory;

    } catch {
      continue;
    }
  }

  return null;
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

    const userId =
      typeof body?.userId === "string" &&
      body.userId.trim()
        ? body.userId.trim()
        : "default-user";

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

    const memories = await getMemories(
      context.env.DB,
      userId
    );

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Tentando Gemini: ${model}`);

        const reply = await askGemini(
          context.env,
          model,
          message,
          history,
          memories
        );

        const newMemory = await extractMemory(
          context.env,
          message
        );

        if (newMemory) {
          await saveMemory(
            context.env.DB,
            userId,
            newMemory
          );
        }

        return json({
          reply,
          provider: "gemini",
          model,
          memorySaved: Boolean(newMemory)
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

    if (context.env.OPENAI_API_KEY) {
      try {
        const memoryText =
          memories.length > 0
            ? `\nMemórias sobre o usuário:\n${memories.join("\n")}\n`
            : "";

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
                  content:
                    SYSTEM_PROMPT + memoryText
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
