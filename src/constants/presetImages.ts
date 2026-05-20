export type ImageCategory = 'Elegant' | 'Rowdy' | 'Cute' | 'Retro' | 'Clubby';

export interface PresetImage {
  id: string;
  source: number;
  categories: ImageCategory[];
  tags: string[];
}

export const PRESET_IMAGES: PresetImage[] = [
  { id: 'vintage',       source: require('../assets/covers/1920s.jpg'),                                              categories: ['Elegant'],           tags: ['1920s', 'vintage', 'old', 'classic', 'sepia', 'historical', 'black white'] },
  { id: 'academic',      source: require('../assets/covers/Academic.jpg'),                                           categories: ['Rowdy'],             tags: ['preppy', 'collegiate', 'ivy league', 'academic', 'campus', 'school'] },
  { id: 'album',         source: require('../assets/covers/Album.jpg'),                                              categories: ['Elegant', 'Clubby'], tags: ['album', 'music', 'record', 'vinyl', 'cover art'] },
  { id: 'bogeys-brews',  source: require('../assets/covers/Bogey-brews2.png'),                                       categories: ['Rowdy'],             tags: ['beer', 'drinks', 'bar', 'bogey', 'brew', 'pub'] },
  { id: 'cat',           source: require('../assets/covers/Cat1.jpg'),                                               categories: ['Cute'],              tags: ['cat', 'animal', 'pet', 'kitten', 'feline'] },
  { id: 'chill',         source: require('../assets/covers/Chillv2.jpg'),                                            categories: ['Clubby'],            tags: ['chill', 'relax', 'laid back', 'casual', 'vibes', 'easy'] },
  { id: 'build-char',    source: require('../assets/covers/Build-Character.jpg'),                                    categories: ['Rowdy'],             tags: ['character', 'fun', 'humor', 'motivation', 'funny', 'spirited'] },
  { id: 'dog',           source: require('../assets/covers/Dog.jpg'),                                                categories: ['Cute'],              tags: ['dog', 'animal', 'pet', 'puppy', 'pup', 'canine'] },
  { id: 'dressy',        source: require('../assets/covers/Dressy.jpg'),                                             categories: ['Cute'],              tags: ['dressy', 'formal', 'fancy', 'fashion', 'outfit', 'style', 'dressed up'] },
  { id: 'earlybird',     source: require('../assets/covers/Early bird.jpg'),                                         categories: ['Elegant'],           tags: ['early', 'morning', 'sunrise', 'dawn', 'bird', 'am'] },
  { id: '1899',          source: require('../assets/covers/1899.jpg'),                                               categories: ['Elegant'],           tags: ['1899', 'vintage', 'old', 'historical', 'classic', '19th century'] },
  { id: 'goop',          source: require('../assets/covers/Goop.jpg'),                                               categories: ['Elegant'],           tags: ['wellness', 'lifestyle', 'fancy', 'chic', 'luxury', 'spa', 'clean'] },
  { id: 'irons',         source: require('../assets/covers/Irons.jpg'),                                              categories: ['Rowdy'],             tags: ['irons', 'clubs', 'equipment', 'bag', 'gear', 'set'] },
  { id: 'martini',       source: require('../assets/covers/Martini2.jpg'),                                           categories: ['Elegant'],           tags: ['martini', 'cocktail', 'drink', 'bar', 'olive', 'gin', 'classy'] },
  { id: 'nightbird',     source: require('../assets/covers/night bird 2.jpg'),                                       categories: ['Clubby'],            tags: ['night', 'dark', 'evening', 'moody', 'bird', 'nightlife'] },
  { id: 'rave',          source: require('../assets/covers/Rave.jpg'),                                               categories: ['Retro'],             tags: ['rave', 'party', 'neon', 'lights', 'dance', 'night', 'electric'] },
  { id: 'squirrel',      source: require('../assets/covers/Squirrel.jpg'),                                           categories: ['Rowdy'],             tags: ['squirrel', 'animal', 'funny', 'nature', 'humor', 'creature'] },
  { id: 'zen',           source: require('../assets/covers/Zen.jpg'),                                                categories: ['Elegant'],           tags: ['zen', 'calm', 'peaceful', 'serene', 'meditation', 'quiet', 'nature'] },
  { id: 'golfbash',      source: require('../assets/covers/Golf Bash.jpg'),                                          categories: ['Retro'],             tags: ['bash', 'party', 'celebration', 'social', 'fun', 'event'] },
  { id: 'tub',           source: require('../assets/covers/tub.jpg'),                                                categories: ['Rowdy'],             tags: ['hot tub', 'jacuzzi', 'party', 'fun', 'wild', 'pool'] },
  { id: 'y2k',           source: require('../assets/covers/y2k.jpg'),                                                categories: ['Retro'],             tags: ['y2k', '2000s', 'millennium', 'nostalgia', 'chrome', 'futuristic'] },
  { id: 'neonball',      source: require('../assets/covers/Neon ball 2.jpg'),                                        categories: ['Rowdy'],             tags: ['neon', 'glow', 'electric', 'bright', 'colorful', 'night'] },
  { id: 'challenger-f',  source: require('../assets/covers/ChatGPT Image May 17, 2026 at 04_46_31 PM.jpg'),         categories: ['Retro'],             tags: ['space', 'astronaut', 'retro futurism', 'sci-fi', 'stars', 'woman'] },
  { id: 'challenger-m',  source: require('../assets/covers/ChatGPT Image May 17, 2026 at 04_41_50 PM.jpg'),         categories: ['Retro'],             tags: ['space', 'astronaut', 'retro futurism', 'sci-fi', 'stars', 'man'] },
  { id: 'comet',         source: require('../assets/covers/Comet.jpg'),                                              categories: ['Retro'],             tags: ['comet', 'space', 'stars', 'cosmic', 'orbit', 'galaxy'] },
  { id: 'yips',          source: require('../assets/covers/Yips.jpg'),                                               categories: ['Cute'],              tags: ['yips', 'nervous', 'stress', 'funny', 'relatable', 'anxiety', 'pressure'] },
  { id: 'scramble',      source: require('../assets/covers/Scramble.jpg'),                                           categories: ['Cute'],              tags: ['scramble', 'team', 'group', 'fun', 'friends', 'foursome'] },
  { id: 'partee',        source: require('../assets/covers/Party 2.jpg'),                                            categories: ['Cute', 'Clubby'],    tags: ['party', 'celebration', 'fun', 'social', 'par-tee', 'festive'] },
  { id: 'grandma',       source: require('../assets/covers/Grandma2.jpg'),                                           categories: ['Cute'],              tags: ['grandma', 'granny', 'funny', 'humor', 'elderly', 'old lady', 'meme'] },
  { id: 'leyendecker',   source: require('../assets/covers/Leyendecker2.jpg'),                                       categories: ['Elegant'],           tags: ['illustration', 'painting', 'vintage', 'art', 'deco', 'golden age', 'poster'] },
  { id: 'gilded',        source: require('../assets/covers/Gilded.jpg'),                                             categories: ['Elegant'],           tags: ['gilded', 'gold', 'luxury', 'opulent', 'wealthy', 'fancy', 'rich'] },
  { id: 'good-vibes',    source: require('../assets/covers/Good-Vibes.jpg'),                                         categories: ['Cute'],              tags: ['vibes', 'happy', 'colorful', 'positive', 'fun', 'bright'] },
  { id: 'dim-sum',       source: require('../assets/covers/Dim-Sum.png'),                                            categories: ['Cute', 'Rowdy'],     tags: ['dim sum', 'chinese', 'food', 'asian', 'dumpling', 'brunch', 'restaurant'] },
  { id: 'hangout-sesh',  source: require('../assets/covers/Hangout-sesh2.png'),                                       categories: ['Cute', 'Clubby'],    tags: ['hangout', 'friends', 'social', 'casual', 'session', 'group', 'crew'] },
  { id: 'moonshot',      source: require('../assets/covers/Moonshot.png'),                                           categories: ['Retro', 'Rowdy'],    tags: ['moon', 'space', 'lunar', 'cosmic', 'astronaut', 'orbit'] },
  { id: 'not-again',     source: require('../assets/covers/Not-Again.png'),                                          categories: ['Cute', 'Rowdy'],     tags: ['frustrated', 'funny', 'humor', 'relatable', 'fail', 'oops', 'meme'] },
  { id: 'manga',         source: require('../assets/covers/Manga.png'),                                              categories: ['Retro', 'Rowdy'],    tags: ['manga', 'anime', 'japanese', 'comic', 'cartoon', 'illustrated'] },
  { id: 'brunch',        source: require('../assets/covers/Brunch.png'),                                             categories: ['Cute', 'Clubby'],    tags: ['brunch', 'food', 'morning', 'social', 'mimosa', 'eggs', 'restaurant'] },
  { id: 'western',       source: require('../assets/covers/Western2.png'),                                            categories: ['Rowdy', 'Retro'],    tags: ['western', 'cowboy', 'wild west', 'country', 'rodeo', 'hat'] },
  { id: 'balloon-golfer',source: require('../assets/covers/Balloon-Golfer.png'),                                     categories: ['Elegant', 'Clubby'], tags: ['balloon', 'sculpture', 'art', 'museum', 'colorful', 'shiny', 'contemporary', 'koons'] },
  { id: 'cubist',        source: require('../assets/covers/Cubist.png'),                                             categories: ['Elegant', 'Retro'],  tags: ['cubist', 'picasso', 'art', 'abstract', 'painting', 'geometric', 'portrait'] },
  { id: 'bauhaus',       source: require('../assets/covers/Bauhaus.png'),                                            categories: ['Retro', 'Elegant'],  tags: ['bauhaus', 'design', 'geometric', 'poster', 'minimal', 'german', 'typography'] },
  { id: 'stick-figures', source: require('../assets/covers/Stick-Figures.png'),                                      categories: ['Cute'],              tags: ['stick figure', 'drawing', 'simple', 'friends', 'foursome', 'group', 'sketch'] },
  { id: 'just-golf',     source: require('../assets/covers/Just-Golf.png'),                                          categories: ['Rowdy', 'Retro'],    tags: ['simple', 'bold', 'text', 'minimal', 'lime', 'green', 'typography', 'word'] },
  { id: 'may-the-course',source: require('../assets/covers/May-The-Course.png'),                                     categories: ['Rowdy'],             tags: ['star wars', 'jedi', 'lightsaber', 'movie', 'parody', 'funny', 'force', 'nerd', 'space'] },
  { id: 'cocktails',     source: require('../assets/covers/Cocktails.png'),                                          categories: ['Elegant', 'Clubby'], tags: ['cocktail', 'martini', 'drink', 'bar', 'old fashioned', 'whiskey', 'date night'] },
  { id: 'disco-golf',    source: require('../assets/covers/Disco2.png'),                                         categories: ['Retro', 'Clubby'],   tags: ['disco', 'dance', '70s', 'mirror ball', 'nightclub', 'party', 'groovy', 'funky'] },
  { id: 'stonks',        source: require('../assets/covers/Stonks.png'),                                             categories: ['Rowdy'],             tags: ['stonks', 'meme', 'stocks', 'market', 'finance', 'wall street', 'funny', 'viral', 'trading'] },
  { id: 'mahjong',       source: require('../assets/covers/Mahjong.png'),                                            categories: ['Cute', 'Clubby'],    tags: ['mahjong', 'tiles', 'chinese', 'game', 'asian', 'green felt', 'table'] },
  { id: 'hello-birdie',  source: require('../assets/covers/Hello-Birdie.png'),                                       categories: ['Cute'],              tags: ['bird', 'birdie', 'chicken', 'cute', 'pink', 'japanese', 'kawaii', 'fluffy', 'chick'] },
  { id: 'baggy-back',   source: require('../assets/covers/Baggy-Back.png'),                                         categories: ['Rowdy', 'Retro'],    tags: ['baggy', 'pants', 'fashion', 'style', 'vintage', 'retro', 'wide leg', 'trousers', '90s'] },
  // Uncomment once files are saved to src/assets/covers/
  // { id: 'par-tee',      source: require('../assets/covers/Par-Tee.png'),              categories: ['Cute', 'Retro'],    tags: [] },
  // { id: 'golf-q',       source: require('../assets/covers/Golf-Question.png'),        categories: ['Rowdy'],            tags: [] },
  // { id: 'tee-time',     source: require('../assets/covers/Tee-Time-Medieval.png'),    categories: ['Elegant', 'Rowdy'], tags: [] },
  // { id: 'heritage',     source: require('../assets/covers/Heritage.png'),             categories: ['Elegant'],          tags: [] },
];

export const DEFAULT_COVER = PRESET_IMAGES.find((img) => img.id === 'grandma')!.source;
