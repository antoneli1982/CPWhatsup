# Guia de deploy — CPWhat's up com Resumo IA + Diarização

Este pacote contém:

| Arquivo | O que é |
|---|---|
| `index.html` | App completo com modal de resumo premium **e** diarização automática via Deepgram |
| `worker.js` | Proxy Cloudflare para a API da Anthropic (só para o resumo IA) |

---

## Parte 1 — Resumo IA (Anthropic via Cloudflare Worker)

Essa parte não mudou em relação ao guia anterior. Resumido:

1. Chave Anthropic em https://console.anthropic.com
2. Cloudflare Worker → **Create** → cole `worker.js`
3. Settings → Variables → **Secret** `ANTHROPIC_API_KEY` com sua chave
4. Ajuste `ALLOWED_ORIGINS` no worker para os seus domínios
5. Copie a URL do Worker e cole no `index.html`:
   ```js
   const SUMMARY_API_URL = "https://SEU-WORKER.SEU-USUARIO.workers.dev/";
   ```

---

## Parte 2 — Diarização (Deepgram direto do navegador, BYO-key)

A diarização usa **sua própria chave Deepgram**, salva apenas no seu navegador via `localStorage`. Não precisa de Worker — o browser fala direto com a Deepgram via WebSocket.

### Como obter uma chave Deepgram

1. Acesse **https://console.deepgram.com/signup** (a inscrição dá US$ 200 de crédito grátis, o suficiente para ~330 horas de streaming com diarização).
2. Após criar a conta, vá em **API Keys → Create a New API Key**.
3. Em **Permissions**, escolha **Member** (ou superior). Importante — keys com menos permissão não funcionam para streaming.
4. Copie a chave e **guarde antes de fechar a janela** — não dá para ver de novo depois.

### Como ativar no CPWhat's up

1. Abra o app.
2. Clique no ⚙️ no canto superior direito para abrir as Configurações.
3. No campo **"Diarização automática · identifica vozes"**:
   - Ative o toggle
   - Cole sua chave no campo
   - O status à esquerda passa de **DESATIVADA** para **ATIVADA**
4. Pronto. Comece a gravar normalmente. O app identifica vozes automaticamente em vez de usar o seletor manual.

### Como usar na prática

- Com o celular no centro da mesa em reunião presencial, clique em **Iniciar Transcrição**.
- Conforme as pessoas falam, entradas aparecem marcadas como **Falante 1**, **Falante 2**, etc., com um selo `AUTO` ao lado.
- **Clique no nome do falante** (ele fica sublinhado ao passar o mouse) para renomeá-lo — ex: de "Falante 2" para "Marina". A renomeação se propaga para **todas** as falas daquela voz, passadas e futuras.
- O resumo IA também usa esses nomes, então vale renomear antes de gerar o resumo.

### Dicas para melhor acurácia

- **Celular no centro da mesa**, microfone desobstruído, pessoas a ≤ 1,5 m dele.
- **Evite eco** — salas com piso/teto reverberantes atrapalham. Um tapete ou cortina já ajuda muito.
- **Fale um de cada vez**. Sobreposição de vozes confunde a diarização (a Deepgram tenta, mas acerto cai).
- **Não use o modo "🖥️ + Sala"** em presencial — ele é para áudio de call do PC, não faz sentido aqui.

### Custo estimado (por você, não pelos usuários do CPWhat's up)

- **Streaming + diarização Deepgram Nova-2**: ~US$ 0,008/min (transcrição) + US$ 0,0015/min (diarização) ≈ **US$ 0,01/min**.
- Reunião de 1h: ~**US$ 0,60**.
- Crédito inicial de US$ 200 = ~330 horas de diarização.
- Defina **limite de gasto** em https://console.deepgram.com/ (Billing) para evitar surpresas.

### Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Toggle diz "FALTA CHAVE" | Campo vazio | Cole a chave |
| "Falha de conexão — verifique sua chave" | Chave inválida ou sem permissão Member | Gere uma nova no console Deepgram |
| "Timeout ao conectar (10s)" | Firewall corporativo bloqueia wss:// | Teste fora da rede corporativa |
| Tudo fica como **Falante 1** | Só uma pessoa falando perto, ou microfone não pega as outras | Aproxime o celular das pessoas; fale um por vez |
| "Conexão com Deepgram caiu" no meio | Rede instável ou idle > 30 s sem áudio | Pare e reinicie. Se recorrente, abra DevTools → Network → WS para inspecionar |
| Quero desativar temporariamente | Toggle OFF nas Configurações | Volta para Web Speech API + seletor manual |

### Segurança — o modelo BYO-key

**O que ele resolve:**
- Só você gasta seus créditos Deepgram. Usuários aleatórios da sua página não drenam sua conta.
- A chave não sai do seu navegador — não passa por nenhum servidor intermediário.

**Limitações honestas:**
- Quem tiver acesso ao seu navegador e abrir o DevTools consegue ver a chave no `localStorage` ou no handshake do WebSocket. Não deixe seu navegador desbloqueado.
- Se você publicar o app e cada cliente seu precisar de diarização, cada um precisa da própria chave Deepgram. Para uso em consultoria multi-cliente, a evolução natural é mover para um fluxo de token temporário (endpoint `/auth/grant` da Deepgram, servido pelo seu Worker com uma chave central). Me avise quando quiser esse upgrade.

### Limitações funcionais que você vai encontrar

- **Sobreposição de vozes**: duas pessoas falando ao mesmo tempo são, no melhor caso, marcadas como falantes diferentes em palavras alternadas. Não espere mágica.
- **Vozes similares**: irmãos com timbre parecido tendem a ser confundidos.
- **Pausas longas**: se alguém ficar calado 30+ min e voltar, a Deepgram pode atribuir um novo ID (ex: "Falante 5" em vez do "Falante 1" anterior). Basta renomear.
- **Línguas mistas**: o modelo vai no idioma selecionado no dropdown "Idioma de Captura". Reunião que alterna pt/en fica só em um.

---

## Arquitetura final

```
┌─────────────────┐
│   Navegador     │
│  (index.html)   │
└────┬────────┬───┘
     │        │
     │        │ Para Resumo IA:
     │        └────────► Cloudflare Worker ────► api.anthropic.com
     │                      (guarda chave Anthropic)
     │
     │ Para Diarização:
     └─────────────────────────────────► wss://api.deepgram.com/v1/listen
                                          (chave do usuário, BYO)
```

Tudo em uma página estática. Nada de backend próprio, nada de banco. Alinhado com a identidade "grátis direto no navegador" — só quem quer o premium paga o próprio uso.
