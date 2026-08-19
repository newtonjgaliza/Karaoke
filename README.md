# 🎤 Karaoke do Attilas

Este é um sistema de fila de Karaokê feito sob medida, leve e projetado para rodar em rede local. Os clientes podem pedir músicas por seus próprios celulares ou tablets (sem precisar instalar nenhum aplicativo) e o administrador (Attilas) gerencia a fila e dá o play nas músicas no computador de forma ágil.

---

## 🛠️ Tecnologias Utilizadas
- **Backend**: Python 3 + Flask (leve e rápido)
- **Banco de Dados**: JSON local (com persistência automática) ou Memória (fallback automático para hospedagem Serverless como Vercel)
- **Frontend**: HTML5, Vanilla CSS3 (com visual escuro e neon premium) e JavaScript
- **Comunicação**: HTTP Polling automático (sincronização de 3s no painel)
- **Som**: Sintetizador Web Audio API (efeitos sonoros nativos no navegador do host)

---

## 🚀 Como Executar o Sistema

### 1. Iniciar o Servidor
Certifique-se de estar na pasta do projeto e com o ambiente virtual ativo, então execute:

```bash
# Se o ambiente virtual (venv) já estiver criado, basta executar:
./venv/bin/python app.py
```

O servidor começará a rodar e exibirá saídas como esta:
```text
 * Running on http://127.0.0.1:5000
 * Running on http://192.168.X.X:5000 (IP na sua rede local)
```

---

## 📱 Como Acessar e Usar

### A. Para o Público (Celulares/Tablets no Salão)
1. Conecte os celulares/tablets na **mesma rede Wi-Fi** do computador que está rodando o servidor.
2. Acesse o endereço do IP local exibido no terminal (ex: `http://192.168.X.X:5000`).
   > 💡 **Dica de Ouro**: Você pode colar esse endereço em um gerador de QR Code gratuito (como `qr-code-generator.com`), imprimir e colar nas mesas do karaokê. Os clientes só precisam escanear o código para abrir o formulário instantaneamente.
3. O cliente preenche o formulário:
   - **Nome** (ex. joao)
   - **Música** (ex: saint seiya)
   - **Referência** (ex: cavaleiros do zodiaco)
   - **Informações Extras** (ex: versão do anime)
4. Ao clicar em **Enviar Pedido**, a música vai direto para a fila.

### B. Para o Administrador (Painel do Attilas no PC)
1. No computador principal (conectado à TV ou Projetor), acesse: `http://127.0.0.1:5000/admin` ou `http://localhost:5000/admin`.
2. **Alertas Sonoros**: No painel lateral, há um interruptor para ativar/desativar alertas. Quando um cliente envia um pedido de música, o painel do Attilas toca um aviso sonoro (um chime agradável de sintetizador feito via Web Audio API) para que ele saiba que há um novo pedido mesmo se estiver em outra janela.
3. **Fluxo de Reprodução**:
   - Quando estiver pronto para a próxima música, clique no botão green **▶ Tocar** correspondente na tabela.
   - Isso fará duas coisas automaticamente:
     1. Mudará o status da música para **"Tocando"** (adicionando um marcador neon piscante).
     2. Abrirá uma **nova aba no navegador** com a busca do YouTube já configurada para o karaokê daquela música (ex: pesquisando por `"karaoke Pegasus Fantasy Cavaleiros do Zodíaco"`).
   - O Attilas só precisa escolher o vídeo preferido no YouTube, arrastar a aba para a tela do projetor/TV e dar o play!
4. **Gerenciamento**:
   - **Concluir (✓)**: Marca a música como cantada e move para o histórico.
   - **Cancelar (✕)**: Cancela o pedido se o cantor não estiver presente.
   - **Pesquisa**: A barra de pesquisa superior filtra a fila em tempo real caso precise encontrar alguém rapidamente.
   - **Limpar Histórico**: O botão na barra lateral limpa as músicas concluídas e canceladas para manter a tabela organizada.

---

## ☁️ Hospedagem no Vercel

O projeto foi configurado com suporte para implantação no **Vercel** usando o arquivo `vercel.json`.

### Como Funciona no Vercel (Serverless):
Como o Vercel utiliza servidores sem estado (*serverless*), gravar arquivos locais (`db.json`) não é viável (o sistema de arquivos do Vercel é somente leitura e os dados seriam apagados toda vez que a instância do servidor entrasse em repouso).

Para contornar isso, o código possui um **fallback automático para memória**:
1. Ao detectar o ambiente do Vercel, o Flask armazena a fila diretamente na memória RAM do processo.
2. **Atenção**:
   - Se o sistema ficar inativo por cerca de 10-15 minutos, o servidor entra em repouso e a fila de músicas é limpa.
   - Se houver múltiplos acessos simultâneos e o Vercel iniciar múltiplas instâncias da função serverless, as instâncias não compartilharão a mesma fila em memória.

### Como Hospedar de Forma Persistente na Nuvem:
Se desejar hospedar na nuvem permanentemente e evitar que a fila seja apagada:
- Recomendamos conectar o app a um banco de dados em nuvem gratuito (como **Supabase Postgres**, **Neon.tech**, ou **Upstash Redis**).
- No entanto, rodar o servidor **localmente** no bar (em um notebook conectado ao Wi-Fi local) continua sendo o método mais robusto e recomendado para eventos reais, pois garante latência zero e funciona mesmo se a internet do estabelecimento oscilar ou cair.
