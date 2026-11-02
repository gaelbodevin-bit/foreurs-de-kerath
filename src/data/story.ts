import type { AdvisorId, BuildingType, EnemyType, GovernorTraitId, ResourceId } from '../sim/types';

export const ADVISORS: Record<AdvisorId, { name: string; role: string; color: string }> = {
  orsa: { name: 'Orsa Veld', role: 'Ingénieure en chef', color: '#f2a65a' },
  krell: { name: 'Tomas Krell', role: 'Intendant de la colonie', color: '#7fc8a9' },
  soum: { name: 'Dr Ilyane Soum', role: 'Directrice scientifique', color: '#b79cff' },
};
export const ADVISOR_IDS = Object.keys(ADVISORS) as AdvisorId[];

export type Effect =
  | { kind: 'stock'; res: ResourceId; amount: number }
  | { kind: 'morale'; amount: number }
  | { kind: 'conspiracy'; amount: number }
  | { kind: 'population'; amount: number }
  | { kind: 'research'; amount: number }
  | { kind: 'flag'; flag: string }
  | { kind: 'spawn'; enemy: EnemyType; count: number }
  | { kind: 'sabotage'; count: number }
  | { kind: 'accuse'; advisor: AdvisorId }
  | { kind: 'governor'; trait: GovernorTraitId }
  | { kind: 'ration'; level: 0 | 1 | 2 };

export interface StoryChoice {
  label: string;
  effects: Effect[];
  /** Hidden unless every flag listed is set. */
  needsFlags?: string[];
  /** The panel this choice takes the player to. */
  opens?: 'production' | 'edicts';
}

export interface StoryTrigger {
  regions?: string[];
  minTime?: number;
  /** Seconds since the expedition reached CITY. */
  sinceCity?: number;
  flags?: string[];
  noFlags?: string[];
  minClues?: number;
  minConspiracy?: number;
  minPopulation?: number;
  built?: BuildingType;
  /** Only while the traitor is still at large. */
  moleAtLarge?: boolean;
}

export interface StoryEvent {
  id: string;
  speaker: string;
  title: string;
  text: string;
  when: StoryTrigger;
  /** Evidence gained on firing. The wording points to whichever advisor is the traitor. */
  clue?: Record<AdvisorId, string>;
  choices: StoryChoice[];
}

