import { Clipboard } from 'react-native';

export async function readClipboard(): Promise<string> {
  try {
    return (await Clipboard.getString()) || '';
  } catch {
    return '';
  }
}

export function writeClipboard(text: string) {
  Clipboard.setString(text);
}
