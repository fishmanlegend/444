export type ImageCategory = 'Elegant' | 'Rowdy' | 'Cute' | 'Retro' | 'Clubby';

export interface PresetImage {
  id: string;
  source: string;
  categories: ImageCategory[];
  tags: string[];
}

const CDN = 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/covers/covers';

export const PRESET_IMAGES: PresetImage[] = [
  { id: 'academic',       source: `${CDN}/Academic.jpg`,                                 categories: ['Rowdy'],             tags: ['preppy', 'collegiate', 'ivy league', 'academic', 'campus', 'school'] },
  { id: 'album',          source: `${CDN}/Album.jpg`,                                    categories: ['Elegant', 'Clubby'], tags: ['album', 'music', 'record', 'vinyl', 'cover art'] },
  { id: 'bogeys-brews',   source: `${CDN}/Bogey-brews2.jpg`,                             categories: ['Rowdy'],             tags: ['beer', 'drinks', 'bar', 'bogey', 'brew', 'pub'] },
  { id: 'cat',            source: `${CDN}/Cat1.jpg`,                                     categories: ['Cute'],              tags: ['cat', 'animal', 'pet', 'kitten', 'feline'] },
  { id: 'chill',          source: `${CDN}/Chillv2.jpg`,                                  categories: ['Clubby'],            tags: ['chill', 'relax', 'laid back', 'casual', 'vibes', 'easy'] },
  { id: 'build-char',     source: `${CDN}/Build-Character.jpg`,                          categories: ['Rowdy'],             tags: ['character', 'fun', 'humor', 'motivation', 'funny', 'spirited'] },
  { id: 'dog',            source: `${CDN}/Dog.jpg`,                                      categories: ['Cute'],              tags: ['dog', 'animal', 'pet', 'puppy', 'pup', 'canine'] },
  { id: 'dressy',         source: `${CDN}/Dressy.jpg`,                                   categories: ['Cute'],              tags: ['dressy', 'formal', 'fancy', 'fashion', 'outfit', 'style', 'dressed up'] },
  { id: 'earlybird',      source: `${CDN}/Early bird.jpg`,                               categories: ['Elegant'],           tags: ['early', 'morning', 'sunrise', 'dawn', 'bird', 'am'] },
  { id: '1899',           source: `${CDN}/1899.jpg`,                                     categories: ['Elegant'],           tags: ['1899', 'vintage', 'old', 'historical', 'classic', '19th century'] },
  { id: 'goop',           source: `${CDN}/Goop.jpg`,                                     categories: ['Elegant'],           tags: ['wellness', 'lifestyle', 'fancy', 'chic', 'luxury', 'spa', 'clean'] },
  { id: 'irons',          source: `${CDN}/Irons.jpg`,                                    categories: ['Rowdy'],             tags: ['irons', 'clubs', 'equipment', 'bag', 'gear', 'set'] },
  { id: 'martini',        source: `${CDN}/Martini2.jpg`,                                 categories: ['Elegant'],           tags: ['martini', 'cocktail', 'drink', 'bar', 'olive', 'gin', 'classy'] },
  { id: 'nightbird',      source: `${CDN}/night bird 2.jpg`,                             categories: ['Clubby'],            tags: ['night', 'dark', 'evening', 'moody', 'bird', 'nightlife'] },
  { id: 'rave',           source: `${CDN}/Rave.jpg`,                                     categories: ['Retro'],             tags: ['rave', 'party', 'neon', 'lights', 'dance', 'night', 'electric'] },
  { id: 'squirrel',       source: `${CDN}/Squirrel.jpg`,                                 categories: ['Rowdy'],             tags: ['squirrel', 'animal', 'funny', 'nature', 'humor', 'creature'] },
  { id: 'zen',            source: `${CDN}/Zen.jpg`,                                      categories: ['Elegant'],           tags: ['zen', 'calm', 'peaceful', 'serene', 'meditation', 'quiet', 'nature'] },
  { id: 'golfbash',       source: `${CDN}/Golf Bash.jpg`,                                categories: ['Retro'],             tags: ['bash', 'party', 'celebration', 'social', 'fun', 'event'] },
  { id: 'tub',            source: `${CDN}/tub.jpg`,                                      categories: ['Rowdy'],             tags: ['hot tub', 'jacuzzi', 'party', 'fun', 'wild', 'pool'] },
  { id: 'y2k',            source: `${CDN}/y2k.jpg`,                                      categories: ['Retro'],             tags: ['y2k', '2000s', 'millennium', 'nostalgia', 'chrome', 'futuristic'] },
  { id: 'neonball',       source: `${CDN}/Neon ball 2.jpg`,                              categories: ['Rowdy'],             tags: ['neon', 'glow', 'electric', 'bright', 'colorful', 'night'] },
  { id: 'challenger-f',   source: `${CDN}/ChatGPT Image May 17, 2026 at 04_46_31 PM.jpg`, categories: ['Retro'],           tags: ['space', 'astronaut', 'retro futurism', 'sci-fi', 'stars', 'woman'] },
  { id: 'challenger-m',   source: `${CDN}/ChatGPT Image May 17, 2026 at 04_41_50 PM.jpg`, categories: ['Retro'],           tags: ['space', 'astronaut', 'retro futurism', 'sci-fi', 'stars', 'man'] },
  { id: 'comet',          source: `${CDN}/Comet.jpg`,                                    categories: ['Retro'],             tags: ['comet', 'space', 'stars', 'cosmic', 'orbit', 'galaxy'] },
  { id: 'yips',           source: `${CDN}/Yips.jpg`,                                     categories: ['Cute'],              tags: ['yips', 'nervous', 'stress', 'funny', 'relatable', 'anxiety', 'pressure'] },
  { id: 'scramble',       source: `${CDN}/Scramble.jpg`,                                 categories: ['Cute'],              tags: ['scramble', 'team', 'group', 'fun', 'friends', 'foursome'] },
  { id: 'partee',         source: `${CDN}/Party 2.jpg`,                                  categories: ['Cute', 'Clubby'],    tags: ['party', 'celebration', 'fun', 'social', 'par-tee', 'festive'] },
  { id: 'grandma',        source: `${CDN}/Grandma2.jpg`,                                 categories: ['Cute'],              tags: ['grandma', 'granny', 'funny', 'humor', 'elderly', 'old lady', 'meme'] },
  { id: 'leyendecker',    source: `${CDN}/Leyendecker2.jpg`,                             categories: ['Elegant'],           tags: ['illustration', 'painting', 'vintage', 'art', 'deco', 'golden age', 'poster'] },
  { id: 'gilded',         source: `${CDN}/Gilded.jpg`,                                   categories: ['Elegant'],           tags: ['gilded', 'gold', 'luxury', 'opulent', 'wealthy', 'fancy', 'rich'] },
  { id: 'good-vibes',     source: `${CDN}/Good-Vibes.jpg`,                               categories: ['Cute'],              tags: ['vibes', 'happy', 'colorful', 'positive', 'fun', 'bright'] },
  { id: 'dim-sum',        source: `${CDN}/Dim-Sum.jpg`,                                  categories: ['Cute', 'Rowdy'],     tags: ['dim sum', 'chinese', 'food', 'asian', 'dumpling', 'brunch', 'restaurant'] },
  { id: 'hangout-sesh',   source: `${CDN}/Hangout-sesh2.jpg`,                            categories: ['Cute', 'Clubby'],    tags: ['hangout', 'friends', 'social', 'casual', 'session', 'group', 'crew'] },
  { id: 'moonshot',       source: `${CDN}/Moonshot.jpg`,                                 categories: ['Retro', 'Rowdy'],    tags: ['moon', 'space', 'lunar', 'cosmic', 'astronaut', 'orbit'] },
  { id: 'not-again',      source: `${CDN}/Not-Again.jpg`,                                categories: ['Cute', 'Rowdy'],     tags: ['frustrated', 'funny', 'humor', 'relatable', 'fail', 'oops', 'meme'] },
  { id: 'manga',          source: `${CDN}/Manga.jpg`,                                    categories: ['Retro', 'Rowdy'],    tags: ['manga', 'anime', 'japanese', 'comic', 'cartoon', 'illustrated'] },
  { id: 'brunch',         source: `${CDN}/Brunch.jpg`,                                   categories: ['Cute', 'Clubby'],    tags: ['brunch', 'food', 'morning', 'social', 'mimosa', 'eggs', 'restaurant'] },
  { id: 'western',        source: `${CDN}/Western2.jpg`,                                 categories: ['Rowdy', 'Retro'],    tags: ['western', 'cowboy', 'wild west', 'country', 'rodeo', 'hat'] },
  { id: 'balloon-golfer', source: `${CDN}/Balloon-Golfer.jpg`,                           categories: ['Elegant', 'Clubby'], tags: ['balloon', 'sculpture', 'art', 'museum', 'colorful', 'shiny', 'contemporary', 'koons'] },
  { id: 'cubist',         source: `${CDN}/Cubist.jpg`,                                   categories: ['Elegant', 'Retro'],  tags: ['cubist', 'picasso', 'art', 'abstract', 'painting', 'geometric', 'portrait'] },
  { id: 'bauhaus',        source: `${CDN}/Bauhaus.jpg`,                                  categories: ['Retro', 'Elegant'],  tags: ['bauhaus', 'design', 'geometric', 'poster', 'minimal', 'german', 'typography'] },
  { id: 'stick-figures',  source: `${CDN}/Stick-Figures.jpg`,                            categories: ['Cute'],              tags: ['stick figure', 'drawing', 'simple', 'friends', 'foursome', 'group', 'sketch'] },
  { id: 'just-golf',      source: `${CDN}/Just-Golf.jpg`,                                categories: ['Rowdy', 'Retro'],    tags: ['simple', 'bold', 'text', 'minimal', 'lime', 'green', 'typography', 'word'] },
  { id: 'may-the-course', source: `${CDN}/May-The-Course.jpg`,                           categories: ['Rowdy'],             tags: ['star wars', 'jedi', 'lightsaber', 'movie', 'parody', 'funny', 'force', 'nerd', 'space'] },
  { id: 'cocktails',      source: `${CDN}/Cocktails.jpg`,                                categories: ['Elegant', 'Clubby'], tags: ['cocktail', 'martini', 'drink', 'bar', 'old fashioned', 'whiskey', 'date night'] },
  { id: 'disco-golf',     source: `${CDN}/Disco2.jpg`,                                   categories: ['Retro', 'Clubby'],   tags: ['disco', 'dance', '70s', 'mirror ball', 'nightclub', 'party', 'groovy', 'funky'] },
  { id: 'stonks',         source: `${CDN}/Stonks.jpg`,                                   categories: ['Rowdy'],             tags: ['stonks', 'meme', 'stocks', 'market', 'finance', 'wall street', 'funny', 'viral', 'trading'] },
  { id: 'mahjong',        source: `${CDN}/Mahjong.jpg`,                                  categories: ['Cute', 'Clubby'],    tags: ['mahjong', 'tiles', 'chinese', 'game', 'asian', 'green felt', 'table'] },
  { id: 'hello-birdie',   source: `${CDN}/Hello-Birdie.jpg`,                             categories: ['Cute'],              tags: ['bird', 'birdie', 'chicken', 'cute', 'pink', 'japanese', 'kawaii', 'fluffy', 'chick'] },
  { id: 'baggy-back',     source: `${CDN}/Baggy-Back.jpg`,                               categories: ['Rowdy', 'Retro'],    tags: ['baggy', 'pants', 'fashion', 'style', 'vintage', 'retro', 'wide leg', 'trousers', '90s'] },
  { id: 'egg-carton',     source: `${CDN}/Egg-Carton.jpg`,                               categories: ['Cute', 'Rowdy'],     tags: ['egg carton', 'golf balls', 'eggs', 'carton', 'dozen', 'funny', 'humor', 'fresh', 'illustration'] },
];

export const DEFAULT_COVER = PRESET_IMAGES.find((img) => img.id === 'grandma')!.source;
