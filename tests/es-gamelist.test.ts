import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esCoreFor, esPopularity, esReleaseYear, esSpreadKey, parseGamelist } from '../src/es-gamelist.ts';
import { platformLabel } from '../src/game-platform-label.ts';

const read = (p: string) => readFileSync(new URL(`./fixtures/es-sample/${p}`, import.meta.url), 'utf8');

test('parses the ES-DE sample gamelist', () => {
  const games = parseGamelist(read('gamelists/snes/gamelist.xml'));
  assert.equal(games.length, 7);
  const zelda = games.find((g) => g.name.startsWith('The Legend of Zelda'))!;
  assert.equal(zelda.rating, 0.97);
  assert.equal(zelda.playcount, 60);
  assert.equal(zelda.releaseYear, 1991);
  assert.equal(zelda.genre, 'Action-Adventure');
  assert.equal(zelda.path, './The_Legend_of_Zelda_A_Link_to_the_Past.sfc');
});

test('decodes entities and keeps art paths', () => {
  const sf = parseGamelist(read('gamelists/snes/gamelist.xml')).find((g) => g.name.startsWith('Street Fighter'))!;
  assert.equal(sf.name, 'Street Fighter II & Turbo');
  const ff = parseGamelist(read('roms/psx/gamelist.xml'))[0];
  assert.equal(ff.thumbnail, './media/images/Final_Fantasy_VII-box.png');
});

test('falls back to the file stem when a game has no name', () => {
  const [g] = parseGamelist('<gameList><game><path>./Bonk\'s Adventure.zip</path></game></gameList>');
  assert.equal(g.name, "Bonk's Adventure");
});

test('skips entries without a path and tolerates empty files', () => {
  assert.equal(parseGamelist('<gameList><game><name>x</name></game></gameList>').length, 0);
  assert.equal(parseGamelist('').length, 0);
});

test('popularity: rating beats play count, play count beats nothing', () => {
  assert.equal(esPopularity({ name: 'a', path: 'a', rating: 0.9 }), 9);
  assert.equal(esPopularity({ name: 'a', path: 'a', playcount: 4 }), 2);
  assert.equal(esPopularity({ name: 'a', path: 'a', playcount: 400 }), 5);
  assert.equal(esPopularity({ name: 'a', path: 'a' }), undefined);
});

test('spread key is stable and varies', () => {
  assert.equal(esSpreadKey('Chrono Trigger'), esSpreadKey('Chrono Trigger'));
  assert.notEqual(esSpreadKey('Chrono Trigger'), esSpreadKey('F-Zero'));
});

test('release dates', () => {
  assert.equal(esReleaseYear('19950311T000000'), 1995);
  assert.equal(esReleaseYear('1998'), 1998);
  assert.equal(esReleaseYear('garbage'), undefined);
});

test('ES system folders land on store signboards', () => {
  const l = (s: string) => platformLabel(s, s);
  assert.equal(l('snes'), 'SNES');
  assert.equal(l('sfc'), 'SUPER FAMICOM');
  assert.equal(l('megadrive'), 'GENESIS');
  assert.equal(l('psx'), 'PLAYSTATION');
  assert.equal(l('gba'), 'GAME BOY ADVANCE');
  assert.equal(l('tg16'), 'TURBOGRAFX-16');
  assert.equal(l('fbneo'), 'ARCADE');
});

test('browser player cores follow the ES system folder name', () => {
  assert.equal(esCoreFor('snes'), 'snes');
  assert.equal(esCoreFor('MegaDrive'), 'segaMD');
  assert.equal(esCoreFor('gbc'), 'gb');
  assert.equal(esCoreFor('dreamcast'), undefined);
});
