import type { Bars } from '@/lib/chords/theory';

/**
 * Chord progressions and the feelings they usually carry for Western
 * listeners. These are learned conventions, not laws (Smit et al. 2022,
 * PLOS ONE); what moves people most is expectation: what the chords make
 * them predict, and whether it comes, is delayed, or swerves (Meyer 1956;
 * Huron 2006; Cheung et al. 2019, Current Biology).
 */
export type Progression = {
  id: string;
  name: string;
  /** Bars of Roman numerals (see lib/chords/theory). */
  bars: Bars;
  /** The usual feeling, in a few words. */
  feeling: string;
  /** Why it feels so, in a sentence. */
  why: string;
  tags: string[];
  source: { label: string; url: string };
};

export const PROGRESSIONS: Progression[] = [
  {
    id: 'lydian-lift',
    name: 'Lydian lift',
    bars: [['I'], ['II'], ['IV'], ['bVI']],
    feeling: 'urgency, expectation',
    why: 'The major II leads to V, but V never comes; bVI, borrowed from minor, returns home softly instead.',
    tags: ['urgent', 'bright', 'unresolved'],
    source: {
      label: 'Lydian chord',
      url: 'https://en.wikipedia.org/wiki/Lydian_chord',
    },
  },
  {
    id: 'hopeful-rise',
    name: 'Hopeful rise',
    bars: [['I'], ['II'], ['IV'], ['V']],
    feeling: 'hopeful, rising, arriving',
    why: 'The pull of the major II finally lands: IV then V lead straight back to I.',
    tags: ['hopeful', 'bright', 'resolved'],
    source: {
      label: 'Secondary chord',
      url: 'https://en.wikipedia.org/wiki/Secondary_chord',
    },
  },
  {
    id: 'pop-anthem',
    name: 'Pop anthem',
    bars: [['I'], ['V'], ['vi'], ['IV']],
    feeling: 'warm, familiar, anthemic',
    why: 'The most used pop loop: every chord in the key, nothing to surprise, everything to sing along to.',
    tags: ['warm', 'hopeful', 'familiar'],
    source: {
      label: 'I–V–vi–IV progression',
      url: 'https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression',
    },
  },
  {
    id: 'sensitive',
    name: 'Bittersweet hope',
    bars: [['vi'], ['IV'], ['I'], ['V']],
    feeling: 'bittersweet, then hopeful',
    why: 'The same chords as the pop anthem, started on the minor vi: it begins sad and climbs to the light.',
    tags: ['bittersweet', 'hopeful'],
    source: {
      label: 'I–V–vi–IV progression',
      url: 'https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression',
    },
  },
  {
    id: 'royal-road',
    name: 'Royal road',
    bars: [['IV'], ['V'], ['iii'], ['vi']],
    feeling: 'longing, heartbreak',
    why: 'It climbs to V, then drops to iii instead of going home: the J-pop and anime staple.',
    tags: ['longing', 'bittersweet', 'anime'],
    source: {
      label: 'Royal road progression',
      url: 'https://en.wikipedia.org/wiki/Royal_road_progression',
    },
  },
  {
    id: 'mario',
    name: 'Mario cadence',
    bars: [['I'], ['bVI'], ['bVII'], ['I']],
    feeling: 'triumphant, heroic',
    why: 'Borrowed bVI and bVII come home by the back door, without V: the sound of winning.',
    tags: ['triumphant', 'euphoric', 'resolved'],
    source: {
      label: 'Backdoor progression',
      url: 'https://en.wikipedia.org/wiki/Backdoor_progression',
    },
  },
  {
    id: 'minor-iv',
    name: 'Minor iv sigh',
    bars: [['I'], ['vi'], ['IV'], ['iv']],
    feeling: 'nostalgic, tender',
    why: 'IV turning minor just before home is a sigh: borrowed sadness that resolves warmly.',
    tags: ['nostalgic', 'bittersweet', 'tender'],
    source: {
      label: 'Plagal cadence',
      url: 'https://en.wikipedia.org/wiki/Plagal_cadence',
    },
  },
  {
    id: 'memory-leak',
    name: 'Floating (Memory Leak)',
    bars: [['IVadd9'], ['VI'], ['Imaj7'], ['IIsus4']],
    feeling: 'floating, suspended, bright',
    why: 'Major VI and II are borrowed brightness and there is no V–I, so it never lands; DJ_Dave holds the key’s 5th on top.',
    tags: ['floating', 'dreamy', 'bright', 'unresolved'],
    source: {
      label: 'Secondary chord',
      url: 'https://en.wikipedia.org/wiki/Secondary_chord',
    },
  },
  {
    id: 'wonder',
    name: 'Wonder',
    bars: [['I'], ['III'], ['IV'], ['iv']],
    feeling: 'wistful wonder',
    why: 'The major III is a chromatic mediant, an unexpected colour; the minor iv adds a sigh.',
    tags: ['wonder', 'wistful', 'bittersweet'],
    source: {
      label: 'Chromatic mediant',
      url: 'https://en.wikipedia.org/wiki/Chromatic_mediant',
    },
  },
  {
    id: 'soul',
    name: 'Soul cadence',
    bars: [['ii7'], ['V7'], ['Imaj7'], ['Imaj7']],
    feeling: 'smooth, satisfied',
    why: 'ii leads to V and V to I: each chord answers the last, the jazz and soul way home.',
    tags: ['smooth', 'warm', 'resolved'],
    source: {
      label: 'ii–V–I progression',
      url: 'https://en.wikipedia.org/wiki/Ii%E2%80%93V%E2%80%93I_progression',
    },
  },
  {
    id: 'dark-drive',
    name: 'Dark drive',
    bars: [['i'], ['bVII'], ['bVI'], ['bVII']],
    feeling: 'driving, dark, epic',
    why: 'The minor rock loop: it circles below home and never cadences, so it keeps pushing.',
    tags: ['dark', 'driving', 'unresolved'],
    source: {
      label: 'Aeolian mode',
      url: 'https://en.wikipedia.org/wiki/Aeolian_mode',
    },
  },
  {
    id: 'andalusian',
    name: 'Andalusian',
    bars: [['i'], ['bVII'], ['bVI'], ['V']],
    feeling: 'dramatic, fateful',
    why: 'The bass falls step by step to a major V, which pulls hard back to the minor home.',
    tags: ['dramatic', 'dark'],
    source: {
      label: 'Andalusian cadence',
      url: 'https://en.wikipedia.org/wiki/Andalusian_cadence',
    },
  },
  {
    id: 'canon',
    name: 'Canon',
    bars: [['I'], ['V'], ['vi'], ['iii'], ['IV'], ['I'], ['IV'], ['V']],
    feeling: 'grand, emotional',
    why: 'Eight bars over a slowly falling bass: momentum that feels inevitable.',
    tags: ['grand', 'emotional', 'resolved'],
    source: {
      label: "Pachelbel's Canon",
      url: 'https://en.wikipedia.org/wiki/Pachelbel%27s_Canon',
    },
  },
];

/** The techniques, as the tab and Claude name them. */
export const TECHNIQUES = [
  {
    id: 'resolve',
    label: 'Resolve',
    feeling: 'arrives home: ends the loop on V',
  },
  {
    id: 'mario',
    label: 'Mario ending',
    feeling: 'triumphant: ends on bVI bVII',
  },
  {
    id: 'borrow-iv',
    label: 'Borrow iv',
    feeling: 'bittersweet: IV turns minor',
  },
  {
    id: 'pedal',
    label: 'Pedal',
    feeling: 'grounded, building: the tonic stays in the bass',
  },
  {
    id: 'faster',
    label: 'Faster',
    feeling: 'more tension: two chords a bar',
  },
  {
    id: 'colour',
    label: 'Colour',
    feeling: 'open, floating: add9 and 7ths',
  },
  {
    id: 'key-up',
    label: 'Key up',
    feeling: 'lift: a whole step up, for a last chorus',
  },
] as const;
