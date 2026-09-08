/**
 * Sincroniza o repositório-TEMPLATE com este projeto, aqui na sua máquina.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARA QUE SERVE, JÁ QUE EXISTE O ROBÔ DO GITHUB
 *
 * O workflow `.github/workflows/sincronizar-template.yml` faz isso sozinho a
 * cada push — mas depende de um token configurado. Este script faz o mesmo
 * trabalho na sua máquina, sem token nenhum, e serve para dois momentos:
 *
 *   • agora, para acertar o atraso acumulado (o template do GT3 estava parado em
 *     21/07/2026 enquanto o projeto seguia até 04/09 — um mês e meio de trabalho
 *     que nunca chegou a quem clonou);
 *   • sempre que você quiser conferir o que iria ANTES de mandar, com
 *     `--simular`, que não escreve nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO USAR
 *
 *   node scripts/sincronizar-template-local.mjs --simular   ← só mostra
 *   node scripts/sincronizar-template-local.mjs             ← copia e faz commit
 *   node scripts/sincronizar-template-local.mjs --enviar    ← copia, commita e dá push
 *
 * A lista do que NÃO vai para o cliente é o `.templateignore` da raiz.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/* ── Onde ficam os dois repositórios ─────────────────────────────────────── */

const ORIGEM = resolve(process.cwd())
// O template é irmão deste projeto, dentro de `clones/`. Se um dia mudar de
// lugar, é esta linha (e só ela) que precisa mudar.
const TEMPLATE = resolve(ORIGEM, '..', 'clones', 'omnx-gt3-clone')

const simular = process.argv.includes('--simular')
const enviar = process.argv.includes('--enviar')

/* ── A lista do que fica de fora ─────────────────────────────────────────── */

