# NEXA + Gemini

Versão da NEXA com chat conectado ao Gemini através de uma Cloudflare Pages Function.

Estrutura:
- index.html
- style.css
- script.js
- functions/api/chat.js

Configuração:
No Cloudflare Pages, crie um Secret chamado `GEMINI_API_KEY` e coloque nele sua chave do Gemini.
Nunca coloque a chave no `script.js` ou em outro arquivo público.
Depois faça um novo deploy.
