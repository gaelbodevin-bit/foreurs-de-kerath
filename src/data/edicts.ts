import type { Cost, Modifiers } from '../sim/types';

export type EdictBranch = 'survival' | 'order' | 'faith';

export interface EdictDef {
  id: string;
  name: string;
  branch: EdictBranch;
  /** What it says, as the governor reads it before signing. */
  text: string;
  /** What it does, in plain numbers. */
  effect: string;
  requires?: string;
  /** Signing one closes the other for good. */
  excludes?: string;
  /** Lasting weight on morale. */
  morale?: number;
  /** The shock of the day it is posted. */
  shock?: number;
  conspiracy?: number;
  mods?: Partial<Modifiers>;
  stock?: Cost;
  /** What the galleries say about it afterwards. */
  reaction: string;
}

export const EDICT_BRANCHES: Record<EdictBranch, { name: string; desc: string }> = {
  survival: { name: 'Survie', desc: 'Ce qu’on mange, ce qu’on endure.' },
  order: { name: 'Ordre', desc: 'Qui surveille, qui juge.' },
  faith: { name: 'Croyance', desc: 'Ce qu’on raconte à ceux qui ont peur du noir.' },
};

/** Seconds between two signatures: a people can only take so much at a time. */
export const EDICT_COOLDOWN = 150;
/** What a citizen's body is worth, once `corpses` is signed. */
export const CORPSE_FOOD = 6;

