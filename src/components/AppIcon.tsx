import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform } from 'react-native';

// Maps SF Symbol names → Ionicons equivalents for Android
const ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  'house':                   'home-outline',
  'house.fill':              'home',
  'person.2':                'people-outline',
  'person.2.fill':           'people',
  'person':                  'person-outline',
  'person.fill':             'person',
  'ellipsis.message.fill':   'chatbubble-ellipses',
  'flag.fill':               'flag',
  'pencil':                  'pencil',
  'message.fill':            'chatbubble',
};

export function AppIcon({ name, size, tintColor }: {
  name: string;
  size: number;
  tintColor: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={name as any} size={size} tintColor={tintColor} type="monochrome" />;
  }
  const ioniconName = ICON_MAP[name] ?? 'help-circle-outline';
  return <Ionicons name={ioniconName} size={size} color={tintColor} />;
}
