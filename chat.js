const MODEL="gemini-2.5-flash";

export async function onRequestPost(context){
  try{
    if(!context.env.GEMINI_API_KEY)return json({error:"GEMINI_API_KEY não está configurada no Cloudflare."},500);
    const body=await context.request.json();
    const message=typeof body.message==="string"?body.message.trim():"";
    const history=Array.isArray(body.history)?body.history:[];
    if(!message)return json({error:"Mensagem vazia."},400);

    const safeHistory=history.filter(item=>item&&(item.role==="user"||item.role==="model")&&typeof item.text==="string").slice(-12);
    const contents=[...safeHistory.map(item=>({role:item.role,parts:[{text:item.text.slice(0,4000)}]})),{role:"user",parts:[{text:message.slice(0,4000)}]}];

    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":context.env.GEMINI_API_KEY},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:"Você é NEXA, um assistente pessoal digital. Responda em português do Brasil, de forma clara, útil e natural. Seja objetiva, mas explique quando necessário. Não diga que é humana. Você é uma inteligência artificial chamada NEXA."}]},
        contents,
        generationConfig:{temperature:0.7,maxOutputTokens:1000}
      })
    });

    const data=await response.json();
    if(!response.ok)return json({error:data?.error?.message||"A API Gemini retornou um erro."},response.status);
    const reply=data?.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("").trim();
    if(!reply)return json({error:"O Gemini não retornou uma resposta."},502);
    return json({reply});
  }catch(error){return json({error:"Erro interno ao processar a mensagem."},500);}
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8"}});}