import { Injectable } from '@nestjs/common';

const ADJECTIVES: readonly string[] = [
  'Agile', 'Airy', 'Alert', 'Amber', 'Ancient', 'Attentive', 'Austere',
  'Balanced', 'Bare', 'Blithe', 'Bold', 'Brave', 'Breezy', 'Bright', 'Brisk',
  'Calm', 'Candid', 'Careful', 'Casual', 'Certain', 'Cheerful', 'Chilly',
  'Civil', 'Clear', 'Clever', 'Compact', 'Cool', 'Crafty', 'Crisp', 'Curious',
  'Dainty', 'Daring', 'Dark', 'Decisive', 'Deft', 'Dense', 'Devoted',
  'Diligent', 'Direct', 'Distant', 'Dreamy', 'Dynamic',
  'Earnest', 'Earthy', 'Easy', 'Elegant', 'Elusive', 'Enduring', 'Exact',
  'Faint', 'Fair', 'Faithful', 'Fearless', 'Fervent', 'Firm', 'Fleet',
  'Fluid', 'Focused', 'Fond', 'Frank', 'Free', 'Fresh',
  'Gallant', 'Gentle', 'Gifted', 'Gilded', 'Golden', 'Graceful', 'Grand',
  'Grounded',
  'Hale', 'Hardy', 'Hazy', 'Hidden', 'High', 'Humble', 'Humid', 'Hushed',
  'Idle', 'Innocent', 'Intense', 'Intent',
  'Just',
  'Keen', 'Kind', 'Knowing',
  'Lasting', 'Lavish', 'Lean', 'Light', 'Lively', 'Lofty', 'Lone', 'Low',
  'Lucky', 'Luminous', 'Lunar', 'Lush',
  'Majestic', 'Mellow', 'Mighty', 'Mild', 'Mindful', 'Misty', 'Modest',
  'Muted', 'Mystic',
  'Narrow', 'Natural', 'Nimble', 'Noble',
  'Obscure', 'Odd', 'Old', 'Olive', 'Open', 'Orderly',
  'Pale', 'Patient', 'Peaceful', 'Plain', 'Placid', 'Precise', 'Proud',
  'Prudent', 'Pure',
  'Quick', 'Quiet',
  'Radiant', 'Rare', 'Ready', 'Reflective', 'Refined', 'Reserved',
  'Resilient', 'Resolute', 'Restful', 'Rich', 'Rosy', 'Royal', 'Rugged',
  'Rustic',
  'Sacred', 'Safe', 'Sandy', 'Savvy', 'Scarce', 'Scholarly', 'Serene',
  'Settled', 'Shadowy', 'Sharp', 'Silent', 'Simple', 'Sincere', 'Sleek',
  'Slim', 'Slow', 'Smooth', 'Sober', 'Soft', 'Solid', 'Solemn', 'Sound',
  'Spare', 'Spirited', 'Stark', 'Steady', 'Still', 'Stoic', 'Strong',
  'Subtle', 'Supple', 'Sure', 'Swift',
  'Tall', 'Taut', 'Tawny', 'Tender', 'Tested', 'Thick', 'Thorough',
  'Thoughtful', 'Timid', 'Tiny', 'Tranquil', 'True', 'Truthful',
  'Unsung', 'Upright',
  'Valiant', 'Veiled', 'Vibrant', 'Vigilant', 'Vivid',
  'Warm', 'Wary', 'Wild', 'Wise',
];

