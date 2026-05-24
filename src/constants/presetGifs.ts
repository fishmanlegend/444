import { type ImageCategory } from './presetImages';

export const PRESET_GIFS: Array<{ id: string; source: string; categories: ImageCategory[] }> = [
  // ── Pre-existing ────────────────────────────────────────────────────────────
  { id: 'gif-academic',     source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Academic.mp4',     categories: ['Rowdy'] },
  { id: 'gif-album',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Album.mp4',        categories: ['Elegant', 'Clubby'] },
  { id: 'gif-cat',          source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Cat1.mp4',         categories: ['Cute'] },
  { id: 'gif-chill',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Chill.mp4',        categories: ['Clubby'] },
  { id: 'gif-clubby',       source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Clubby.mp4',       categories: ['Clubby'] },
  { id: 'gif-earlybird',    source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/EarlyBird.mp4',    categories: ['Elegant'] },
  { id: 'gif-gilded',       source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/gilded.mp4',       categories: ['Elegant'] },
  { id: 'gif-neonball',     source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/NeonBall2.mp4',    categories: ['Rowdy'] },
  { id: 'gif-party',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Party2.mp4',       categories: ['Cute', 'Clubby'] },
  { id: 'gif-rave',         source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Rave.mp4',         categories: ['Retro'] },
  { id: 'gif-tub',          source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/tub.mp4',          categories: ['Rowdy'] },
  { id: 'gif-squirrel',     source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Squirrel.mp4',     categories: ['Rowdy'] },

  // ── New animated covers ─────────────────────────────────────────────────────
  { id: 'gif-bogey',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Bogey.mp4',        categories: ['Rowdy'] },
  { id: 'gif-comet',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Comet.mp4',        categories: ['Retro'] },
  { id: 'gif-martini',      source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Martini.mp4',      categories: ['Elegant'] },
  { id: 'gif-zen',          source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Zen.mp4',          categories: ['Elegant'] },
  { id: 'gif-good-vibes',   source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/GoodVibes.mp4',    categories: ['Cute'] },
  { id: 'gif-challenger-m', source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/ChallengerM.mp4',  categories: ['Retro'] },
  { id: 'gif-challenger-f', source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/ChallengerF.mp4',  categories: ['Retro'] },
  { id: 'gif-y2k',          source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Y2K.mp4',          categories: ['Retro'] },
  { id: 'gif-par-tee',      source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/ParTee.mp4',       categories: ['Cute', 'Retro'] },
  { id: 'gif-sega',         source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Sega.mp4',         categories: ['Retro'] },
  { id: 'gif-swingers',     source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Swingers.mp4',     categories: ['Rowdy', 'Clubby'] },
  { id: 'gif-players',      source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Players.mp4',      categories: ['Rowdy', 'Clubby'] },
  { id: 'gif-disco',        source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Disco.mp4',        categories: ['Clubby'] },
  { id: 'gif-duck',         source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Duck.mp4',         categories: ['Cute'] },
  { id: 'gif-pipe',         source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Pipe.mp4',         categories: ['Elegant'] },
  { id: 'gif-green-heart',  source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/GreenHeart.mp4',   categories: ['Cute'] },
  { id: 'gif-skirts',       source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Skirts.mp4',       categories: ['Elegant'] },
  { id: 'gif-cellphone',    source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/CellPhone.mp4',    categories: ['Cute'] },
  { id: 'gif-car',          source: 'https://uvqiteikxcjflakxrltv.supabase.co/storage/v1/object/public/gifs/gifs/Car.mp4',          categories: ['Retro'] },
];