function lerLista(nome, obrigatoria) {
  const caminho = join(ORIGEM, nome)
  if (!existsSync(caminho)) {
    if (!obrigatoria) return []
    console.error(`Falta o ${nome} na raiz. Sem ele, TUDO iria para o cliente — parei aqui.`)
    process.exit(1)
  }
  return readFileSync(caminho, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/*
 * DUAS listas, com papéis OPOSTOS — e a diferença não é firula.
 *
 * A primeira versão tinha só o `.templateignore` e tratava "está na lista" como
 * "preserve no template". A simulação mostrou o estrago: os 252 arquivos
 * internos que JÁ tinham vazado para o template (`.claude/`, `docs/`, `plans/`)
 * ficariam lá para sempre, quando o certo era justamente limpá-los.
 *
 *   .templateignore → não copiar. Se já estiver no template, APAGAR.
 *   .templatekeep   → é do template (um README escrito para o cliente). Não tocar.
 *
 * As duas situações se parecem de fora — um arquivo que existe de um lado e não
 * do outro — e pedem exatamente o contrário uma da outra.
 */
const regras = lerLista('.templateignore', true)
const regrasProtegidas = lerLista('.templatekeep', false)

/** Casa o caminho com uma lista de regras? Devolve a regra que casou. */
function casa(caminho, lista) {
  for (const regra of lista) {
    const alvo = regra.replace(/\/$/, '')
    // Pasta: barra tudo que estiver dentro dela.
    if (regra.endsWith('/') && (caminho === alvo || caminho.startsWith(alvo + '/'))) return regra
    // Curinga (*.log, timestamp-*): vale para o caminho todo e para o nome solto.
    if (regra.includes('*')) {
      const expr = new RegExp('^' + alvo.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      if (expr.test(caminho) || expr.test(caminho.split('/').pop())) return regra
    }
    // Nome exato, na raiz ou em qualquer nível.
    if (caminho === alvo || caminho.split('/').pop() === alvo) return regra
  }
  return null
}

/** Este arquivo fica só no repositório de desenvolvimento (não vai ao cliente)? */
const ficaDeFora = (caminho) => casa(caminho, regras)

/** Este arquivo é do template e não deve ser tocado pela sincronização? */
const eDoTemplate = (caminho) => casa(caminho, regrasProtegidas)

/* ── O que existe de cada lado ───────────────────────────────────────────── */

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// `git ls-files` em vez de varrer o disco: pega só o que é versionado, então
// node_modules, dist e afins ficam de fora sem precisar de regra para isso.
const daOrigem = git(ORIGEM, 'ls-files').split('\n').filter(Boolean)
const doTemplate = git(TEMPLATE, 'ls-files').split('\n').filter(Boolean)

const vaoPara = []
const barrados = new Map()
for (const arquivo of daOrigem) {
  const regra = ficaDeFora(arquivo)
  if (regra) barrados.set(regra, (barrados.get(regra) ?? 0) + 1)
  else vaoPara.push(arquivo)
}

// Tudo que está no template e não vem da origem sai — inclusive (e
// principalmente) o que vazou em cópias antigas. A ÚNICA exceção é o que o
// `.templatekeep` protege, que é o material escrito para o cliente.
const conjunto = new Set(vaoPara)
const paraApagar = doTemplate.filter((a) => !conjunto.has(a) && !eDoTemplate(a))
const preservados = doTemplate.filter((a) => !conjunto.has(a) && eDoTemplate(a))

/* ── Contar a história antes de mexer ────────────────────────────────────── */

console.log(`\nORIGEM ..: ${ORIGEM}`)
console.log(`TEMPLATE : ${TEMPLATE}\n`)
console.log(`Vão para o cliente ........ ${vaoPara.length} arquivos`)
console.log(`Ficam só no seu repo ...... ${daOrigem.length - vaoPara.length} arquivos`)
if (barrados.size) {
  for (const [regra, quantos] of [...barrados].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${regra.padEnd(30)} ${String(quantos).padStart(4)}`)
  }
}
console.log(`\nSerão APAGADOS do template . ${paraApagar.length} arquivos`)
for (const a of paraApagar.slice(0, 12)) console.log(`   - ${a}`)
if (paraApagar.length > 12) console.log(`   ... e mais ${paraApagar.length - 12}`)
if (preservados.length) {
  console.log(`\nPreservados no template (protegidos pela lista): ${preservados.length}`)
  for (const a of preservados.slice(0, 8)) console.log(`   = ${a}`)
}

// A clonagem lê este arquivo de dentro do template para montar o banco do
// cliente. Sem ele, a clonagem quebra no meio do processo DELE.
if (!conjunto.has('supabase/SETUP_COMPLETE.sql')) {
  console.error('\n✗ supabase/SETUP_COMPLETE.sql NÃO está indo. A clonagem quebraria. Parei.')
  process.exit(1)
}
console.log('\n✓ supabase/SETUP_COMPLETE.sql confirmado no que vai.')

if (simular) {
  console.log('\n(--simular: nada foi alterado)')
  process.exit(0)
}

/* ── Copiar ──────────────────────────────────────────────────────────────── */

for (const arquivo of paraApagar) rmSync(join(TEMPLATE, arquivo), { force: true })

for (const arquivo of vaoPara) {
  const destino = join(TEMPLATE, arquivo)
  mkdirSync(dirname(destino), { recursive: true })
  cpSync(join(ORIGEM, arquivo), destino)
}

/*
 * ARQUIVOS QUE PRECISAM SER DIFERENTES NO TEMPLATE
 *
 * Um `algo.template.ts` aqui vira o `algo.ts` de lá. Existe por um caso concreto
 * e perigoso: o `src/integrations/supabase/config.ts` traz embutidos o endereço e
 * a chave do banco de produção da OMNX — e PRECISA trazer, porque a produção do
 * gt3.omnx.pro roda na Vercel sem variáveis de ambiente cadastradas; tirar de lá
 * derruba o site.
 *
 * Mas o mesmo arquivo ia para o template. O cliente clonava, esquecia de
 * preencher o `.env`, e o app DELE conectava no NOSSO banco de produção. Nada
 * quebrava: ele criava conta, usava, e os dados entravam na nossa base.
 *
 * Não dava para resolver com a lista de exclusão (o app precisa do arquivo) nem
 * mexendo no original (a produção cairia). Daí a substituição: cada lado fica
 * com a versão que faz sentido para ele.
 */
const substitutos = vaoPara.filter((a) => /\.template\.[a-z]+$/i.test(a))
for (const substituto of substitutos) {
  const alvo = substituto.replace(/\.template(\.[a-z]+)$/i, '$1')
  const destino = join(TEMPLATE, alvo)
  if (!existsSync(join(ORIGEM, alvo))) {
    console.warn(`   aviso: ${substituto} não tem um ${alvo} correspondente — ignorado`)
    continue
  }
  mkdirSync(dirname(destino), { recursive: true })
  cpSync(join(ORIGEM, substituto), destino)
  // O próprio `.template` não fica no destino: ele é a receita, não o prato.
  rmSync(join(TEMPLATE, substituto), { force: true })

  // Se o arquivo de verdade ganhar uma função exportada nova e o substituto não
  // acompanhar, o app do cliente quebra na compilação — e a falha apareceria só
  // quando ELE fosse rodar. Comparar aqui é barato e evita isso.
  const listaDeExports = (texto) =>
    [...texto.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map((m) => m[1]).sort().join(',')
  const noOriginal = listaDeExports(readFileSync(join(ORIGEM, alvo), 'utf8'))
  const noSubstituto = listaDeExports(readFileSync(join(ORIGEM, substituto), 'utf8'))
  if (noOriginal !== noSubstituto) {
    console.warn(
      `\n   ⚠️  ${alvo} e ${substituto} exportam coisas diferentes:\n` +
        `      original .: ${noOriginal}\n` +
        `      substituto: ${noSubstituto}\n` +
        `      O app do cliente pode não compilar. Acerte o substituto.\n`,
    )
  } else {
    console.log(`   substituído no template: ${alvo} (veio de ${substituto})`)
  }
}

console.log(`\nCopiados ${vaoPara.length} arquivos, apagados ${paraApagar.length}.`)

/* ── Registrar ───────────────────────────────────────────────────────────── */

const commitDaOrigem = git(ORIGEM, 'rev-parse', '--short', 'HEAD').trim()
const assuntoDaOrigem = git(ORIGEM, 'log', '-1', '--format=%s').trim()

git(TEMPLATE, 'add', '-A')
const pendente = git(TEMPLATE, 'status', '--porcelain').trim()
if (!pendente) {
  console.log('Nada mudou — o template já estava igual.')
  process.exit(0)
}

git(
  TEMPLATE,
  'commit',
  '-m',
  `sync: ${assuntoDaOrigem}\n\nEspelhado de omnx-gt3@${commitDaOrigem}, respeitando o .templateignore.`,
)
console.log('Commit feito no template.')

if (enviar) {
  git(TEMPLATE, 'push')
  console.log('Enviado para o GitHub. Quem clonar a partir de agora recebe esta versão.')
} else {
  console.log('\nNÃO enviei ainda. Confira com:')
  console.log(`   git -C "${TEMPLATE}" show --stat`)
  console.log('e depois rode de novo com --enviar (ou dê o push você mesmo).')
}
