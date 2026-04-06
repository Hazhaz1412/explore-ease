import * as AuthSession from 'expo-auth-session';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, ImageBackground, KeyboardAvoidingView, Platform } from 'react-native';
import { authApi } from '../services/backend';
import { GOOGLE_DISCOVERY, getGoogleClientId, getGoogleRedirectUri } from '../services/googleAuth';

type AuthMode = 'login' | 'register' | 'verify';

type Props = {
  onAuthenticated: () => void;
};

const TRAVEL_BG = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1000';

const AuthEntryScreen = ({ onAuthenticated }: Props) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const googleClientId = useMemo(() => getGoogleClientId(), []);
  const googleRedirectUri = useMemo(() => getGoogleRedirectUri(), []);
  const googleNonce = useMemo(
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    []
  );
  const [googleRequest, googleResponse, promptGoogleAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId || 'missing-google-client-id',
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: googleRedirectUri,
      usePKCE: false,
      extraParams: {
        nonce: googleNonce,
        prompt: 'select_account',
      },
    },
    GOOGLE_DISCOVERY
  );

  const run = async (fn: () => Promise<void>) => {
    try {
      setLoading(true);
      await fn();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () =>
    run(async () => {
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter email and password');
      }
      await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });
      onAuthenticated();
    });

  useEffect(() => {
    if (googleResponse?.type !== 'success') {
      if (googleResponse?.type === 'error') {
        const authError = (googleResponse as any)?.error;
        Alert.alert('Google Sign-In Error', authError?.message || 'Google sign-in failed');
      }
      return;
    }

    const idToken = (googleResponse as any)?.params?.id_token;
    if (!idToken) {
      Alert.alert('Google Sign-In Error', 'Google did not return an ID token.');
      return;
    }

    void run(async () => {
      await authApi.loginWithGoogle(idToken);
      onAuthenticated();
    });
  }, [googleResponse, onAuthenticated]);

  const handleGoogleLogin = async () => {
    if (!googleClientId) {
      Alert.alert(
        'Google OAuth chưa được cấu hình',
        'Hãy thêm EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID hoặc EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.'
      );
      return;
    }
    if (!googleRequest) {
      Alert.alert('Google Sign-In Error', 'Google sign-in is still initializing.');
      return;
    }

    const result = await promptGoogleAsync();
    if (result.type === 'dismiss' || result.type === 'cancel') {
      return;
    }
  };

  const handleRegister = () =>
    run(async () => {
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter email and password');
      }
      await authApi.register({
        username: username.trim() || undefined,
        email: email.trim().toLowerCase(),
        password,
      });
      setMode('verify');
      Alert.alert('Success', 'Registration successful. Please enter OTP sent to your email.');
    });

  const handleVerifyOtp = () =>
    run(async () => {
      if (!email.trim() || !otp.trim()) {
        throw new Error('Please enter email and OTP');
      }
      await authApi.verifyOtp({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });
      Alert.alert('Success', 'Verification successful. You can now login.');
      setMode('login');
    });

  const resendOtp = () =>
    run(async () => {
      if (!email.trim()) {
        throw new Error('Please enter email to resend OTP');
      }
      await authApi.resendVerificationOtp(email.trim().toLowerCase());
      Alert.alert('Sent', 'OTP has been resent.');
    });

  return (
    <ImageBackground source={{ uri: TRAVEL_BG }} style={styles.backgroundImage}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>ExploreEase</Text>
          <Text style={styles.subtitle}>Unlock the world. Sign in to continue.</Text>

          <View style={styles.modeRow}>
            {(['login', 'register', 'verify'] as AuthMode[]).map((item) => (
              <Pressable
                key={item}
                style={[styles.modeButton, mode === item && styles.modeButtonActive]}
                onPress={() => setMode(item)}
              >
                <Text style={[styles.modeButtonText, mode === item && styles.modeButtonTextActive]}>
                  {item.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#a0abc0"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          {mode === 'register' ? (
            <TextInput
              style={styles.input}
              placeholder="Username (optional)"
              placeholderTextColor="#a0abc0"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
          ) : null}

          {mode === 'verify' ? (
            <TextInput
              style={styles.input}
              placeholder="OTP (6 digits)"
              placeholderTextColor="#a0abc0"
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
            />
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#a0abc0"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          )}

          {mode === 'login' ? (
            <Pressable style={[styles.primaryButton, loading && styles.disabled]} disabled={loading} onPress={handleLogin}>
              <Text style={styles.primaryText}>{loading ? 'Authenticating...' : 'Sign In'}</Text>
            </Pressable>
          ) : null}

          {mode === 'register' ? (
            <Pressable
              style={[styles.primaryButton, loading && styles.disabled]}
              disabled={loading}
              onPress={handleRegister}
            >
              <Text style={styles.primaryText}>{loading ? 'Registering...' : 'Create Account'}</Text>
            </Pressable>
          ) : null}

          {mode === 'verify' ? (
            <>
              <Pressable
                style={[styles.primaryButton, loading && styles.disabled]}
                disabled={loading}
                onPress={handleVerifyOtp}
              >
                <Text style={styles.primaryText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
              </Pressable>
              <Pressable style={[styles.ghostButton, loading && styles.disabled]} disabled={loading} onPress={resendOtp}>
                <Text style={styles.ghostText}>Resend OTP</Text>
              </Pressable>
            </>
          ) : null}

          {mode !== 'verify' ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                style={[styles.googleButton, (loading || !googleRequest) && styles.disabled]}
                disabled={loading || !googleRequest}
                onPress={handleGoogleLogin}
              >
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)', // Dark overlay for text readability
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: 'rgba(17, 17, 17, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    fontFamily: 'monospace',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#d1d5db',
    textAlign: 'center',
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
  },
  modeButtonText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modeButtonTextActive: {
    color: '#000000',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: '#00f2fe',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: '#00f2fe',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ghostButton: {
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: '#00f2fe',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  dividerText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  googleButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    paddingVertical: 14,
  },
  googleButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.6,
  },
});

export default AuthEntryScreen;
