import * as AuthSession from 'expo-auth-session';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, ImageBackground, KeyboardAvoidingView, Platform } from 'react-native';
import { authApi } from '../services/backend';
import { GOOGLE_DISCOVERY, getGoogleClientId, getGoogleRedirectUri } from '../services/googleAuth';

type AuthMode = 'login' | 'register' | 'verify' | 'recover';
type RecoverStage = 'request' | 'confirm';

type Props = {
  onAuthenticated: () => void;
};

const TRAVEL_BG = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1000';

const AuthEntryScreen = ({ onAuthenticated }: Props) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [recoverStage, setRecoverStage] = useState<RecoverStage>('request');
  const [loading, setLoading] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const googleClientId = useMemo(() => getGoogleClientId(), []);
  const googleRedirectUri = useMemo(() => getGoogleRedirectUri(), []);
  const googleNonce = useMemo(
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    []
  );
  const emailValue = email.trim().toLowerCase();
  const passwordValue = password.trim();
  const usernameValue = username.trim();
  const otpValue = otp.trim();
  const newPasswordValue = newPassword.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(emailValue);
  const isPasswordValid = passwordValue.length >= 6;
  const isUsernameValid = usernameValue.length >= 2;
  const isOtpValid = /^\d{6}$/.test(otpValue);
  const isNewPasswordValid = newPasswordValue.length >= 6;
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
      setFormMessage('');
      await fn();
    } catch (error: any) {
      const message = error?.message || 'Request failed';
      setFormMessage(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () =>
    run(async () => {
      if (!emailValue) {
        throw new Error('Email is required.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }
      if (!passwordValue) {
        throw new Error('Password is required.');
      }
      await authApi.login({
        email: emailValue,
        password: passwordValue,
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
      if (!emailValue) {
        throw new Error('Email is required.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }
      if (!usernameValue) {
        throw new Error('Username is required.');
      }
      if (!isUsernameValid) {
        throw new Error('Username must be at least 2 characters.');
      }
      if (!passwordValue) {
        throw new Error('Password is required.');
      }
      if (!isPasswordValid) {
        throw new Error('Password must be at least 6 characters.');
      }
      await authApi.register({
        username: usernameValue || undefined,
        email: emailValue,
        password: passwordValue,
      });
      setMode('verify');
      setRecoverStage('request');
      Alert.alert('Success', 'Registration successful. Please enter OTP sent to your email.');
    });

  const handleVerifyOtp = () =>
    run(async () => {
      if (!emailValue) {
        throw new Error('Email is required.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }
      if (!isOtpValid) {
        throw new Error('OTP must be 6 digits.');
      }
      await authApi.verifyOtp({
        email: emailValue,
        otp: otpValue,
      });
      Alert.alert('Success', 'Verification successful. You can now login.');
      setMode('login');
    });

  const resendOtp = () =>
    run(async () => {
      if (!emailValue) {
        throw new Error('Email is required to resend OTP.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }
      await authApi.resendVerificationOtp(emailValue);
      Alert.alert('Sent', 'OTP has been resent.');
    });

  const handleSendRecoveryEmail = () =>
    run(async () => {
      if (!emailValue) {
        throw new Error('Email is required to recover your password.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }

      await authApi.forgotPassword(emailValue);
      setRecoverStage('confirm');
      setFormMessage('Recovery email sent. Check your inbox for the OTP/code, then enter a new password.');
    });

  const handleResetPassword = () =>
    run(async () => {
      if (!emailValue) {
        throw new Error('Email is required.');
      }
      if (!isEmailValid) {
        throw new Error('Email format is invalid.');
      }
      if (!isOtpValid) {
        throw new Error('OTP must be 6 digits.');
      }
      if (!isNewPasswordValid) {
        throw new Error('New password must be at least 6 characters.');
      }

      await authApi.resetPassword({
        email: emailValue,
        otp: otpValue,
        newPassword: newPasswordValue,
      });
      setMode('login');
      setRecoverStage('request');
      setOtp('');
      setNewPassword('');
      setFormMessage('Password reset successful. You can sign in now.');
    });

  return (
    <ImageBackground source={{ uri: TRAVEL_BG }} style={styles.backgroundImage}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>ExploreEase</Text>
          <Text style={styles.subtitle}>Unlock the world. Sign in to continue.</Text>

          <View style={styles.modeRow}>
            {(['login', 'register', 'verify', 'recover'] as AuthMode[]).map((item) => (
              <Pressable
                key={item}
                style={[styles.modeButton, mode === item && styles.modeButtonActive]}
                onPress={() => {
                  setMode(item);
                  setFormMessage('');
                  if (item !== 'recover') {
                    setRecoverStage('request');
                  }
                }}
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
            onChangeText={(value) => {
              setFormMessage('');
              setEmail(value);
            }}
            autoComplete="email"
            textContentType="emailAddress"
          />
          {!email.trim() || isEmailValid ? null : <Text style={styles.inlineError}>Email format is invalid.</Text>}

          {mode === 'register' ? (
            <View>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#a0abc0"
                autoCapitalize="none"
                value={username}
                onChangeText={(value) => {
                  setFormMessage('');
                  setUsername(value);
                }}
              />
              {!username.trim() || isUsernameValid ? null : <Text style={styles.inlineError}>Username must be at least 2 characters.</Text>}
            </View>
          ) : null}

          {mode === 'verify' ? (
            <TextInput
              style={styles.input}
              placeholder="OTP (6 digits)"
              placeholderTextColor="#a0abc0"
              keyboardType="number-pad"
              value={otp}
              onChangeText={(value) => {
                setFormMessage('');
                setOtp(value);
              }}
              autoComplete="one-time-code"
            />
          ) : mode === 'recover' ? (
            <>
              <Text style={styles.subtitle}>
                {recoverStage === 'request'
                  ? 'Enter your email to receive a recovery code.'
                  : 'Enter the recovery code and set a new password.'}
              </Text>
              {recoverStage === 'confirm' ? (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="OTP (6 digits)"
                    placeholderTextColor="#a0abc0"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={(value) => {
                      setFormMessage('');
                      setOtp(value);
                    }}
                    autoComplete="one-time-code"
                  />
                  {!otp.trim() || isOtpValid ? null : <Text style={styles.inlineError}>OTP must be 6 digits.</Text>}
                </View>
              ) : null}

              {recoverStage === 'confirm' ? (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    placeholderTextColor="#a0abc0"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={(value) => {
                      setFormMessage('');
                      setNewPassword(value);
                    }}
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />
                  {!newPassword.trim() || isNewPasswordValid ? null : (
                    <Text style={styles.inlineError}>New password must be at least 6 characters.</Text>
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#a0abc0"
              secureTextEntry
              value={password}
              onChangeText={(value) => {
                setFormMessage('');
                setPassword(value);
              }}
              autoComplete="password"
              textContentType="password"
            />
          )}

          {mode !== 'verify' && mode !== 'recover' && password.trim() && !isPasswordValid ? (
            <Text style={styles.inlineError}>Password must be at least 6 characters.</Text>
          ) : null}

          {formMessage ? <Text style={styles.formMessage}>{formMessage}</Text> : null}

          {mode === 'login' ? (
            <Pressable style={[styles.primaryButton, (!isEmailValid || !password.trim() || loading) && styles.disabled]} disabled={!isEmailValid || !password.trim() || loading} onPress={handleLogin}>
              <Text style={styles.primaryText}>{loading ? 'Authenticating...' : 'Sign In'}</Text>
            </Pressable>
          ) : null}

          {mode === 'register' ? (
            <Pressable
              style={[styles.primaryButton, (!isEmailValid || !isUsernameValid || !isPasswordValid || loading) && styles.disabled]}
              disabled={!isEmailValid || !isUsernameValid || !isPasswordValid || loading}
              onPress={handleRegister}
            >
              <Text style={styles.primaryText}>{loading ? 'Registering...' : 'Create Account'}</Text>
            </Pressable>
          ) : null}

          {mode === 'verify' ? (
            <>
              <Pressable
                style={[styles.primaryButton, (!isEmailValid || !isOtpValid || loading) && styles.disabled]}
                disabled={!isEmailValid || !isOtpValid || loading}
                onPress={handleVerifyOtp}
              >
                <Text style={styles.primaryText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
              </Pressable>
              <Pressable style={[styles.ghostButton, loading && styles.disabled]} disabled={loading} onPress={resendOtp}>
                <Text style={styles.ghostText}>Resend OTP</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'recover' ? (
            <>
              {recoverStage === 'request' ? (
                <Pressable
                  style={[styles.primaryButton, (!isEmailValid || loading) && styles.disabled]}
                  disabled={!isEmailValid || loading}
                  onPress={handleSendRecoveryEmail}
                >
                  <Text style={styles.primaryText}>{loading ? 'Sending...' : 'Send Recovery Email'}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primaryButton, (!isEmailValid || !isOtpValid || !isNewPasswordValid || loading) && styles.disabled]}
                  disabled={!isEmailValid || !isOtpValid || !isNewPasswordValid || loading}
                  onPress={handleResetPassword}
                >
                  <Text style={styles.primaryText}>{loading ? 'Resetting...' : 'Reset Password'}</Text>
                </Pressable>
              )}

              <Pressable style={[styles.ghostButton, loading && styles.disabled]} disabled={loading} onPress={() => setMode('login')}>
                <Text style={styles.ghostText}>Back to Login</Text>
              </Pressable>
            </>
          ) : null}

          {mode !== 'verify' && mode !== 'recover' ? (
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

          {mode === 'login' ? (
            <Pressable onPress={() => {
              setMode('recover');
              setRecoverStage('request');
              setFormMessage('');
            }}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
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
  inlineError: {
    color: '#fca5a5',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
  },
  formMessage: {
    color: '#bfdbfe',
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    borderColor: 'rgba(59, 130, 246, 0.28)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  forgotText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

export default AuthEntryScreen;