const NOUNS: readonly string[] = [
  'Acorn', 'Alder', 'Albatross', 'Aloe', 'Anchor', 'Anemone', 'Antler', 'Aspen',
  'Badger', 'Balsam', 'Bark', 'Barnacle', 'Bear', 'Beetle', 'Birch', 'Bison',
  'Bloom', 'Bluebell', 'Bluebird', 'Boar', 'Bonfire', 'Bonsai', 'Boulder',
  'Bracken', 'Bramble', 'Briar', 'Brook', 'Bulrush', 'Buttercup',
  'Canopy', 'Cardinal', 'Carp', 'Catfish', 'Cattail', 'Cedar', 'Charcoal',
  'Chestnut', 'Chipmunk', 'Cicada', 'Cinder', 'Clover', 'Cobble', 'Colt',
  'Condor', 'Coral', 'Cormorant', 'Cougar', 'Cove', 'Coyote', 'Crag',
  'Crane', 'Creek', 'Cricket', 'Crow', 'Crystal', 'Cypress',
  'Dahlia', 'Deer', 'Delta', 'Dipper', 'Dove', 'Drake', 'Dragonfly', 'Dune',
  'Eagle', 'Egret', 'Elm', 'Ember', 'Estuary',
  'Falcon', 'Fawn', 'Fern', 'Finch', 'Fjord', 'Flamingo', 'Flask',
  'Flicker', 'Flint', 'Foal', 'Fox',
  'Garnet', 'Gentian', 'Glacier', 'Glen', 'Gopher', 'Grackle', 'Granite',
  'Grouse', 'Grove', 'Gull',
  'Harbor', 'Hare', 'Hawk', 'Hawthorn', 'Heather', 'Hemlock', 'Heron',
  'Hornbeam', 'Hound', 'Hummingbird',
  'Ibis', 'Island', 'Ivy',
  'Jackdaw', 'Jaguar', 'Jay', 'Juniper',
  'Kettle', 'Kestrel', 'Kingfisher', 'Kite',
  'Lake', 'Lapwing', 'Lark', 'Leaf', 'Leopard', 'Lichen', 'Lily', 'Linden',
  'Linnet', 'Loam', 'Loon', 'Lotus', 'Lynx',
  'Magpie', 'Mallard', 'Mandarin', 'Maple', 'Marmot', 'Marsh', 'Marten',
  'Meadow', 'Merlin', 'Mink', 'Mole', 'Moorhen', 'Moth', 'Mound', 'Mudlark',
  'Narwhal', 'Nettle', 'Newt', 'Nightjar', 'Nutmeg', 'Nuthatch',
  'Oak', 'Orca', 'Osprey', 'Otter', 'Owl',
  'Pebble', 'Pelican', 'Peregrine', 'Petal', 'Pine', 'Pintail', 'Piper',
  'Plover', 'Plum', 'Puffin',
  'Quail', 'Quartz',
  'Rabbit', 'Raven', 'Reed', 'Ridge', 'River', 'Robin', 'Rook',
  'Sable', 'Salmon', 'Sandpiper', 'Saucer', 'Shoal', 'Shrike', 'Skylark',
  'Slate', 'Sparrow', 'Sprig', 'Spruce', 'Squirrel', 'Stag', 'Starling',
  'Stonechat', 'Stork', 'Stream', 'Summit', 'Swallow', 'Sycamore',
  'Tanager', 'Teal', 'Thistle', 'Thrush', 'Tiger', 'Toad', 'Trout',
  'Tundra', 'Turtle',
  'Vale', 'Valley', 'Vole',
  'Walnut', 'Warbler', 'Weasel', 'Willet', 'Willow', 'Wolf', 'Wren',
  'Yarrow', 'Yew',
];

const ROLES: readonly string[] = [
  'Brewer', 'Steeper', 'Barista', 'Pourer', 'Roaster',
  'Taster', 'Tender', 'Keeper', 'Warden', 'Ranger',
];

@Injectable()
export class HandleService {
  private pick<T>(arr: readonly T[], index: number): T {
    return arr[Math.abs(index) % arr.length];
  }

  generate(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const role = ROLES[Math.floor(Math.random() * ROLES.length)];
    return `${adj}${noun}${role}`;
  }

  // Deterministic fallback for reviews created before anonHandle was added.
  // Derives a stable handle from the review's UUID so it doesn't change between requests.
  fromReviewId(reviewId: string): string {
    let h = 5381;
    for (let i = 0; i < reviewId.length; i++) {
      h = ((h << 5) + h) ^ reviewId.charCodeAt(i);
      h |= 0;
    }
    const seed = Math.abs(h);
    return `${this.pick(ADJECTIVES, seed)}${this.pick(NOUNS, Math.floor(seed / ADJECTIVES.length))}${this.pick(ROLES, Math.floor(seed / (ADJECTIVES.length * NOUNS.length)))}`;
  }

  get totalCombinations(): number {
    return ADJECTIVES.length * NOUNS.length * ROLES.length;
  }

  get sampleHandles(): string[] {
    return Array.from({ length: 3 }, () => this.generate());
  }
}
