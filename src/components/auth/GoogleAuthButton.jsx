import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

const CONTINUE_ASSET = {
  source: require('../../assets/images/google_continue.png'),
  aspectRatio: 597 / 132,
};

const SIGNUP_ASSET = {
  source: require('../../assets/images/google_signup.png'),
  aspectRatio: 567 / 132,
};

export const GoogleAuthButton = ({
  mode = 'continue',
  onPress,
  disabled = false,
  loading = false,
  style,
}) => {
  const asset = mode === 'signup' ? SIGNUP_ASSET : CONTINUE_ASSET;
  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && !isInactive ? styles.buttonPressed : null,
        isInactive ? styles.buttonDisabled : null,
      ]}
    >
      <View style={styles.imageWrap}>
        <Image
          source={asset.source}
          resizeMode="contain"
          style={[styles.image, { aspectRatio: asset.aspectRatio }]}
        />

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#1f1f1f" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.68,
  },
  imageWrap: {
    width: '100%',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: undefined,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    borderRadius: 999,
  },
});
