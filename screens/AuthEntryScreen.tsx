import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { authApi } from '../services/backend';

type AuthMode = 'login' | 'register' | 'verify';

type Props = {
  onAuthenticated: () => void;
};

const AuthEntryScreen = ({ onAuthenticated }: Props) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');

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
        throw new Error('Nhập email và password');
      }
      await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });
      onAuthenticated();
    });

  const handleRegister = () =>
    run(async () => {
      if (!email.trim() || !password.trim()) {
        throw new Error('Nhập email và password');
      }
      await authApi.register({
        username: username.trim() || undefined,
        email: email.trim().toLowerCase(),
        password,
      });
      setMode('verify');
      Alert.alert('Success', 'Đăng ký thành công. Vui lòng nhập OTP trong email.');
    });

  const handleVerifyOtp = () =>
    run(async () => {
      if (!email.trim() || !otp.trim()) {
        throw new Error('Nhập email và OTP');
      }
      await authApi.verifyOtp({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });
      Alert.alert('Success', 'Xác thực thành công. Bạn có thể đăng nhập.');
      setMode('login');
    });

  const resendOtp = () =>
    run(async () => {
      if (!email.trim()) {
        throw new Error('Nhập email để gửi lại OTP');
      }
      await authApi.resendVerificationOtp(email.trim().toLowerCase());
      Alert.alert('Sent', 'OTP đã được gửi lại.');
    });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>ExploreEase</Text>
        <Text style={styles.subtitle}>Vui lòng đăng nhập hoặc đăng ký để tiếp tục.</Text>

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
          placeholder="Email"
          placeholderTextColor="#7a8693"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {mode === 'register' ? (
          <TextInput
            style={styles.input}
            placeholder="Username (optional)"
            placeholderTextColor="#7a8693"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        ) : null}

        {mode === 'verify' ? (
          <TextInput
            style={styles.input}
            placeholder="OTP (6 digits)"
            placeholderTextColor="#7a8693"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
          />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#7a8693"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        )}

        {mode === 'login' ? (
          <Pressable style={[styles.primaryButton, loading && styles.disabled]} disabled={loading} onPress={handleLogin}>
            <Text style={styles.primaryText}>{loading ? 'Loading...' : 'Login'}</Text>
          </Pressable>
        ) : null}

        {mode === 'register' ? (
          <Pressable
            style={[styles.primaryButton, loading && styles.disabled]}
            disabled={loading}
            onPress={handleRegister}
          >
            <Text style={styles.primaryText}>{loading ? 'Loading...' : 'Register'}</Text>
          </Pressable>
        ) : null}

        {mode === 'verify' ? (
          <>
            <Pressable
              style={[styles.primaryButton, loading && styles.disabled]}
              disabled={loading}
              onPress={handleVerifyOtp}
            >
              <Text style={styles.primaryText}>{loading ? 'Loading...' : 'Verify OTP'}</Text>
            </Pressable>
            <Pressable style={[styles.ghostButton, loading && styles.disabled]} disabled={loading} onPress={resendOtp}>
              <Text style={styles.ghostText}>Resend OTP</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f5f5f5',
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: 13,
    color: '#9a9a9a',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  modeButton: {
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
  },
  modeButtonActive: {
    borderColor: '#f5f5f5',
    backgroundColor: '#2b2b2b',
  },
  modeButtonText: {
    color: '#aaaaaa',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f5f5f5',
    backgroundColor: '#171717',
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    paddingVertical: 11,
    marginTop: 4,
  },
  primaryText: {
    color: '#0b0b0b',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343434',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#171717',
  },
  ghostText: {
    color: '#d1d1d1',
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
});

export default AuthEntryScreen;
