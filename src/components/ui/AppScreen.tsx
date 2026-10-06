import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout } from '../../theme/tokens';

export type AppScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  maxWidth?: number;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
};

export function AppScreen({ children, scroll = false, contentContainerStyle, style, maxWidth = layout.contentMaxWidth, edges, }: AppScreenProps) {
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= layout.breakpoints.tablet ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const contentStyle = [styles.content, { maxWidth, paddingHorizontal: horizontalPadding }, contentContainerStyle];

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]}>
      {scroll ? (
        <ScrollView style={styles.fill} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1, width: '100%' },
  content: { width: '100%', alignSelf: 'center' },
});
