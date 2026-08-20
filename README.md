# Relleno Shifts

Relleno Shifts e uma aplicacao web para gerir escalas de trabalho de forma simples, visual e rapida. A ferramenta ajuda uma loja ou equipa operacional a transformar disponibilidade, cargos, limites de horas e regras de funcionamento numa escala semanal pronta a usar.

Em vez de montar horarios manualmente em folhas soltas, o Relleno Shifts centraliza a equipa, calcula sugestoes de turnos e permite ajustar a escala depois de gerada.

## Conteudo

- [O Que Resolve](#o-que-resolve)
- [Funcionalidades](#funcionalidades)
- [Como Funciona](#como-funciona)
- [Acesso](#acesso)
- [Tecnologias](#tecnologias)
- [Desenvolvimento](#desenvolvimento)
- [Scripts](#scripts)
- [Deploy](#deploy)
- [Variaveis de Ambiente](#variaveis-de-ambiente)
- [API](#api)
- [Base de Dados](#base-de-dados)

## O Que Resolve

- Reduz o tempo gasto a montar escalas semanais.
- Evita colocar colaboradores fora da sua disponibilidade.
- Ajuda a equilibrar horas entre a equipa.
- Mostra rapidamente onde faltam pessoas por turno.
- Permite adaptar a escala ao volume previsto de vendas.
- Funciona bem em desktop e mobile.

## Funcionalidades

- Gestao de colaboradores com nome, cargos e limite de horas semanais.
- Suporte para mais de um cargo por colaborador, como `Cozinha`, `Caixa` e `Sala`.
- Disponibilidade semanal por dia e por turno.
- Horarios especificos de disponibilidade, incluindo varios intervalos no mesmo dia.
- Geracao automatica da melhor escala possivel com base nas regras definidas.
- Edicao manual dos horarios depois da escala ser gerada.
- Regras de loja configuraveis, incluindo abertura, fecho e numero de pessoas por turno.
- Historico e previsao de vendas por dia.
- Dashboard com cobertura, equipa ativa, vagas por preencher e horas por cargo.
- Interface responsiva para consulta e ajustes no telemovel.

## Como Funciona

1. A gestao adiciona os colaboradores e define cargos, horas maximas e disponibilidade.
2. A loja configura as regras de operacao, como horario de abertura, fecho e necessidade por turno.
3. O sistema cruza disponibilidade, limites de horas e necessidades da semana.
4. A escala sugerida e gerada automaticamente.
5. A gestao pode editar entradas e saidas diretamente na escala.

## Acesso

A versao atual usa um login administrativo simples:

```text
Email: admin@relleno.pt
Password: admin123
```

Os colaboradores e historico de vendas ficam guardados no Supabase atraves das funcoes `/api`. Assim, qualquer dispositivo que entre com o administrador ve a mesma equipa, o mesmo historico e a mesma base operacional.

## Tecnologias

- HTML, CSS e JavaScript sem framework frontend.
- Vercel para hosting e funcoes serverless em `/api`.
- Supabase como base de dados remota para colaboradores e historico de vendas.
- Lucide Icons para iconografia da interface.

## Desenvolvimento

Requisitos:

- Node.js 22 ou superior.
- npm.

Instale as dependencias:

```bash
npm install
```

Valide a sintaxe:

```bash
npm run check
```

Execute em desenvolvimento:

```bash
npm run dev
```

Por padrao, `vercel dev` abre a aplicacao localmente e serve tambem as funcoes em `/api`.

## Scripts

| Comando | Descricao |
| --- | --- |
| `npm run dev` | Inicia o ambiente local com Vercel. |
| `npm run check` | Valida a sintaxe dos ficheiros JavaScript principais. |
| `npm run audit` | Executa auditoria de dependencias sem dependencias de desenvolvimento. |

## Deploy

O projeto esta configurado para Vercel.

```bash
npx vercel deploy --prod
```

No dashboard da Vercel, use:

- Framework preset: `Other`
- Build command: `echo 'No build needed'`
- Output directory: `./`

## Variaveis de Ambiente

As funcoes API precisam de Supabase configurado no ambiente da Vercel:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=admin@relleno.pt
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=change-this-long-random-secret
ADMIN_OWNER_ID=00000000-0000-0000-0000-000000000001
```

`SUPABASE_SERVICE_ROLE_KEY` deve existir apenas no servidor/Vercel. Nunca coloque essa chave no browser. Tambem pode usar `SUPABASE_SECRET_KEY` em vez de `SUPABASE_SERVICE_ROLE_KEY` se o projeto ja estiver nas chaves novas da Supabase.

Na primeira entrada depois de uma versao antiga, a app tenta migrar automaticamente colaboradores e historico que ainda existam no `localStorage` do browser para a base remota.

## API

As funcoes serverless ficam em `/api`:

| Endpoint | Uso |
| --- | --- |
| `/api/auth` | Login administrativo. |
| `/api/employees` | Leitura e escrita de colaboradores. |
| `/api/sales` | Leitura e escrita de historico/previsao de vendas. |

O front-end nao grava colaboradores nem vendas diretamente no browser. O `localStorage` e usado apenas para migrar dados legados criados antes da persistencia remota.

## Base de Dados

Para uma base Supabase nova, aplique `schema.sql`.

Para uma base ja existente com politicas antigas, aplique `supabase-security-migration.sql` no SQL Editor da Supabase.

## Nota de Produto

O objetivo do Relleno Shifts e ser uma ferramenta operacional: abrir, ajustar e decidir rapido. A interface privilegia leitura clara, controlo manual quando necessario e uma escala semanal que a equipa consegue entender sem explicacao adicional.
