import { useRef } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from './Theme';
import { radius } from './tokens';

// Hidden native number-pad + visible cells. PIN is 4, TOTP is 6 — those are
// the API lengths. The old 12-key pad is gone so iOS/Android open their
// own keyboard.

export function DigitCode({
  length,
  value,
  onChange,
  onComplete,
  secure,
  autoFocus,
}: {
  length: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  secure?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  const ref = useRef<TextInput>(null);
  const digits = value.replace(/\D/g, '').slice(0, length);

  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {Array.from({ length }).map((_, i) => {
          const filled = i < digits.length;
          const active = i === digits.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 48,
                height: 56,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: active ? t.accent : filled ? t.txt : t.b1,
                backgroundColor: t.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: t.txt, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {filled ? (secure ? '•' : digits[i]) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={digits}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, '').slice(0, length);
          onChange(next);
        }}
        onSubmitEditing={() => {
          if (digits.length === length) onComplete?.(digits);
        }}
        returnKeyType="done"
        keyboardType="number-pad"
        textContentType={secure ? 'password' : 'oneTimeCode'}
        autoComplete={secure ? 'off' : 'one-time-code'}
        importantForAutofill={secure ? 'no' : 'yes'}
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={{
          position: 'absolute',
          width: '100%',
          height: 56,
          opacity: 0.02,
          color: t.txt,
        }}
        {...(Platform.OS === 'android' ? { showSoftInputOnFocus: true } : {})}
      />
    </Pressable>
  );
}