export const STORY_EVENTS: StoryEvent[] = [
  {
    id: 'lab_ready',
    speaker: 'Dr Ilyane Soum',
    title: 'Le laboratoire tourne',
    text: "Mes équipes sont au travail, Gouverneur. Chaque laboratoire alimenté produit des points de recherche, à dépenser dans le panneau Recherche (touche R).\n\nCommencez par ce qui vous bloque. La roche qui sépare ce secteur des suivants ne cédera qu'au marteau-piqueur, ou à une foreuse lourde.",
    when: { built: 'lab' },
    choices: [{ label: 'Compris.', effects: [] }],
  },
  {
    id: 'landing',
    speaker: 'Orsa Veld',
    title: 'Coupés de CITY',
    text: "Chef d'expédition, bienvenue sous la croûte. Kerath est un monde creux : le cristal, le métal et l'air respirable se trouvent tous en profondeur. La Charte nous envoie en prendre le contrôle, avant que d'autres ne s'en emparent. Tout partira d'ici : ce campement doit devenir la capitale de Kerath, et il lui faudra un gouverneur.\n\nLes colons de CITY devaient nous accueillir, mais un éboulement a fermé la galerie à notre arrivée. Nous sommes isolés, et eux aussi.\n\nNotre priorité : les rejoindre. Ils sont signalés par l'anneau turquoise sur la mini-carte. Glissez sur la roche pour marquer le passage à forer. Nos pioches n'entament que la roche tendre : il faudra contourner la roche dure.\n\nD'ici là, nous n'avons que le nécessaire : le menu de construction se limite à ce qui sert à explorer.",
    when: { regions: ['ash'], minTime: 1 },
    choices: [{ label: 'En route, on creuse.', effects: [] }],
  },
  {
    id: 'grid_short',
    speaker: 'Orsa Veld',
    title: 'Le courant ne porte pas plus loin',
    text: "Regardez le sol technique : au-delà d'un certain point, les dalles sont éteintes. Le courant s'épuise en chemin, et ce qui est branché là-bas ne reçoit rien.\n\nIl nous faut produire plus. Une centrale à cristaux posée sur la partie encore allumée relancera le courant bien plus loin. Gardez-lui du cristal : à l'arrêt, elle ne porte plus rien.",
    when: { flags: ['gridShort'] },
    choices: [{ label: 'Compris, on produit plus.', effects: [] }],
  },
  {
    id: 'city_reached',
    speaker: 'Orsa Veld',
    title: 'Gouverneur de Kerath',
    text: "La galerie est ouverte ! Les douze colons de CITY se joignent à nous, avec leurs logements, et dix de leurs mineurs passent sous vos ordres.\n\nIls vous reconnaissent comme gouverneur : la colonie est à vous, et le conseil aussi : il siège au centre de la ville (cliquez dessus, ou touche K). Krell, Soum et moi y siégeons, le siège de la Défense est libre, et vous pourrez recruter qui vous voudrez.\n\nLe menu de construction s'ouvre sur la cité : vous pouvez bâtir où vous voulez, et CITY alimente le réseau autour d'elle comme le Noyau. Faites respirer, nourrissez et logez ces gens. Bâtissez vite un laboratoire : sa recherche (touche R) mène au marteau-piqueur, au laser et aux véhicules.\n\nQuel gouverneur serez-vous ?",
    when: { regions: ['ash'], flags: ['cityReached'] },
    choices: [
      {
        label: 'Un bâtisseur (construction +20 %)',
        effects: [{ kind: 'governor', trait: 'builder' }],
      },
      {
        label: 'Un prospecteur (forage +20 %)',
        effects: [{ kind: 'governor', trait: 'prospector' }],
      },
      { label: 'Un stratège (dégâts +20 %)', effects: [{ kind: 'governor', trait: 'warlord' }] },
    ],
  },
  {
    id: 'food_intro',
    speaker: 'Tomas Krell',
    title: 'Ce que mangent vos gens',
    text: "Gouverneur, un mot sur ce qui fera tomber cette cité bien avant Vantor : la faim.\n\nChaque bouche, citoyen ou foreur, mange un tiers de ration par minute. Depuis que nous sommes ici, les réserves baissent, et personne ne les remplit.\n\nLa chaîne est simple : de la glace forée, un fondoir qui en fait de l'eau, une serre qui en fait de la nourriture. Une serre nourrit à peu près quarante-cinq personnes. Les champignons et la mousse se récoltent à la main, en appoint.\n\nLe panneau Production (touche N) vous donne le compte exact : ce qui entre, ce qui sort, combien de minutes il nous reste. Vous y fixez aussi les rations.",
    when: { flags: ['cityReached'], sinceCity: 40 },
    choices: [
      { label: 'Montrez-moi les comptes.', effects: [], opens: 'production' },
      { label: 'Compris.', effects: [] },
    ],
  },
  {
    id: 'food_short',
    speaker: 'Tomas Krell',
    title: 'Les réserves fondent',
    text: "J'ai refait le calcul trois fois, Gouverneur. À ce rythme, il nous reste moins de trois minutes de vivres.\n\nVérifiez d'abord la chaîne : une serre sans eau ne produit rien, un fondoir sans glace non plus, et rien ne tourne sans courant. Sinon, je peux réduire les parts dès ce soir. Ils me détesteront, puis ils vous détesteront.",
    when: { flags: ['foodShort'] },
    choices: [
      { label: 'Ouvrir les comptes.', effects: [], opens: 'production' },
      {
        label: 'Passez aux demi-rations.',
        effects: [{ kind: 'ration', level: 0 }],
      },
    ],
  },
  {
    id: 'starving',
    speaker: 'Tomas Krell',
    title: 'Il n’y a plus rien',
    text: "Les silos sont vides. Il n'y aura pas de distribution ce soir.\n\nSans vivres, le moral s'effondre et nous perdrons quelqu'un chaque minute. Les premiers sont déjà les plus vieux. Une serre met du temps à rendre : il faut tenir d'ici là, et il n'y a pas de bonne manière de le faire.",
    when: { flags: ['starved'] },
    choices: [
      { label: 'Ouvrir les comptes.', effects: [], opens: 'production' },
      {
        label: 'Ouvrir les réserves de la Charte (+25 vivres, −60 crédits)',
        effects: [
          { kind: 'stock', res: 'food', amount: 25 },
          { kind: 'stock', res: 'credits', amount: -60 },
        ],
      },
      {
        label: 'Les foreurs mangeront d’abord (+15 vivres, le complot monte)',
        effects: [
          { kind: 'stock', res: 'food', amount: 15 },
          { kind: 'conspiracy', amount: 12 },
          { kind: 'morale', amount: -8 },
        ],
      },
    ],
  },
  {
    id: 'edict_intro',
    speaker: 'Tomas Krell',
    title: 'Le registre des édits',
    text: "Gouverneur, le registre de la Charte est sur votre table. Tout ce que vous y signez devient loi, et aucun édit ne s'abroge.\n\nCertains nourrissent, d'autres surveillent, d'autres rassurent ceux qui ont peur du noir. Beaucoup en excluent un autre : choisir, c'est fermer une porte pour de bon. Et la colonie a besoin de temps pour encaisser : un édit à la fois, avec un délai entre deux.\n\nPersonne ne vous demandera si c'était juste. Seulement si ça a marché.",
    when: { flags: ['cityReached'], sinceCity: 110 },
    choices: [
      { label: 'Ouvrez le registre (touche L).', effects: [], opens: 'edicts' },
      { label: 'Plus tard.', effects: [] },
    ],
  },
  {
    id: 'chasm_seen',
    speaker: 'Orsa Veld',
    title: 'Un gouffre',
    text: "Regardez devant vous : la roche s'arrête. On a jeté une lampe, on ne l'a pas entendue toucher le fond.\n\nOn ne contourne pas ça, Chef : il faut un pont. L'outil Pont, dans le menu de construction : glissez sur le vide, et une équipe posera les travées une à une depuis le bord. Trois roches et deux minerais par case. Le pont porte aussi le courant.\n\nÇa marche au-dessus de l'eau et de la lave. Et n'oubliez pas qu'un pont, ça laisse aussi passer ce qui vit de l'autre côté.",
    when: { flags: ['chasmSeen'] },
    choices: [{ label: 'Compris.', effects: [] }],
  },
  {
    id: 'oil_seen',
    speaker: 'Dr Ilyane Soum',
    title: 'La roche suinte',
    text: "Ce noir sur le sol, c'est du pétrole, et il remonte tout seul. Ne me demandez pas comment une planète sans forêt en produit : je préfère ne pas y penser.\n\nLa recherche Pétrochimie permet de poser un derrick, sur le suintement et nulle part ailleurs. Le pétrole alimente une centrale au fioul, très puissante. Vulcanisé au soufre, il donne du caoutchouc, et le caoutchouc donne les pneus de nos camions.",
    when: { flags: ['oilSeen', 'cityReached'] },
    choices: [{ label: 'Bon à savoir.', effects: [] }],
  },
  {
    id: 'fumarole_seen',
    speaker: 'Orsa Veld',
    title: 'Le sol respire',
    text: "Cette fissure crache du gaz par bouffées, et ce n'est pas près de s'arrêter. Restez à distance quand ça souffle, ou posez un ventilateur.\n\nMieux : la recherche Captage des gaz permet de coiffer la fumerolle. Plus d'émanations, et de l'énergie gratuite. C'est le genre de chose qui sauve une colonie, si on n'y laisse pas d'abord une équipe.",
    when: { flags: ['fumaroleSeen'] },
    choices: [{ label: 'Compris.', effects: [] }],
  },
  {
    id: 'moss_seen',
    speaker: 'Dr Ilyane Soum',
    title: 'De la lumière, ici',
    text: "Une mousse qui brille d'elle-même. Elle éclaire la galerie, et elle se mange : glissez dessus pour la faire récolter, elle repousse en un peu plus d'une minute.\n\nJe note une chose, sans savoir encore quoi en faire : elle pulse. Toute la nappe, en même temps, et lentement. Comme une respiration.",
    when: { flags: ['mossSeen'] },
    choices: [{ label: 'Faites-en analyser.', effects: [{ kind: 'research', amount: 1 }] }],
  },
  {
    id: 'tungsten_seen',
    speaker: 'Orsa Veld',
    title: 'Du tungstène',
    text: "Ce filon gris-bleu, c'est du tungstène. Rien d'autre ne tient autant la chaleur. Seule une foreuse laser en viendra à bout, mais il vaut le détour : forets au tungstène, tourelles à obus.",
    when: { flags: ['tungstenSeen', 'cityReached'] },
    choices: [{ label: 'On y viendra.', effects: [] }],
  },
  {
    id: 'knocking',
    speaker: 'Contremaître Ilan Roche',
    title: 'On frappe dans la roche',
    text: "Gouverneur, l'équipe de nuit a posé ses outils. Ça frappe, derrière la paroi est. Trois coups, un silence, trois coups. Depuis deux jours, toujours à la même heure.\n\nÇa ne peut pas être des survivants. Personne n'a jamais creusé par là. La cité, en tout cas, prétend que non.",
    when: { flags: ['cityReached'], sinceCity: 260 },
    choices: [
      {
        label: 'Percez. Je veux savoir.',
        effects: [
          { kind: 'flag', flag: 'knockingOpened' },
          { kind: 'morale', amount: -4 },
          { kind: 'research', amount: 1 },
        ],
      },
      {
        label: 'Murez la galerie, et qu’on n’en parle plus.',
        effects: [
          { kind: 'flag', flag: 'knockingWalled' },
          { kind: 'conspiracy', amount: 5 },
        ],
      },
    ],
  },
  {
    id: 'old_tags',
    speaker: 'Contremaître Ilan Roche',
    title: 'Les plaques',
    text: "Il n'y avait personne derrière la paroi. Enfin, plus depuis longtemps. Neuf corps, assis en cercle, face à la roche, une pioche à la main. Ils portent des plaques de la Charte.\n\nLa date de la plus récente précède de quarante et un ans la « première expédition » que l'on enseigne à nos enfants.\n\nEt la paroi, de leur côté, est usée à hauteur de poing.",
    when: { flags: ['knockingOpened'], sinceCity: 420 },
    choices: [
      {
        label: 'Rapportez les plaques au laboratoire.',
        effects: [
          { kind: 'research', amount: 2 },
          { kind: 'flag', flag: 'knowsOldExpedition' },
        ],
      },
      {
        label: 'Rebouchez. Ils n’ont jamais existé.',
        effects: [
          { kind: 'conspiracy', amount: 6 },
          { kind: 'morale', amount: 3 },
        ],
      },
    ],
  },
  {
    id: 'city_secret',
    speaker: 'Maren Oule, doyenne de CITY',
    title: 'L’éboulement',
    text: "Vous nous avez sauvés, on le répète partout. Alors je vais vous le dire une fois, Gouverneur.\n\nCet éboulement n'était pas un accident. C'est nous qui avons fait sauter la galerie, le jour où votre navette a été signalée. Pas pour vous nuire : pour que vous restiez de l'autre côté.\n\nChaque fois que quelqu'un creuse vers le bas, ici, ça finit de la même façon. Nos pères le savaient. La Charte aussi. Vous n'êtes pas la première colonie de Kerath. Vous êtes juste la première à qui on ne l'a pas dit.",
    when: { flags: ['cityReached'], sinceCity: 620 },
    choices: [
      {
        label: 'Écoutez-la jusqu’au bout, en privé.',
        effects: [
          { kind: 'flag', flag: 'cityTruth' },
          { kind: 'research', amount: 2 },
          { kind: 'conspiracy', amount: 4 },
        ],
      },
      {
        label: 'Sabotage d’une galerie : faites-la arrêter.',
        effects: [
          { kind: 'morale', amount: -10 },
          { kind: 'conspiracy', amount: -6 },
          { kind: 'flag', flag: 'marenJailed' },
        ],
      },
    ],
  },
  {
    id: 'lumen_dream',
    speaker: 'Dr Ilyane Soum',
    title: 'Le même rêve',
    text: "J'ai interrogé séparément douze colons ayant dormi près des Jardins. Ils décrivent tous le même rêve : une pièce sans mur, une lumière qui respire, et quelqu'un de très grand, très patient, qui les écoute penser.\n\nC'est sans doute les spores. La mousse nourrit bien, et ceux qui en mangent ne se plaignent plus de rien.\n\nC'est justement ce qui m'inquiète.",
    when: { regions: ['lumen'], minTime: 120 },
    choices: [
      {
        label: 'Brûlez la nappe la plus proche (moral en baisse).',
        effects: [
          { kind: 'morale', amount: -6 },
          { kind: 'conspiracy', amount: -6 },
        ],
      },
      {
        label: 'Récoltez davantage. Un homme qui rêve ne fait pas grève.',
        effects: [
          { kind: 'stock', res: 'food', amount: 30 },
          { kind: 'morale', amount: 6 },
          { kind: 'conspiracy', amount: 10 },
          { kind: 'flag', flag: 'sporesEaten' },
        ],
      },
    ],
  },
  {
    id: 'lumen_walkers',
    speaker: 'Tomas Krell',
    title: 'Les marcheurs',
    text: "Ce matin, un habitat entier a été retrouvé vide, lits faits. On a suivi les traces : ils ont marché pieds nus jusqu'à la paroi des Jardins, et ils se sont arrêtés là, le front contre la roche, les yeux ouverts.\n\nOn en a ramené la plupart. Ils ne se souviennent de rien. Il en manque un.",
    when: { regions: ['lumen'], minTime: 380, flags: ['sporesEaten'] },
    choices: [
      {
        label: 'Verrouillez les habitats la nuit.',
        effects: [
          { kind: 'population', amount: -1 },
          { kind: 'morale', amount: -6 },
        ],
      },
      {
        label: 'Laissez-les dormir. Postez seulement un garde.',
        effects: [
          { kind: 'population', amount: -2 },
          { kind: 'conspiracy', amount: 8 },
        ],
      },
    ],
  },
  {
    id: 'abyss_voices',
    speaker: 'Orsa Veld',
    title: 'Ce qui monte du noir',
    text: "On a perdu Ansel Marr au bord du grand gouffre. Il n'a pas glissé. Son équipier dit qu'il a posé son casque, qu'il l'a posé bien droit, et qu'il a sauté en répondant à quelqu'un.\n\nLes hommes disent qu'on entend appeler leur nom, en bas. Le pire, c'est que je ne peux pas leur dire que c'est faux.",
    when: { regions: ['abyss'], minTime: 110 },
    choices: [
      {
        label: 'Garde-fous partout (−20 métal, −15 roche).',
        effects: [
          { kind: 'stock', res: 'metal', amount: -20 },
          { kind: 'stock', res: 'stone', amount: -15 },
          { kind: 'morale', amount: 7 },
        ],
      },
      {
        label: 'Descendez un micro. Soum veut entendre ça.',
        effects: [
          { kind: 'research', amount: 3 },
          { kind: 'conspiracy', amount: 7 },
          { kind: 'population', amount: -1 },
          { kind: 'flag', flag: 'abyssListened' },
        ],
      },
    ],
  },
  {
    id: 'abyss_bridge',
    speaker: 'Dr Ilyane Soum',
    title: 'Le vieux pont',
    text: "Une équipe a trouvé, trois failles plus loin, les restes d'un pont de câbles. Du matériel de la Charte, ancien modèle. Il ne mène nulle part : il s'arrête au milieu du vide, posé à la perfection, comme si ceux qui le construisaient n'avaient jamais eu l'intention de le finir.\n\nSur la dernière travée, quelqu'un a gravé une liste de noms. Et la dernière ligne n'est pas un nom : c'est un ordre de mission. « Continuer à descendre. Le rapport suivra. »",
    when: { regions: ['abyss'], minTime: 340 },
    choices: [
      {
        label: 'Récupérez les câbles.',
        effects: [
          { kind: 'stock', res: 'metal', amount: 12 },
          { kind: 'flag', flag: 'knowsOldExpedition' },
        ],
      },
      {
        label: 'Coupez-le. Que rien ne remonte par là.',
        effects: [{ kind: 'morale', amount: 4 }],
      },
    ],
  },
  {
    id: 'charter_letter',
    speaker: 'Directive de la Charte',
    title: 'Ne pas diffuser',
    text: "« Au gouverneur de la concession Kerath. Les navettes de relève sont suspendues jusqu'à nouvel ordre. Poursuivez le forage en direction du Noyau, quel qu'en soit le coût local.\n\nLa colonie n'a pas vocation à être rentable. Son rôle est d'atteindre la profondeur prévue. Les pertes sont intégrées au plan. »\n\nLe message a mis onze ans à vous parvenir. Il a été envoyé avant votre départ.",
    when: { regions: ['sulfur'], minTime: 70 },
    choices: [
      {
        label: 'Brûlez ça. Personne ne doit le lire.',
        effects: [
          { kind: 'conspiracy', amount: 8 },
          { kind: 'flag', flag: 'letterHidden' },
        ],
      },
      {
        label: 'Lisez-le en place publique.',
        effects: [
          { kind: 'morale', amount: -14 },
          { kind: 'conspiracy', amount: -14 },
          { kind: 'flag', flag: 'letterRead' },
        ],
      },
    ],
  },
  {
    id: 'corpses_noticed',
    speaker: 'Déléguée Nira Oss',
    title: 'Le registre des protéines',
    text: 'Une cuisinière sait lire, Gouverneur. Elle sait compter aussi. Elle a déposé son tablier devant ma porte, et sa fille ne mange plus.\n\nJe ne vous demande rien. Je voulais seulement que vous sachiez que nous savons.',
    when: { flags: ['edict_corpses'], minTime: 0 },
    choices: [
      {
        label: 'Personne ne manque de rien. C’est tout ce qui compte.',
        effects: [{ kind: 'conspiracy', amount: 6 }],
      },
      {
        label: 'Donnez une prime aux cuisines (−50 crédits).',
        effects: [
          { kind: 'stock', res: 'credits', amount: -50 },
          { kind: 'morale', amount: 5 },
        ],
      },
    ],
  },
  {
    id: 'offerings_answer',
    speaker: 'La Grande Veilleuse',
    title: 'Il a entendu',
    text: "Vous nourrissez les failles, Gouverneur, et la roche s'apaise. Vous l'avez mesuré vous-même.\n\nVous n'avez pas fait un pacte : un pacte se défait. Vous avez pris une habitude. Elle lui plaît. Il en voudra davantage, et vous le lui donnerez, parce que vous avez vu ce que coûte le contraire.",
    when: { flags: ['edict_offerings'], minTime: 0 },
    choices: [
      {
        label: 'Encore une offrande (−25 vivres, moral en hausse).',
        effects: [
          { kind: 'stock', res: 'food', amount: -25 },
          { kind: 'morale', amount: 8 },
        ],
      },
      {
        label: 'Sortez-la de ce bureau.',
        effects: [{ kind: 'spawn', enemy: 'saboteur', count: 2 }],
      },
    ],
  },
  {
    id: 'tribunal_files',
    speaker: 'Greffier du tribunal',
    title: 'Le dossier 114',
    text: "Pour la bonne tenue du registre, Gouverneur : nous avons jugé cent quatorze personnes ce mois-ci, pour une colonie qui en compte bien moins.\n\nJ'ai vérifié. Certains ont été condamnés plusieurs fois. L'un d'eux après sa mort. Le tribunal fonctionne parfaitement, et je n'ai aucune recommandation à formuler.",
    when: { flags: ['edict_tribunal'], minTime: 0 },
    choices: [{ label: 'Classez le dossier.', effects: [{ kind: 'morale', amount: -4 }] }],
  },
  {
    id: 'core_heartbeat',
    speaker: 'Dr Ilyane Soum',
    title: 'Le rythme',
    text: "J'ai superposé deux relevés sans raison particulière : les battements enregistrés au Noyau, et la consommation électrique de la cité sur un an.\n\nC'est la même courbe, Gouverneur. Nos relèves, nos pauses, nos nuits. Je ne sais pas lequel des deux suit l'autre.\n\nJe ne suis plus certaine que nous ayons un jour décidé quoi que ce soit.",
    when: { regions: ['core'], minTime: 70 },
    choices: [
      { label: 'Continuez à forer.', effects: [{ kind: 'conspiracy', amount: 4 }] },
      {
        label: 'Décalez toutes les relèves de sept minutes.',
        effects: [
          { kind: 'morale', amount: -6 },
          { kind: 'research', amount: 3 },
        ],
      },
    ],
  },
  {
    id: 'missing_crates',
    speaker: 'Tomas Krell',
    title: 'Des caisses manquantes',
    text: "Gouverneur, l'inventaire ne tombe pas juste : des cristaux ont disparu de nos réserves, et quelqu'un a envoyé un message longue portée hors de nos fréquences. Nous ne sommes pas seuls à vouloir Kerath.",
    when: { regions: ['ash'], minTime: 200, flags: ['cityReached'] },
    clue: {
      orsa: "Le relais longue portée a été activé avec un badge d'ingénierie.",
      krell: "Les bordereaux de l'inventaire ont été corrigés après coup, d'une écriture soignée.",
      soum: 'Le message a été chiffré avec une clé issue des archives du laboratoire.',
    },
    choices: [
      {
        label: 'Ouvrir une enquête discrète (20 crédits)',
        effects: [
          { kind: 'stock', res: 'credits', amount: -20 },
          { kind: 'conspiracy', amount: -8 },
        ],
      },
      { label: 'Nous avons mieux à faire.', effects: [{ kind: 'conspiracy', amount: 8 }] },
    ],
  },
  {
    id: 'vantor_envoy',
    speaker: 'Maël Dessaint, Consortium Vantor',
    title: 'Une offre généreuse',
    text: "Gouverneur, le Consortium admire votre énergie. Cédez-nous les droits d'extraction de ces failles, et nous financerons votre cité. Refusez, et nos drones de sécurité auront peut-être du mal à reconnaître vos couleurs.",
    when: { regions: ['glass'], minTime: 140 },
    choices: [
      {
        label: 'Accepter l’argent (+160 crédits, le complot gagne du terrain)',
        effects: [
          { kind: 'stock', res: 'credits', amount: 160 },
          { kind: 'conspiracy', amount: 14 },
          { kind: 'flag', flag: 'vantorDeal' },
        ],
      },
      {
        label: 'Refuser net (des drones arrivent)',
        effects: [
          { kind: 'spawn', enemy: 'drone', count: 2 },
          { kind: 'morale', amount: 8 },
          { kind: 'flag', flag: 'vantorRefused' },
        ],
      },
    ],
  },
  {
    id: 'glass_leak',
    speaker: 'Tomas Krell',
    title: 'La carte de nos galeries',
    text: 'Les drones Vantor connaissent le tracé exact de nos galeries, y compris celles creusées hier. Ce plan ne peut sortir que du conseil, Gouverneur : nous trois.',
    when: { regions: ['glass'], minTime: 300 },
    clue: {
      orsa: 'Le plan divulgué comporte des annotations de calcul de charge, propres aux ingénieurs.',
      krell:
        'Le plan divulgué porte les codes des postes de ravitaillement, connus de l’intendance.',
      soum: 'Le plan divulgué est superposé à des relevés sismiques inédits du laboratoire.',
    },
    choices: [
      {
        label: 'Personne ne doit savoir que je sais.',
        effects: [{ kind: 'conspiracy', amount: 4 }],
      },
    ],
  },
  {
    id: 'preacher',
    speaker: 'Dr Ilyane Soum',
    title: 'Le prêcheur des habitats',
    text: "Un homme prêche dans les habitats : Kerath serait vivante, le Dormeur s'éveillerait, nos foreuses lui perceraient la chair. Les Enfants du Noyau recrutent parmi nos propres citoyens.",
    when: { regions: ['ice'], minTime: 110 },
    choices: [
      {
        label: 'Laisser dire, la foule a besoin d’espoir',
        effects: [
          { kind: 'morale', amount: 7 },
          { kind: 'conspiracy', amount: 16 },
          { kind: 'flag', flag: 'cultTolerated' },
        ],
      },
      {
        label: 'Le bannir (ses fidèles se vengeront)',
        effects: [
          { kind: 'morale', amount: -6 },
          { kind: 'conspiracy', amount: -10 },
          { kind: 'spawn', enemy: 'saboteur', count: 3 },
        ],
      },
      {
        label: 'Infiltrer son cercle (40 crédits)',
        effects: [
          { kind: 'stock', res: 'credits', amount: -40 },
          { kind: 'flag', flag: 'cultInfiltrated' },
          { kind: 'research', amount: 2 },
        ],
      },
    ],
  },
  {
    id: 'ice_ledger',
    speaker: 'Orsa Veld',
    title: 'Le carnet du sectaire',
    text: "Nos gardes ont trouvé un carnet sur un saboteur. Les sectaires et Vantor n'ont rien en commun, et pourtant ils reçoivent leurs ordres de la même source. Quelqu'un manœuvre les deux camps.",
    when: { regions: ['ice'], minTime: 290 },
    clue: {
      orsa: 'Le carnet décrit des points faibles de nos centrales que seul un ingénieur connaît par cœur.',
      krell:
        'Le carnet liste nos stocks au cristal près, chiffres officiels de l’intendance à l’appui.',
      soum: 'Le carnet emploie des termes de biologie des profondeurs, inconnus hors du laboratoire.',
    },
    choices: [
      {
        label: 'Doublez la garde autour du conseil.',
        effects: [{ kind: 'conspiracy', amount: -5 }],
      },
    ],
  },
  {
    id: 'strike',
    speaker: 'Déléguée Nira Oss',
    title: 'Grève dans les fonderies',
    text: "Gouverneur, on nous demande de tenir un front contre le Consortium tout en respirant de la poussière de soufre. Les équipes croisent les bras jusqu'à ce qu'on les entende.",
    when: { regions: ['sulfur'], minTime: 130 },
    choices: [
      {
        label: 'Payer une prime (80 crédits)',
        effects: [
          { kind: 'stock', res: 'credits', amount: -80 },
          { kind: 'morale', amount: 14 },
        ],
      },
      {
        label: 'Briser la grève',
        effects: [
          { kind: 'morale', amount: -14 },
          { kind: 'conspiracy', amount: 12 },
          { kind: 'flag', flag: 'strikeBroken' },
        ],
      },
    ],
  },
  {
    id: 'sulfur_sabotage',
    speaker: 'Tomas Krell',
    title: 'Sabotage en plein jour',
    text: "Une charge a sauté au cœur de nos installations. Elle a été posée par quelqu'un qui connaissait nos rondes. Une dernière preuve a été récupérée dans les débris.",
    when: { regions: ['sulfur'], minTime: 320, moleAtLarge: true },
    clue: {
      orsa: "Le détonateur a été monté avec un outillage de l'atelier d'ingénierie.",
      krell: "La charge est arrivée dans une caisse validée au poste de l'intendance.",
      soum: 'La charge utilise un composé de synthèse produit en petite quantité au laboratoire.',
    },
    choices: [
      {
        label: 'Réparer et garder la tête froide',
        effects: [{ kind: 'sabotage', count: 1 }],
      },
    ],
  },
  {
    id: 'accusation',
    speaker: 'Votre conscience',
    title: 'Le traître du conseil',
    text: "Les preuves sont réunies : un de vos trois conseillers renseigne vos ennemis depuis l'atterrissage. Relisez le dossier de l'enquête, puis décidez. Une accusation juste démantèle le réseau ; une accusation fausse détruit un innocent et renforce le vrai coupable.",
    when: { regions: ['vantor', 'magma', 'core'], minTime: 45, minClues: 2, moleAtLarge: true },
    choices: [
      { label: 'Orsa Veld est la traîtresse', effects: [{ kind: 'accuse', advisor: 'orsa' }] },
      { label: 'Tomas Krell est le traître', effects: [{ kind: 'accuse', advisor: 'krell' }] },
      { label: 'Ilyane Soum est la traîtresse', effects: [{ kind: 'accuse', advisor: 'soum' }] },
      {
        label: 'Je ne condamne personne sans certitude',
        effects: [{ kind: 'conspiracy', amount: 10 }],
      },
    ],
  },
  {
    id: 'vantor_truth',
    speaker: 'Dr Ilyane Soum',
    title: 'Le forage du Consortium',
    text: "Nous avons déchiffré les serveurs d'un avant-poste. Vantor ne cherche ni le minerai ni le cristal : il fore droit vers le Noyau, et il finance les sectaires pour nous occuper. Le Dormeur n'est peut-être pas qu'une légende.",
    when: { regions: ['vantor'], minTime: 200 },
    choices: [
      {
        label: 'Publiez-le. Que la colonie sache.',
        effects: [
          { kind: 'morale', amount: 8 },
          { kind: 'flag', flag: 'truthPublic' },
        ],
      },
      { label: 'Gardons cet avantage secret.', effects: [{ kind: 'research', amount: 3 }] },
    ],
  },
  {
    id: 'vantor_blackmail',
    speaker: 'Maël Dessaint, Consortium Vantor',
    title: 'Un contrat est un contrat',
    text: 'Vous avez encaissé notre argent aux Failles de Verre, Gouverneur. Nos juristes considèrent que tout ce que vous foulez ici nous appartient déjà. Les drones viennent récupérer notre bien.',
    when: { regions: ['vantor'], minTime: 90, flags: ['vantorDeal'] },
    choices: [
      {
        label: 'Que vos juristes viennent le dire en face.',
        effects: [{ kind: 'spawn', enemy: 'drone', count: 4 }],
      },
    ],
  },
  {
    id: 'cult_pact',
    speaker: 'La Grande Veilleuse',
    title: 'Le pacte du Dormeur',
    text: "Vous détruisez ce que vous ne comprenez pas, Gouverneur. Le Dormeur ne veut pas de guerre : il veut qu'on le laisse rêver. Jurez de ne pas percer son cœur, et nos fidèles déposeront les armes à vos pieds.",
    when: { regions: ['magma'], minTime: 160 },
    choices: [
      {
        label: 'Jurer le pacte (les sectaires cessent de comploter)',
        effects: [
          { kind: 'flag', flag: 'pact' },
          { kind: 'conspiracy', amount: -30 },
          { kind: 'morale', amount: 6 },
        ],
      },
      {
        label: 'Kerath n’a qu’un maître',
        effects: [
          { kind: 'spawn', enemy: 'saboteur', count: 4 },
          { kind: 'flag', flag: 'pactRefused' },
        ],
      },
    ],
  },
  {
    id: 'core_arrival',
    speaker: 'Orsa Veld',
    title: 'Le dernier forage',
    text: 'Nous y sommes, Gouverneur. La roche bat comme une artère. Quelque part dans ces galeries, le cœur du Dormeur nourrit toute la Faune de Kerath. Détruisez-le et plus rien ne vous disputera cette planète. Foreuses lourdes et gardes en nombre seront nécessaires.',
    when: { regions: ['core'], minTime: 2 },
    choices: [{ label: 'Lancez le forage.', effects: [] }],
  },
  {
    id: 'core_mercy',
    speaker: 'La Grande Veilleuse',
    title: 'Votre serment',
    text: 'Vous avez juré, Gouverneur. Calmez seulement le cœur : ses battements faibliront et Kerath restera vivante. Ou bien trahissez et prenez tout, comme ceux que vous combattez.',
    when: { regions: ['core'], minTime: 120, flags: ['pact'] },
    choices: [
      {
        label: 'Tenir parole : apaiser le Dormeur',
        effects: [{ kind: 'flag', flag: 'endingMercy' }],
      },
      {
        label: 'Trahir le pacte',
        effects: [
          { kind: 'flag', flag: 'pactBroken' },
          { kind: 'morale', amount: -10 },
        ],
      },
    ],
  },
];

