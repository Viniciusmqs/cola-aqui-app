// Testes das regras de exibição do PRD. Rodar: npm test (Node 22+, sem dependências).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  agoraBrasilia,
  dataEvento,
  distancia,
  idade,
  mascaraData,
  mensagemDeErro,
  parseDataBR,
  parseDataHoraBR,
  rotuloPublicacao,
  situacaoHorario,
  tempoDesde,
} from '../src/lib/format.ts';

const MIN = 60_000;
// sexta-feira, 23/10/2026, 21:00 em Brasília = 24:00 UTC
const SEXTA_21H = Date.UTC(2026, 9, 24, 0, 0);

test('rótulo de publicação: tempo + origem, nunca "ao vivo" (PRD 5.1)', () => {
  const t = new Date(SEXTA_21H - 8 * MIN).toISOString();
  assert.equal(tempoDesde(t, SEXTA_21H), 'há 8 min');
  assert.equal(
    rotuloPublicacao(new Date(Date.now() - 8 * MIN).toISOString(), 'user'),
    'Publicado há 8 min · Usuário',
  );
  assert.match(rotuloPublicacao(new Date().toISOString(), 'establishment'), /Estabelecimento$/);
  assert.doesNotMatch(rotuloPublicacao(new Date().toISOString(), 'creator'), /ao vivo/i);
});

test('tempoDesde: faixas de minutos, horas e dias', () => {
  const at = (ms) => new Date(SEXTA_21H - ms).toISOString();
  assert.equal(tempoDesde(at(20_000), SEXTA_21H), 'há menos de 1 min');
  assert.equal(tempoDesde(at(59 * MIN), SEXTA_21H), 'há 59 min');
  assert.equal(tempoDesde(at(61 * MIN), SEXTA_21H), 'há 1 h');
  assert.equal(tempoDesde(at(25 * 60 * MIN), SEXTA_21H), 'há 1 dia');
  assert.equal(tempoDesde(at(72 * 60 * MIN), SEXTA_21H), 'há 3 dias');
  // relógio adiantado no aparelho não gera tempo negativo
  assert.equal(tempoDesde(new Date(SEXTA_21H + 5 * MIN).toISOString(), SEXTA_21H), 'há menos de 1 min');
});

test('distância legível', () => {
  assert.equal(distancia(3), '10 m');
  assert.equal(distancia(456), '460 m');
  assert.equal(distancia(1530), '1,5 km');
  assert.equal(distancia(12400), '12 km');
});

test('agoraBrasilia usa UTC−3 independente do fuso do aparelho', () => {
  assert.deepEqual(agoraBrasilia(SEXTA_21H), { weekday: 5, min: 21 * 60 });
});

test('aberto agora pelo horário informado', () => {
  const todos = (opens, closes) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));
  assert.equal(situacaoHorario([], SEXTA_21H), null);
  assert.deepEqual(situacaoHorario(todos('19:00', '01:00'), SEXTA_21H), {
    aberto: true,
    texto: 'Aberto agora · fecha às 01:00',
  });
  assert.deepEqual(situacaoHorario(todos('07:00', '19:00'), SEXTA_21H), { aberto: false, texto: 'Fechado agora' });
  assert.deepEqual(situacaoHorario(todos('23:00', '05:00'), SEXTA_21H), {
    aberto: false,
    texto: 'Fechado agora · abre às 23:00',
  });
});

test('horário que vira a noite continua aberto na madrugada seguinte', () => {
  const sexta = [{ weekday: 5, opens: '23:00', closes: '05:00' }];
  const sabado3h = SEXTA_21H + 6 * 60 * MIN; // sábado 03:00
  assert.equal(situacaoHorario(sexta, sabado3h).aberto, true);
  const sabado6h = SEXTA_21H + 9 * 60 * MIN;
  assert.equal(situacaoHorario(sexta, sabado6h).aberto, false);
});

test('fechamento à meia-noite (00:00) conta como virada', () => {
  const h = [{ weekday: 5, opens: '16:00', closes: '00:00' }];
  assert.equal(situacaoHorario(h, SEXTA_21H).aberto, true);
});

test('idade e 18+ (PRD 5.5)', () => {
  const hoje = new Date(2026, 9, 23);
  assert.equal(idade('2008-10-23', hoje), 18);
  assert.equal(idade('2008-10-24', hoje), 17);
});

test('datas digitadas em português', () => {
  assert.equal(parseDataBR('10/03/1998'), '1998-03-10');
  assert.equal(parseDataBR('31/02/2000'), null);
  assert.equal(parseDataHoraBR('23/10/2026 20:30'), '2026-10-23T20:30:00-03:00');
  assert.equal(parseDataHoraBR('23/10/2026 25:00'), null);
  assert.equal(mascaraData('10031998'), '10/03/1998');
});

test('erros do servidor viram mensagens claras', () => {
  assert.equal(mensagemDeErro(new Error('Invalid login credentials')), 'E-mail ou senha incorretos.');
  assert.equal(mensagemDeErro({ message: 'TypeError: Network request failed' }), 'Sem conexão. Confere a internet e tenta de novo.');
});

test('data de evento no horário de Brasília', () => {
  // agora: sexta 23/10 21:00 BRT
  assert.equal(dataEvento('2026-10-23T23:30:00-03:00', SEXTA_21H), 'Hoje · 23:30');
  // 01:00 BRT de sábado = 04:00 UTC: é "Amanhã", mesmo com o aparelho em UTC
  assert.equal(dataEvento('2026-10-24T01:00:00-03:00', SEXTA_21H), 'Amanhã · 01:00');
  assert.equal(dataEvento('2026-10-25T21:00:00-03:00', SEXTA_21H), 'Domingo, 25/10 · 21:00');
});

test('rótulo usa o "agora" informado (relógio do servidor)', () => {
  const enviado = new Date(SEXTA_21H - 12 * MIN).toISOString();
  assert.equal(rotuloPublicacao(enviado, 'user', SEXTA_21H), 'Publicado há 12 min · Usuário');
});

test('erros do código de confirmação em português', () => {
  assert.match(mensagemDeErro(new Error('Token has expired or is invalid')), /Código errado ou vencido/);
  assert.equal(
    mensagemDeErro(new Error('For security purposes, you can only request this after 42 seconds.')),
    'Espere 42 segundos para pedir outro código.',
  );
  assert.match(mensagemDeErro(new Error('email rate limit exceeded')), /Muitos e-mails/);
  assert.match(mensagemDeErro(new Error('Email not confirmed')), /receber o código/);
});
