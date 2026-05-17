import { LETTERS } from './aslData';

export const APP_NAME = 'ASL - ActSignLearn';
export const LAUNCH_BRAND = 'ASL';

export const AVATAR_IMAGES = Array.from(
  { length: 10 },
  (_, index) => `/Avatars/image${index + 1}.png`
);

export const OCEAN_BUDDIES = [
  {
    id: 'otter',
    name: 'Otter Guide',
    sprite: '/sprites/avatar-otter.svg',
    quotes: [
      'Small steady signs turn into fluent conversations.',
      'Relax your hand first. Clear shapes come from calm fingers.',
      'One careful academy round can make a sign click.',
    ],
  },
  {
    id: 'ray',
    name: 'Ray Coach',
    sprite: '/sprites/avatar-ray.svg',
    quotes: [
      'Accuracy beats speed until speed has something solid to follow.',
      'Try the sign slowly, then let it get smoother.',
      'The practice lagoon is calm today. Take your time.',
    ],
  },
  {
    id: 'octo',
    name: 'Octo Buddy',
    sprite: '/sprites/avatar-octo.svg',
    quotes: [
      'A 99% match marks mastery. Steady shape, steady confidence.',
      'Check the thumb and pinky. They tell the truth.',
      'Confidence grows when you can jump to any sign in the studio.',
    ],
  },
];

export const DASHBOARD_PROMPTS = {
  learn: [
    'What do you want to learn today?',
    'What do you want to tackle today?',
    'Which academy deck should we explore today?',
  ],
  practice: [
    'What should we sharpen today?',
    'Which signs deserve another lagoon round?',
    'What do you want to practice first?',
  ],
  games: [
    'Pick a game cove challenge.',
    'Choose a game to warm up your signing.',
    'Ready for a faster signing round?',
  ],
};

export const LEARN_DECKS = [
  {
    id: 'alphabet',
    mode: 'learn',
    title: 'Alphabet',
    level: 'Level 1',
    description: 'A-Z hand shapes with guided steps and a visual model.',
    items: LETTERS,
    unlocked: true,
    accent: '#087ea4',
    art: 'Letters',
  },
  {
    id: 'numbers',
    mode: 'learn',
    title: 'Numbers',
    level: 'Level 2',
    description: 'Count from 0-10 after you build alphabet confidence.',
    items: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    unlocked: false,
    accent: '#d97706',
    art: '0-10',
  },
  {
    id: 'fruits',
    mode: 'learn',
    title: 'Fruits',
    level: 'Level 3',
    description: 'Everyday food signs for apples, bananas, berries, and more.',
    items: ['apple', 'banana', 'orange', 'grapes', 'strawberry'],
    unlocked: false,
    accent: '#be3455',
    art: 'Fruit',
  },
  {
    id: 'animals',
    mode: 'learn',
    title: 'Animals',
    level: 'Level 4',
    description: 'Friendly animal signs once your foundations feel steady.',
    items: ['cat', 'dog', 'fish', 'bird', 'horse'],
    unlocked: false,
    accent: '#32845c',
    art: 'Animals',
  },
];

export const PRACTICE_DECKS = [
  {
    id: 'alphabet-review',
    mode: 'practice',
    title: 'Alphabet Review',
    level: 'Open Practice',
    description: 'Use camera feedback to practice the letters you are learning.',
    items: LETTERS,
    unlocked: true,
    accent: '#0f766e',
    art: 'A-Z',
  },
  {
    id: 'tricky-letters',
    mode: 'practice',
    title: 'Tricky Letters',
    level: 'Accuracy Set',
    description: 'A focused deck for signs that are easy to mix up.',
    items: ['E', 'M', 'N', 'R', 'S', 'T'],
    unlocked: false,
    accent: '#7c3aed',
    art: 'Focus',
  },
  {
    id: 'number-drill',
    mode: 'practice',
    title: 'Number Drill',
    level: 'Next Deck',
    description: 'Practice number signs after the numbers deck unlocks.',
    items: ['0', '1', '2', '3', '4', '5'],
    unlocked: false,
    accent: '#c2410c',
    art: 'Count',
  },
  {
    id: 'animal-recall',
    mode: 'practice',
    title: 'Animal Recall',
    level: 'Memory Set',
    description: 'Randomized animal sign prompts for later practice.',
    items: ['cat', 'dog', 'fish', 'bird'],
    unlocked: false,
    accent: '#15803d',
    art: 'Recall',
  },
];

export const GAME_DECKS = [
  {
    id: 'speed-sign',
    mode: 'practice',
    gameMode: 'speed-sign',
    title: 'SpeedSign',
    level: 'Game Cove',
    description: 'Race through alphabet prompts using the practice camera.',
    items: LETTERS,
    unlocked: true,
    accent: '#b45309',
    art: 'Fast A-Z',
  },
  {
    id: 'sign-match',
    mode: 'game',
    title: 'Sign Match',
    level: 'Coming Later',
    description: 'Match signs to prompts when more decks are ready.',
    items: LETTERS,
    unlocked: false,
    accent: '#9f1239',
    art: 'Match',
  },
  {
    id: 'deep-sea-quest',
    mode: 'game',
    title: 'Deep Sea Quest',
    level: 'Coming Later',
    description: 'A guided challenge path through mixed vocabulary.',
    items: LETTERS,
    unlocked: false,
    accent: '#0369a1',
    art: 'Quest',
  },
];
