import { type ImageCategory } from './presetImages';

export const PRESET_GIFS: Array<{ id: string; source: number; categories: ImageCategory[] }> = [
  // ── Pre-existing ────────────────────────────────────────────────────────────
  { id: 'gif-academic',     source: require('../assets/gifs/Academic.mp4'),     categories: ['Rowdy'] },
  { id: 'gif-album',        source: require('../assets/gifs/Album.mp4'),        categories: ['Elegant', 'Clubby'] },
  { id: 'gif-cat',          source: require('../assets/gifs/Cat1.mp4'),         categories: ['Cute'] },
  { id: 'gif-chill',        source: require('../assets/gifs/Chill.mp4'),        categories: ['Clubby'] },
  { id: 'gif-clubby',       source: require('../assets/gifs/Clubby.mp4'),       categories: ['Clubby'] },
  { id: 'gif-earlybird',    source: require('../assets/gifs/EarlyBird.mp4'),    categories: ['Elegant'] },
  { id: 'gif-gilded',       source: require('../assets/gifs/gilded.mp4'),       categories: ['Elegant'] },
  { id: 'gif-neonball',     source: require('../assets/gifs/NeonBall2.mp4'),    categories: ['Rowdy'] },
  { id: 'gif-party',        source: require('../assets/gifs/Party2.mp4'),       categories: ['Cute', 'Clubby'] },
  { id: 'gif-rave',         source: require('../assets/gifs/Rave.mp4'),         categories: ['Retro'] },
  { id: 'gif-tub',          source: require('../assets/gifs/tub.mp4'),          categories: ['Rowdy'] },
  { id: 'gif-squirrel',     source: require('../assets/gifs/Squirrel.mp4'),     categories: ['Rowdy'] },

  // ── New animated covers ─────────────────────────────────────────────────────
  { id: 'gif-bogey',        source: require('../assets/gifs/Bogey.mp4'),        categories: ['Rowdy'] },
  { id: 'gif-comet',        source: require('../assets/gifs/Comet.mp4'),        categories: ['Retro'] },
  { id: 'gif-martini',      source: require('../assets/gifs/Martini.mp4'),      categories: ['Elegant'] },
  { id: 'gif-zen',          source: require('../assets/gifs/Zen.mp4'),          categories: ['Elegant'] },
  { id: 'gif-good-vibes',   source: require('../assets/gifs/GoodVibes.mp4'),    categories: ['Cute'] },
  { id: 'gif-challenger-m', source: require('../assets/gifs/ChallengerM.mp4'),  categories: ['Retro'] },
  { id: 'gif-challenger-f', source: require('../assets/gifs/ChallengerF.mp4'),  categories: ['Retro'] },
  { id: 'gif-y2k',          source: require('../assets/gifs/Y2K.mp4'),          categories: ['Retro'] },
  { id: 'gif-par-tee',      source: require('../assets/gifs/ParTee.mp4'),       categories: ['Cute', 'Retro'] },
  { id: 'gif-sega',         source: require('../assets/gifs/Sega.mp4'),         categories: ['Retro'] },
  { id: 'gif-swingers',     source: require('../assets/gifs/Swingers.mp4'),     categories: ['Rowdy', 'Clubby'] },
  { id: 'gif-players',      source: require('../assets/gifs/Players.mp4'),      categories: ['Rowdy', 'Clubby'] },
  { id: 'gif-disco',        source: require('../assets/gifs/Disco.mp4'),        categories: ['Clubby'] },
  { id: 'gif-duck',         source: require('../assets/gifs/Duck.mp4'),         categories: ['Cute'] },
  { id: 'gif-pipe',         source: require('../assets/gifs/Pipe.mp4'),         categories: ['Elegant'] },
  { id: 'gif-green-heart',  source: require('../assets/gifs/GreenHeart.mp4'),   categories: ['Cute'] },
  { id: 'gif-skirts',       source: require('../assets/gifs/Skirts.mp4'),       categories: ['Elegant'] },
  { id: 'gif-cellphone',    source: require('../assets/gifs/CellPhone.mp4'),    categories: ['Cute'] },
  { id: 'gif-car',          source: require('../assets/gifs/Car.mp4'),          categories: ['Retro'] },
];