export const EDICTS: EdictDef[] = [
  {
    id: 'soup',
    name: 'Soupe allongée',
    branch: 'survival',
    text: 'On coupe le bouillon à l’eau de fonte. Personne ne s’en réjouira, mais chacun aura sa louche.',
    effect: 'La colonie mange 20 % de moins. Moral −3.',
    excludes: 'fullplates',
    morale: -3,
    mods: { appetite: -0.2 },
    reaction: 'Dans les files, on appelle déjà ça « l’eau du gouverneur ».',
  },
  {
    id: 'fullplates',
    name: 'Assiette garantie',
    branch: 'survival',
    text: 'Quoi qu’il arrive, la cantine servira une vraie part. La Charte le promet, et vous avec elle.',
    effect: 'La colonie mange 10 % de plus. Moral +6.',
    excludes: 'soup',
    morale: 6,
    mods: { appetite: 0.1 },
    reaction: 'Une femme a embrassé l’affiche. Reste à tenir parole.',
  },
  {
    id: 'longshifts',
    name: 'Quarts de quatorze heures',
    branch: 'survival',
    text: 'Les machines ne dorment pas. Les équipes non plus, ou si peu.',
    effect: 'Production +20 %. Moral −7.',
    excludes: 'restday',
    morale: -7,
    mods: { production: 0.2 },
    reaction: 'Trois foreurs se sont endormis debout dans la galerie est. On les a réveillés.',
  },
  {
    id: 'restday',
    name: 'Jour sans forage',
    branch: 'survival',
    text: 'Un jour sur sept, on coupe les foreuses et on écoute le silence.',
    effect: 'Moral +8. Production −5 %.',
    excludes: 'longshifts',
    morale: 8,
    mods: { production: -0.05 },
    reaction: 'Ils ont chanté, hier. Personne n’avait chanté depuis l’éboulement.',
  },
  {
    id: 'larvae',
    name: 'Viande de galerie',
    branch: 'survival',
    text: 'Les larves se multiplient dans le noir et ne demandent rien. Il suffit de ne pas regarder l’assiette.',
    effect: 'Débloque le vivier à larves. Moral −2.',
    morale: -2,
    reaction: 'Les enfants en redemandent. Les parents ne disent rien.',
  },
  {
    id: 'corpses',
    name: 'Rien ne se perd',
    branch: 'survival',
    text: 'Nos morts nourriront les vivants. Le registre dira « protéines de récupération », et personne ne lira le registre.',
    effect: `Chaque citoyen perdu rend ${CORPSE_FOOD} de nourriture. Choc immédiat sur le moral, le complot monte.`,
    requires: 'larvae',
    excludes: 'ossuary',
    shock: -18,
    conspiracy: 10,
    reaction: 'On ne parle plus à table. On ne parle plus du tout.',
  },
  {
    id: 'ossuary',
    name: 'L’Ossuaire',
    branch: 'survival',
    text: 'Chaque mort aura son nom gravé dans la roche. Cela coûte de la place, et du temps.',
    effect: 'Moral +5, le complot recule.',
    requires: 'larvae',
    excludes: 'corpses',
    morale: 5,
    conspiracy: -8,
    reaction: 'Les veuves y descendent le soir. Quelqu’un y a déjà gravé votre nom, à l’avance.',
  },
  {
    id: 'watch',
    name: 'Garde de quartier',
    branch: 'order',
    text: 'Un homme armé à chaque carrefour. Pour votre sécurité, dit l’affiche.',
    effect: 'Le complot progresse 25 % moins vite. Moral −3.',
    morale: -3,
    mods: { conspiracyGain: -0.25 },
    reaction: 'Les conversations s’arrêtent quand la patrouille passe.',
  },
  {
    id: 'informers',
    name: 'Oreilles de la Charte',
    branch: 'order',
    text: 'Une ration de plus pour qui dénonce son voisin. Les caisses de délation sont en place.',
    effect: 'Révèle un indice sur le traître. Le complot recule, moral −6.',
    requires: 'watch',
    excludes: 'opencouncil',
    morale: -6,
    conspiracy: -12,
    reaction: 'Quarante dénonciations la première nuit. Dont onze contre vous.',
  },
  {
    id: 'opencouncil',
    name: 'Conseil ouvert',
    branch: 'order',
    text: 'Les débats du conseil seront lus à voix haute dans les habitats. Le meilleur comme le pire.',
    effect: 'Moral +6. Le complot progresse 10 % plus vite.',
    requires: 'watch',
    excludes: 'informers',
    morale: 6,
    mods: { conspiracyGain: 0.1 },
    reaction: 'Pour la première fois, on vous interpelle par votre nom. Pas toujours poliment.',
  },
  {
    id: 'tribunal',
    name: 'Tribunal d’exception',
    branch: 'order',
    text: 'Trois juges, une heure, pas d’appel. La galerie nord servira de prison, tant qu’elle tient.',
    effect: 'Le complot recule fortement. Choc immédiat sur le moral.',
    requires: 'informers',
    shock: -14,
    conspiracy: -30,
    reaction: 'Le premier condamné criait qu’il était innocent. Le deuxième aussi.',
  },
  {
    id: 'charteroath',
    name: 'Serment de la Charte',
    branch: 'faith',
    text: 'Il n’y a pas de Dormeur. Il y a de la roche, des chiffres et des ordres. Qui dit le contraire perd son emploi.',
    effect: 'Recherche +20 %. Moral −2.',
    excludes: 'vigil',
    morale: -2,
    mods: { research: 0.2 },
    reaction: 'Soum a fait encadrer l’affiche. Les autres baissent la voix pour prier.',
  },
  {
    id: 'vigil',
    name: 'Veillée du Dormeur',
    branch: 'faith',
    text: 'Vous autorisez les veillées. On y parle bas, on y garde une lampe allumée, et cela les calme.',
    effect: 'Moral +6, mais le complot gagne du terrain.',
    excludes: 'charteroath',
    morale: 6,
    conspiracy: 8,
    reaction: 'Ils sont deux cents autour d’une lampe. Ils se taisent tous en même temps.',
  },
  {
    id: 'offerings',
    name: 'Offrandes au Noyau',
    branch: 'faith',
    text: 'Un dixième de ce qu’on arrache à la roche lui sera rendu, jeté dans les failles. La roche, dit-on, tremble moins.',
    effect: 'Éboulements et secousses réduits de 30 %. Coûte 40 crédits et 20 de nourriture.',
    requires: 'vigil',
    morale: 3,
    mods: { hazard: -0.3 },
    stock: { credits: -40, food: -20 },
    reaction: 'Les sismographes confirment. Soum refuse de commenter.',
  },
];

export const edictById = (id: string): EdictDef => {
  const edict = EDICTS.find((e) => e.id === id);
  if (!edict) throw new Error(`Édit inconnu : ${id}`);
  return edict;
};