/** Extra evidence that paid investigations can turn up, one for each round. */
export const INVESTIGATION_CLUES: Record<AdvisorId, string[]> = {
  orsa: [
    'Filature : Orsa Veld passe ses nuits près du relais longue portée, officiellement pour le réparer.',
    'Comptes : un virement Vantor a transité par une société de maintenance liée à l’ingénierie.',
  ],
  krell: [
    'Filature : Tomas Krell rencontre un transporteur inconnu aux heures de relève.',
    'Comptes : un virement Vantor se cache derrière une ligne « fournitures » de l’intendance.',
  ],
  soum: [
    'Filature : Ilyane Soum détruit certains échantillons au lieu de les archiver.',
    'Comptes : une bourse de recherche du labo a été financée par une façade de Vantor.',
  ],
};

export const ENDINGS = {
  conquest: {
    title: 'Le Maître de Kerath',
    text: "Le cœur du Dormeur s'est tu. La Faune s'éteint galerie après galerie, le Consortium a plié bagage et la Charte vous nomme gouverneur à vie, par un message envoyé il y a onze ans. La planète est à vous. Elle est aussi, pour la première fois, parfaitement silencieuse. Dans les habitats, la nuit, plus personne ne rêve. Plus personne ne se réveille tout à fait non plus.",
  },
  mercy: {
    title: 'Le Serment de Kerath',
    text: "Le cœur bat moins vite. Les sectaires déposent les armes, la Faune retourne aux profondeurs et votre cité s'étend sur toute la planète, sous la surveillance muette de quelque chose qui rêve. Vous gouvernez Kerath, et Kerath vous tolère. Chaque année, sans que personne l'ait décidé, une équipe descend, et ne remonte pas. On appelle ça la relève.",
  },
  treason: {
    title: 'Un Trône sur des Cendres',
    text: 'Vous tenez la planète, mais le serment brisé vous suit. Les galeries se souviennent et le conseil se méfie. Vantor attend déjà la prochaine crise. Et certaines nuits, derrière la paroi de votre chambre, ça frappe : trois coups, un silence, trois coups.',
  },
} as const;
