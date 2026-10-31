import {
  buyTech,
  campaignEnding,
  isCampaignWon,
  isRegionAvailable,
  planetControl,
  startBonus,
  TECHS,
  type Campaign,
} from '../campaign/campaign';
import { REGIONS, regionById, type RegionDef } from '../data/regions';
import { RESOURCES } from '../data/resources';
import { ADVISORS } from '../data/story';
import { RESOURCE_IDS } from '../sim/types';
import { clear, h } from './dom';

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

export interface PlanetCallbacks {
  onStart(regionId: string): void;
  onCampaignChange(campaign: Campaign): void;
  onResume?(): void;
  onNewCampaign(): void;
}

/** The strategic layer: pick the next region, spend research, reread the investigation. */
export class PlanetScreen {
  private readonly root = h('div', { class: 'planet-screen' });
  private selected: string;

  constructor(
    host: HTMLElement,
    private campaign: Campaign,
    private readonly callbacks: PlanetCallbacks,
    private readonly resumeRegion: string | null,
  ) {
    host.append(this.root);
    const next = REGIONS.find((r) => isRegionAvailable(campaign, r.id));
    this.selected = resumeRegion ?? next?.id ?? REGIONS[REGIONS.length - 1].id;
    this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private render(): void {
    clear(this.root);
    const c = this.campaign;
    const control = planetControl(c);
    this.root.append(
      h(
        'header',
        { class: 'planet-head' },
        h('h1', {}, 'Kerath'),
        h(
          'div',
          { class: 'control' },
          h('span', {}, `Planète sous contrôle : ${control} %`),
          h('div', { class: 'bar big' }, h('i', { style: `width:${control}%` })),
        ),
        h('div', { class: 'research' }, `🔬 ${c.research} points de recherche`),
      ),
      h(
        'div',
        { class: 'planet-layout' },
        h('div', { class: 'globe' }, this.renderGlobe()),
        h(
          'div',
          { class: 'planet-side' },
          isCampaignWon(c) ? this.renderEnding() : this.renderRegion(regionById(this.selected)),
        ),
        h('div', { class: 'planet-side' }, this.renderTechs(), this.renderDossier()),
      ),
    );
  }

  private renderGlobe(): SVGElement {
    const c = this.campaign;
    const root = svg('svg', {
      viewBox: '0 0 100 100',
      class: 'globe-svg',
      role: 'img',
      'aria-label': 'Carte de la planète Kerath',
    });
    const defs = svg(
      'defs',
      {},
      svg(
        'radialGradient',
        { id: 'planetFill', cx: '38%', cy: '32%', r: '75%' },
        svg('stop', { offset: '0%', 'stop-color': '#7a5338' }),
        svg('stop', { offset: '55%', 'stop-color': '#3f2a22' }),
        svg('stop', { offset: '100%', 'stop-color': '#120c10' }),
      ),
    );
    root.append(
      defs,
      svg('circle', {
        cx: 50,
        cy: 46,
        r: 45,
        fill: 'url(#planetFill)',
        stroke: '#35e0c233',
        'stroke-width': 0.6,
      }),
    );
    for (const [x, y, rx, ry] of [
      [32, 30, 9, 3],
      [66, 22, 7, 2.5],
      [24, 60, 6, 2],
      [70, 66, 10, 3],
      [48, 56, 8, 2.2],
    ]) {
      root.append(svg('ellipse', { cx: x, cy: y, rx, ry, fill: '#00000033' }));
    }
    for (const region of REGIONS) {
      for (const parent of region.requires) {
        const p = regionById(parent);
        const live = c.conquered.includes(parent);
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
      const conquered = c.conquered.includes(region.id);
      const available = isRegionAvailable(c, region.id);
      const fill = conquered ? '#35e0c2' : available ? '#ffb347' : '#403a44';
      const node = svg(
        'g',
        { class: 'node', tabindex: 0, role: 'button', 'aria-label': region.name },
        ...(region.id === this.selected
          ? [
              svg('circle', {
                cx: region.planet.x,
                cy: region.planet.y,
                r: 6,
                fill: 'none',
                stroke: '#fff',
                'stroke-width': 0.5,
              }),
            ]
          : []),
        svg('circle', {
          cx: region.planet.x,
          cy: region.planet.y,
          r: 4 + region.control / 8,
          fill,
          opacity: conquered || available ? 0.95 : 0.7,
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
      node.addEventListener('click', () => {
        this.selected = region.id;
        this.render();
      });
      root.append(node);
    }
    return root;
  }

  private renderRegion(region: RegionDef): HTMLElement {
    const c = this.campaign;
    const conquered = c.conquered.includes(region.id);
    const available = isRegionAvailable(c, region.id);
    const bonus = startBonus(c);
    const bonusText = RESOURCE_IDS.filter((r) => bonus[r])
      .map((r) => `+${bonus[r]} ${RESOURCES[r].name}`)
      .join(', ');
    return h(
      'section',
      { class: 'panel' },
      h('h2', {}, region.name),
      h('p', { class: 'faction' }, region.faction),
      h('p', {}, region.blurb),
      h('h3', {}, 'En conquérant cette région'),
      h('p', {}, h('b', {}, region.perk.name), ' : ', region.perk.desc),
      h('p', { class: 'dim' }, `${region.control} % de la planète`),
      bonusText && h('p', { class: 'dim' }, `Bonus de départ : ${bonusText}`),
      conquered && h('p', { class: 'good-text' }, 'Région sous votre contrôle.'),
      this.resumeRegion === region.id &&
        h(
          'button',
          { class: 'cta', onclick: () => this.callbacks.onResume?.() },
          'Reprendre la mission',
        ),
      available &&
        h(
          'button',
          {
            class: this.resumeRegion === region.id ? 'chip' : 'cta',
            onclick: () => this.callbacks.onStart(region.id),
          },
          this.resumeRegion === region.id ? 'Recommencer depuis le début' : 'Lancer l’expédition',
        ),
      !available &&
        !conquered &&
        h(
          'p',
          { class: 'dim' },
          `Conquérez d’abord : ${region.requires.map((r) => regionById(r).name).join(' ou ')}.`,
        ),
    );
  }

  private renderEnding(): HTMLElement {
    const ending = campaignEnding(this.campaign);
    return h(
      'section',
      { class: 'panel ending' },
      h('h2', {}, ending.title),
      h('p', {}, ending.text),
      h(
        'p',
        { class: 'dim' },
        this.campaign.moleCaught
          ? `Le traître du conseil, ${ADVISORS[this.campaign.mole].name}, a répondu de ses actes.`
          : `Le traître du conseil n’a jamais été démasqué : c’était ${ADVISORS[this.campaign.mole].name}.`,
      ),
      h(
        'button',
        { class: 'cta', onclick: () => this.callbacks.onNewCampaign() },
        'Nouvelle campagne',
      ),
    );
  }

  private renderTechs(): HTMLElement {
    const c = this.campaign;
    return h(
      'section',
      { class: 'panel techs' },
      h('h3', {}, 'Recherche'),
      ...TECHS.map((tech) => {
        const owned = c.techs.includes(tech.id);
        const blocked = tech.requires && !c.techs.includes(tech.requires);
        return h(
          'button',
          {
            class: owned ? 'tech owned' : 'tech',
            disabled: owned || blocked || c.research < tech.cost,
            onclick: () => {
              const next = buyTech(c, tech.id);
              if (!next) return;
              this.campaign = next;
              this.callbacks.onCampaignChange(next);
              this.render();
            },
          },
          h('b', {}, tech.name),
          h('span', {}, tech.desc),
          h('em', {}, owned ? 'Acquis' : blocked ? 'Prérequis manquant' : `${tech.cost} 🔬`),
        );
      }),
    );
  }

  private renderDossier(): HTMLElement {
    const c = this.campaign;
    return h(
      'section',
      { class: 'panel' },
      h('h3', {}, 'Enquête en cours'),
      c.moleCaught
        ? h('p', { class: 'good-text' }, `${ADVISORS[c.mole].name} a été démasqué·e.`)
        : c.clues.length === 0
          ? h('p', { class: 'dim' }, 'Aucun indice pour le moment.')
          : h('ul', { class: 'clues' }, ...c.clues.map((clue) => h('li', {}, clue))),
    );
  }
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
      h('button', { class: 'cta', onclick: options.onContinue }, 'Continuer la campagne'),
    h(
      'button',
      { class: options.hasSave ? 'chip' : 'cta', onclick: options.onNew },
      'Nouvelle campagne',
    ),
  );
  host.append(root);
  return root;
}

export function renderOutcome(
  host: HTMLElement,
  options: { won: boolean; reason: string; research: number; control: number; onContinue(): void },
): HTMLElement {
  const root = h(
    'div',
    { class: 'title-screen outcome' },
    h('h1', {}, options.won ? 'Région conquise' : 'Expédition perdue'),
    h('p', { class: 'tagline' }, options.reason),
    h(
      'p',
      {},
      `Recherche acquise : ${options.research} · Planète sous contrôle : ${options.control} %`,
    ),
    !options.won && h('p', { class: 'dim' }, 'La recherche et les indices obtenus sont conservés.'),
    h('button', { class: 'cta', onclick: options.onContinue }, 'Retour à la planète'),
  );
  host.append(root);
  return root;
}
