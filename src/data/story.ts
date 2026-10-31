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
  | { kind: 'governor'; trait: GovernorTraitId };

export interface StoryChoice {
  label: string;
  effects: Effect[];
  /** Hidden unless every flag listed is set. */
  needsFlags?: string[];
}

export interface StoryTrigger {
  regions?: string[];
  minTime?: number;
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
    text: "Mes équipes sont au travail, Gouverneur. Chaque laboratoire alimenté produit des points de recherche, à dépenser dans le panneau Progression (touche R) pour améliorer la colonie.\n\nPour les outils et les usines, ce sont les livraisons au Noyau qui comptent. La roche qui sépare ce secteur des suivants ne cédera qu'au marteau-piqueur, ou à une foreuse lourde.",
    when: { built: 'lab' },
    choices: [{ label: 'Compris.', effects: [] }],
  },
  {
    id: 'landing',
    speaker: 'Orsa Veld',
    title: 'Coupés de Port-Cendre',
    text: "Chef d'expédition, bienvenue sous la croûte. Kerath est un monde creux : le cristal, le métal et l'air respirable se trouvent tous en profondeur. La Charte nous envoie en prendre le contrôle, avant que d'autres ne s'en emparent. Tout partira d'ici : ce campement doit devenir la capitale de Kerath, et il lui faudra un gouverneur.\n\nLes colons de Port-Cendre devaient nous accueillir, mais un éboulement a fermé la galerie à notre arrivée. Nous sommes isolés, et eux aussi.\n\nNotre priorité : les rejoindre. Ils sont signalés par l'anneau turquoise sur la mini-carte. Glissez sur la roche pour marquer le passage à forer. Nos pioches n'entament que la roche tendre : il faudra contourner la roche dure.\n\nD'ici là, nous n'avons que le nécessaire. Ouvrez Progression (touche R) et livrez des ressources au Noyau pour débloquer l'énergie et la défense du site. Le reste attendra la cité.",
    when: { regions: ['ash'], minTime: 1 },
    choices: [{ label: 'En route, on creuse.', effects: [] }],
  },
  {
    id: 'city_reached',
    speaker: 'Orsa Veld',
    title: 'Gouverneur de Kerath',
    text: "La galerie est ouverte ! Huit colons rejoignent notre campement, avec ce qu'ils ont pu sauver.\n\nIls vous reconnaissent comme gouverneur : la colonie est à vous, et le conseil aussi (touche K). Krell, Soum et moi y siégeons, le siège de la Défense est libre, et vous pourrez recruter qui vous voudrez.\n\nL'onglet Cité du menu de construction est maintenant ouvert : faites respirer, nourrissez et logez ces gens. Un nouveau palier de jalons s'ouvre dans Progression : abris, air, cultures, laboratoire, puis la grande livraison qui lancera l'industrie. Le marteau-piqueur, les véhicules et le laser sont au bout de cette chaîne.\n\nQuel gouverneur serez-vous ?",
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
    text: "Le cœur du Dormeur s'est tu. La Faune s'éteint galerie après galerie, le Consortium a plié bagage et la Charte vous nomme gouverneur à vie. La planète est à vous. Elle est aussi, pour la première fois, parfaitement silencieuse.",
  },
  mercy: {
    title: 'Le Serment de Kerath',
    text: "Le cœur bat moins vite. Les sectaires déposent les armes, la Faune retourne aux profondeurs et votre cité s'étend sur toute la planète, sous la surveillance muette de quelque chose qui rêve. Vous gouvernez Kerath, et Kerath vous tolère.",
  },
  treason: {
    title: 'Un Trône sur des Cendres',
    text: 'Vous tenez la planète, mais le serment brisé vous suit. Les galeries se souviennent et le conseil se méfie. Vantor attend déjà la prochaine crise pour revenir frapper à votre porte.',
  },
} as const;
