import { ENDINGS, ADVISORS } from '../data/story';
import { REGIONS, regionById } from '../data/regions';
import { isOpen, planetControl } from '../sim/progress';
import type { GameState } from '../sim/types';
import { h } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(
  tag: string,
  attrs: Record<string, string | number>,
  ...children: (SVGElement | string)[]
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

/** The whole campaign at a glance: the sectors held, those being fought over, those still closed. */
export function renderPlanetMap(state: GameState): SVGElement {
  const root = svg('svg', {
    viewBox: '0 0 100 100',
    class: 'globe-svg',
    role: 'img',
    'aria-label': 'Carte de la planète Kerath',
  });
  root.append(
    svg(
      'defs',
      {},
      svg(
        'radialGradient',
        { id: 'planetFill', cx: '38%', cy: '32%', r: '75%' },
        svg('stop', { offset: '0%', 'stop-color': '#7a5338' }),
        svg('stop', { offset: '55%', 'stop-color': '#3f2a22' }),
        svg('stop', { offset: '100%', 'stop-color': '#120c10' }),
      ),
    ),
    svg('circle', {
      cx: 50,
      cy: 46,
      r: 45,
      fill: 'url(#planetFill)',
      stroke: '#35e0c233',
      'stroke-width': 0.6,
    }),
  );
  for (const region of REGIONS) {
    for (const parent of region.requires) {
      const p = regionById(parent);
      const live = state.conquered.includes(parent);
      root.append(
        svg('line', {
          x1: p.planet.x,
          y1: p.planet.y,
          x2: region.planet.x,
          y2: region.planet.y,
          stroke: live ? '#35e0c2' : '#ffffff22',
          'stroke-width': live ? 0.6 : 0.4,
          'stroke-dasharray': live ? '' : '1.2 1.2',
        }),
      );
    }
  }
  for (const region of REGIONS) {
    const held = state.conquered.includes(region.id);
    const open = isOpen(state, region);
    root.append(
      svg('circle', {
        cx: region.planet.x,
        cy: region.planet.y,
        r: 4 + region.control / 8,
        fill: held ? '#35e0c2' : open ? '#ffb347' : '#403a44',
        opacity: held || open ? 0.95 : 0.7,
      }),
      svg(
        'text',
        {
          x: region.planet.x,
          y: region.planet.y + 9.6,
          'text-anchor': 'middle',
          'font-size': 3,
          fill: '#efe9df',
        },
        region.name,
      ),
    );
  }
  return root;
}

/** The sectors in words, with what each one brings once it falls. */
export function renderSectorList(state: GameState): HTMLElement {
  return h(
    'div',
    { class: 'sector-list' },
    h('h3', {}, `Planète sous contrôle : ${planetControl(state)} %`),
    ...REGIONS.map((region) => {
      const held = state.conquered.includes(region.id);
      const open = isOpen(state, region);
      return h(
        'div',
        { class: held ? 'sector held' : open ? 'sector open' : 'sector' },
        h('b', {}, region.name),
        h(
          'span',
          { class: 'dim' },
          held ? 'Sous contrôle' : open ? 'Front ouvert' : 'Inaccessible',
        ),
        h('p', {}, region.blurb),
        h('p', { class: 'dim' }, `${region.perk.name} : ${region.perk.desc}`),
      );
    }),
  );
}

export function renderTitle(
  host: HTMLElement,
  options: { hasSave: boolean; onContinue(): void; onNew(): void },
): HTMLElement {
  const root = h(
    'div',
    { class: 'title-screen' },
    h('h1', {}, 'Foreurs de Kerath'),
    h(
      'p',
      { class: 'tagline' },
      'Forez la roche. Bâtissez la cité. Démasquez le traître. Prenez la planète.',
    ),
    options.hasSave &&
      h('button', { class: 'cta', onclick: options.onContinue }, 'Continuer la partie'),
    h(
      'button',
      { class: options.hasSave ? 'chip' : 'cta', onclick: options.onNew },
      'Nouvelle partie',
    ),
  );
  host.append(root);
  return root;
}

function ending(state: GameState) {
  if (state.story.flags.endingMercy) return ENDINGS.mercy;
  if (state.story.flags.pactBroken) return ENDINGS.treason;
  return ENDINGS.conquest;
}

/** The end of the game, one way or the other: there is only one city to lose. */
export function renderOutcome(
  host: HTMLElement,
  state: GameState,
  onContinue: () => void,
): HTMLElement {
  const won = state.outcome === 'won';
  const end = ending(state);
  const traitor = ADVISORS[state.story.mole].name;
  const root = h(
    'div',
    { class: 'title-screen outcome' },
    h('h1', {}, won ? end.title : 'La cité est tombée'),
    h('p', { class: 'tagline' }, won ? end.text : state.outcomeReason),
    h('p', {}, `Planète sous contrôle : ${planetControl(state)} %`),
    h(
      'p',
      { class: 'dim' },
      state.story.moleCaught
        ? `Le traître du conseil, ${traitor}, a répondu de ses actes.`
        : `Le traître du conseil n’a jamais été démasqué : c’était ${traitor}.`,
    ),
    h('button', { class: 'cta', onclick: onContinue }, 'Retour au menu'),
  );
  host.append(root);
  return root;
}
