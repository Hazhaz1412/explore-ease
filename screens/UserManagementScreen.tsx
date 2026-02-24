import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AuthSession,
  Interest,
  TravelStyle,
  authApi,
  privacyApi,
  sessionStore,
  userApi,
} from '../services/backend';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

const INTEREST_OPTIONS: Interest[] = ['FOOD', 'CULTURE', 'SHOPPING', 'NATURE', 'ADVENTURE'];
const TRAVEL_STYLE_OPTIONS: TravelStyle[] = ['solo', 'family', 'group'];
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#._-]).{8,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FONT_PRIMARY = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const defaultProfile = {
  firstName: '',
  lastName: '',
  age: '',
  gender: '',
  travelStyle: '' as TravelStyle | '',
  profilePictureUrl: '',
  interests: [] as Interest[],
  bio: '',
};

const defaultPreferences = {
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
  profileVisibility: true,
  language: 'en',
  timezone: 'UTC',
  darkMode: false,
};

const isEmail = (value: string) => EMAIL_REGEX.test(value.trim());
const isStrongPassword = (value: string) => PASSWORD_REGEX.test(value);

const UserManagementScreen = () => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(sessionStore.get());

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyOtp, setVerifyOtp] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const [googleIdToken, setGoogleIdToken] = useState('');

  const [profile, setProfile] = useState(defaultProfile);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [biometricLock, setBiometricLock] = useState(false);
  const [privacyPreview, setPrivacyPreview] = useState('');

  const loginDisabled = !loginEmail.trim() || !loginPassword;
  const registerDisabled = !registerEmail.trim() || !registerPassword;
  const verifyDisabled = !verifyEmail.trim() || !verifyOtp.trim();
  const forgotDisabled = !forgotEmail.trim();
  const resetDisabled = !resetEmail.trim() || !resetOtp.trim() || !resetPassword;

  const profileName = useMemo(() => {
    const value = `${profile.firstName} ${profile.lastName}`.trim();
    return value || session?.user.username || 'User';
  }, [profile.firstName, profile.lastName, session?.user.username]);

  useEffect(() => {
    if (!session) {
      return;
    }

    loadProfileAndPreferences();
  }, [session]);

  const run = async (action: () => Promise<void>) => {
    try {
      setLoading(true);
      await action();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const loadProfileAndPreferences = async () => {
    try {
      const [profileRes, preferencesRes] = await Promise.all([
        userApi.getProfile(),
        userApi.getPreferences(),
      ]);

      setProfile({
        firstName: profileRes?.firstName || '',
        lastName: profileRes?.lastName || '',
        age: profileRes?.age ? String(profileRes.age) : '',
        gender: profileRes?.gender || '',
        travelStyle: (profileRes?.travelStyle || '').toLowerCase() as TravelStyle | '',
        profilePictureUrl: profileRes?.profilePictureUrl || '',
        interests: Array.isArray(profileRes?.interests)
          ? profileRes.interests.filter((value) => INTEREST_OPTIONS.includes(value as Interest))
          : [],
        bio: profileRes?.bio || '',
      });

      setPreferences({
        emailNotifications: !!preferencesRes?.emailNotifications,
        pushNotifications: !!preferencesRes?.pushNotifications,
        smsNotifications: !!preferencesRes?.smsNotifications,
        profileVisibility: !!preferencesRes?.profileVisibility,
        language: preferencesRes?.language || 'en',
        timezone: preferencesRes?.timezone || 'UTC',
        darkMode: !!preferencesRes?.darkMode,
      });
    } catch (error: any) {
      if (error?.message?.includes('Refresh token') || error?.message?.includes('401')) {
        sessionStore.clear();
        setSession(null);
      }
    }
  };

  const handleLogin = () =>
    run(async () => {
      if (!isEmail(loginEmail)) {
        throw new Error('Email không hợp lệ');
      }

      const nextSession = await authApi.login({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });
      setSession(nextSession);
      setAuthMode('login');
      setPrivacyPreview('');
      setLoginPassword('');
    });

  const handleRegister = () =>
    run(async () => {
      if (!isEmail(registerEmail)) {
        throw new Error('Email không hợp lệ');
      }
      if (!isStrongPassword(registerPassword)) {
        throw new Error('Mật khẩu chưa đủ mạnh');
      }

      await authApi.register({
        username: registerUsername.trim() || undefined,
        email: registerEmail.trim().toLowerCase(),
        password: registerPassword,
      });

      setVerifyEmail(registerEmail.trim().toLowerCase());
      setResetEmail(registerEmail.trim().toLowerCase());
      setForgotEmail(registerEmail.trim().toLowerCase());
      setAuthMode('verify');
      Alert.alert('Success', 'Đăng ký thành công. Vui lòng nhập OTP trong email để xác thực.');
    });

  const handleVerifyOtp = () =>
    run(async () => {
      await authApi.verifyOtp({
        email: verifyEmail.trim().toLowerCase(),
        otp: verifyOtp.trim(),
      });

      setAuthMode('login');
      setLoginEmail(verifyEmail.trim().toLowerCase());
      setVerifyOtp('');
      Alert.alert('Success', 'Xác thực OTP thành công. Bạn có thể đăng nhập.');
    });

  const handleResendOtp = () =>
    run(async () => {
      await authApi.resendVerificationOtp(verifyEmail.trim().toLowerCase());
      Alert.alert('Sent', 'OTP mới đã được gửi.');
    });

  const handleForgotPassword = () =>
    run(async () => {
      if (!isEmail(forgotEmail)) {
        throw new Error('Email không hợp lệ');
      }

      await authApi.forgotPassword(forgotEmail.trim().toLowerCase());
      setResetEmail(forgotEmail.trim().toLowerCase());
      setAuthMode('reset');
      Alert.alert('Sent', 'Nếu email tồn tại, OTP khôi phục đã được gửi.');
    });

  const handleResetPassword = () =>
    run(async () => {
      if (!isStrongPassword(resetPassword)) {
        throw new Error('Mật khẩu mới chưa đủ mạnh');
      }

      await authApi.resetPassword({
        email: resetEmail.trim().toLowerCase(),
        otp: resetOtp.trim(),
        newPassword: resetPassword,
      });

      setAuthMode('login');
      setLoginEmail(resetEmail.trim().toLowerCase());
      setLoginPassword('');
      setResetOtp('');
      setResetPassword('');
      Alert.alert('Success', 'Đổi mật khẩu thành công.');
    });

  const handleGoogleLogin = () =>
    run(async () => {
      if (!googleIdToken.trim()) {
        throw new Error('Nhập Google ID token để đăng nhập');
      }

      const nextSession = await authApi.loginWithGoogle(googleIdToken.trim());
      setSession(nextSession);
      setGoogleIdToken('');
      setPrivacyPreview('');
    });

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authApi.logout();
    } catch {
      // Ignore API logout errors and clear local session anyway.
    } finally {
      sessionStore.clear();
      setSession(null);
      setProfile(defaultProfile);
      setPreferences(defaultPreferences);
      setPrivacyPreview('');
      setBiometricLock(false);
      setLoading(false);
    }
  };

  const toggleInterest = (interest: Interest) => {
    setProfile((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((item) => item !== interest)
        : [...prev.interests, interest],
    }));
  };

  const saveProfile = () =>
    run(async () => {
      const age = profile.age.trim() ? Number(profile.age) : null;
      if (age !== null && (Number.isNaN(age) || age <= 0 || age > 120)) {
        throw new Error('Age không hợp lệ');
      }

      const payload = {
        firstName: profile.firstName.trim() || null,
        lastName: profile.lastName.trim() || null,
        age,
        gender: profile.gender.trim() || null,
        travelStyle: profile.travelStyle || null,
        profilePictureUrl: profile.profilePictureUrl.trim() || null,
        interests: profile.interests,
        bio: profile.bio.trim() || null,
      };

      const updated = await userApi.updateProfile(payload);
      setProfile((prev) => ({
        ...prev,
        firstName: updated.firstName || '',
        lastName: updated.lastName || '',
        age: updated.age ? String(updated.age) : '',
        gender: updated.gender || '',
        travelStyle: (updated.travelStyle || '').toLowerCase() as TravelStyle | '',
        profilePictureUrl: updated.profilePictureUrl || '',
        interests: Array.isArray(updated.interests)
          ? updated.interests.filter((value) => INTEREST_OPTIONS.includes(value as Interest))
          : prev.interests,
        bio: updated.bio || '',
      }));
      Alert.alert('Saved', 'Profile updated');
    });

  const savePreferences = () =>
    run(async () => {
      const updated = await userApi.updatePreferences({
        ...preferences,
        language: preferences.language.trim() || 'en',
        timezone: preferences.timezone.trim() || 'UTC',
      });
      setPreferences({
        emailNotifications: !!updated.emailNotifications,
        pushNotifications: !!updated.pushNotifications,
        smsNotifications: !!updated.smsNotifications,
        profileVisibility: !!updated.profileVisibility,
        language: updated.language || 'en',
        timezone: updated.timezone || 'UTC',
        darkMode: !!updated.darkMode,
      });
      Alert.alert('Saved', 'Preferences updated');
    });

  const exportData = () =>
    run(async () => {
      const payload = await privacyApi.exportData();
      setPrivacyPreview(JSON.stringify(payload, null, 2));
    });

  const loadActivityLogs = () =>
    run(async () => {
      const payload = await privacyApi.getActivityLogs(50);
      setPrivacyPreview(JSON.stringify(payload, null, 2));
    });

  const confirmDelete = (type: 'soft' | 'hard') => {
    Alert.alert(
      type === 'hard' ? 'Hard delete account?' : 'Disable account?',
      type === 'hard'
        ? 'Tài khoản và dữ liệu sẽ bị xóa vĩnh viễn.'
        : 'Tài khoản sẽ bị vô hiệu hóa.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: type === 'hard' ? 'destructive' : 'default',
          onPress: () =>
            run(async () => {
              await privacyApi.deleteAccount(type);
              sessionStore.clear();
              setSession(null);
              setPrivacyPreview('');
              Alert.alert('Done', type === 'hard' ? 'Đã xóa tài khoản.' : 'Đã vô hiệu hóa tài khoản.');
            }),
        },
      ]
    );
  };

  const renderAuthTabs = () => (
    <View style={styles.authTabs}>
      {(['login', 'register', 'verify', 'forgot', 'reset'] as AuthMode[]).map((mode) => (
        <Pressable
          key={mode}
          onPress={() => setAuthMode(mode)}
          style={[styles.authTab, authMode === mode && styles.authTabActive]}
        >
          <Text style={[styles.authTabText, authMode === mode && styles.authTabTextActive]}>
            {mode.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderAuthForm = () => {
    if (authMode === 'login') {
      return (
        <>
          <Input label="Email" value={loginEmail} onChangeText={setLoginEmail} keyboardType="email-address" />
          <Input label="Password" value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
          <ActionButton
            title={loading ? 'Signing in...' : 'Sign In'}
            onPress={handleLogin}
            disabled={loading || loginDisabled}
          />
          <Text style={styles.hint}>
            Login button được khóa đến khi email và password đều có giá trị.
          </Text>
        </>
      );
    }

    if (authMode === 'register') {
      return (
        <>
          <Input label="Email" value={registerEmail} onChangeText={setRegisterEmail} keyboardType="email-address" />
          <Input label="Username (optional)" value={registerUsername} onChangeText={setRegisterUsername} />
          <Input
            label="Strong Password"
            value={registerPassword}
            onChangeText={setRegisterPassword}
            secureTextEntry
          />
          <ActionButton
            title={loading ? 'Creating...' : 'Create Account'}
            onPress={handleRegister}
            disabled={loading || registerDisabled}
          />
          <Text style={styles.hint}>Mật khẩu: tối thiểu 8 ký tự, gồm hoa/thường/số/ký tự đặc biệt.</Text>
        </>
      );
    }

    if (authMode === 'verify') {
      return (
        <>
          <Input label="Email" value={verifyEmail} onChangeText={setVerifyEmail} keyboardType="email-address" />
          <Input label="OTP (6 digits)" value={verifyOtp} onChangeText={setVerifyOtp} keyboardType="number-pad" />
          <ActionButton
            title={loading ? 'Verifying...' : 'Verify OTP'}
            onPress={handleVerifyOtp}
            disabled={loading || verifyDisabled}
          />
          <GhostButton title="Resend OTP" onPress={handleResendOtp} disabled={loading || !verifyEmail.trim()} />
        </>
      );
    }

    if (authMode === 'forgot') {
      return (
        <>
          <Input label="Email" value={forgotEmail} onChangeText={setForgotEmail} keyboardType="email-address" />
          <ActionButton
            title={loading ? 'Sending...' : 'Send Recovery OTP'}
            onPress={handleForgotPassword}
            disabled={loading || forgotDisabled}
          />
        </>
      );
    }

    return (
      <>
        <Input label="Email" value={resetEmail} onChangeText={setResetEmail} keyboardType="email-address" />
        <Input label="OTP (6 digits)" value={resetOtp} onChangeText={setResetOtp} keyboardType="number-pad" />
        <Input
          label="New Strong Password"
          value={resetPassword}
          onChangeText={setResetPassword}
          secureTextEntry
        />
        <ActionButton
          title={loading ? 'Updating...' : 'Reset Password'}
          onPress={handleResetPassword}
          disabled={loading || resetDisabled}
        />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>User Management</Text>
          <Text style={styles.subtitle}>
            React Native UI mapped with backend auth/profile/GDPR endpoints
          </Text>
        </View>

        {!session ? (
          <>
            <View style={styles.card}>
              <SectionTitle title="Email / Password / OTP" />
              {renderAuthTabs()}
              {renderAuthForm()}
            </View>

            <View style={styles.card}>
              <SectionTitle title="Google Sign-In Mapping" />
              <Input
                label="Google ID Token"
                value={googleIdToken}
                onChangeText={setGoogleIdToken}
                autoCapitalize="none"
              />
              <ActionButton
                title={loading ? 'Processing...' : 'Sign In with Google Token'}
                onPress={handleGoogleLogin}
                disabled={loading || !googleIdToken.trim()}
              />
              <Text style={styles.hint}>
                Nút này gọi thẳng backend `/api/auth/google`. Bạn có thể nối thêm SDK Google Sign-In để lấy ID token tự động.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <SectionTitle title="Session" />
              <Row label="Email" value={session.user.email} />
              <Row label="Username" value={session.user.username} />
              <Row label="Profile Name" value={profileName} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Biometric lock (optional)</Text>
                <Switch value={biometricLock} onValueChange={setBiometricLock} />
              </View>
              <Text style={styles.hint}>
                Toggle này là điểm gắn cho bảo vệ app-level lock. Có thể nối thêm module biometric native nếu cần.
              </Text>
              <GhostButton title="Logout" onPress={handleLogout} disabled={loading} />
            </View>

            <View style={styles.card}>
              <SectionTitle title="Profile" />
              <View style={styles.double}>
                <Input
                  compact
                  label="First name"
                  value={profile.firstName}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, firstName: value }))}
                />
                <Input
                  compact
                  label="Last name"
                  value={profile.lastName}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, lastName: value }))}
                />
              </View>
              <View style={styles.double}>
                <Input
                  compact
                  label="Age"
                  value={profile.age}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, age: value.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                />
                <Input
                  compact
                  label="Gender (optional)"
                  value={profile.gender}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, gender: value }))}
                />
              </View>
              <Input
                label="Profile picture URL"
                value={profile.profilePictureUrl}
                onChangeText={(value) => setProfile((prev) => ({ ...prev, profilePictureUrl: value }))}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>Travel style</Text>
              <View style={styles.chips}>
                {TRAVEL_STYLE_OPTIONS.map((style) => (
                  <Pressable
                    key={style}
                    onPress={() => setProfile((prev) => ({ ...prev, travelStyle: style }))}
                    style={[styles.chip, profile.travelStyle === style && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, profile.travelStyle === style && styles.chipTextActive]}>
                      {style.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Interests</Text>
              <View style={styles.chips}>
                {INTEREST_OPTIONS.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => toggleInterest(item)}
                    style={[styles.chip, profile.interests.includes(item) && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, profile.interests.includes(item) && styles.chipTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Input
                multiline
                label="Bio"
                value={profile.bio}
                onChangeText={(value) => setProfile((prev) => ({ ...prev, bio: value }))}
              />
              <ActionButton title={loading ? 'Saving...' : 'Save Profile'} onPress={saveProfile} disabled={loading} />
            </View>

            <View style={styles.card}>
              <SectionTitle title="Preferences" />
              <SwitchField
                label="Email notifications"
                value={preferences.emailNotifications}
                onValueChange={(value) => setPreferences((prev) => ({ ...prev, emailNotifications: value }))}
              />
              <SwitchField
                label="Push notifications"
                value={preferences.pushNotifications}
                onValueChange={(value) => setPreferences((prev) => ({ ...prev, pushNotifications: value }))}
              />
              <SwitchField
                label="SMS notifications"
                value={preferences.smsNotifications}
                onValueChange={(value) => setPreferences((prev) => ({ ...prev, smsNotifications: value }))}
              />
              <SwitchField
                label="Public profile"
                value={preferences.profileVisibility}
                onValueChange={(value) => setPreferences((prev) => ({ ...prev, profileVisibility: value }))}
              />
              <SwitchField
                label="Dark mode preference"
                value={preferences.darkMode}
                onValueChange={(value) => setPreferences((prev) => ({ ...prev, darkMode: value }))}
              />
              <Input
                label="Language"
                value={preferences.language}
                onChangeText={(value) => setPreferences((prev) => ({ ...prev, language: value }))}
              />
              <Input
                label="Timezone"
                value={preferences.timezone}
                onChangeText={(value) => setPreferences((prev) => ({ ...prev, timezone: value }))}
              />
              <ActionButton
                title={loading ? 'Saving...' : 'Save Preferences'}
                onPress={savePreferences}
                disabled={loading}
              />
            </View>

            <View style={styles.card}>
              <SectionTitle title="Privacy (GDPR)" />
              <ActionButton title="Export Personal Data" onPress={exportData} disabled={loading} />
              <GhostButton title="View Activity Logs" onPress={loadActivityLogs} disabled={loading} />
              <GhostButton title="Disable Account (Soft Delete)" onPress={() => confirmDelete('soft')} disabled={loading} />
              <DangerButton title="Delete Account (Hard Delete)" onPress={() => confirmDelete('hard')} disabled={loading} />
              {privacyPreview ? (
                <View style={styles.preview}>
                  <Text style={styles.previewTitle}>Preview</Text>
                  <Text style={styles.previewText}>{privacyPreview}</Text>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const SectionTitle = ({ title }: { title: string }) => <Text style={styles.sectionTitle}>{title}</Text>;

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

type InputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  compact?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
};

const Input = ({
  label,
  value,
  onChangeText,
  compact,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  multiline,
}: InputProps) => (
  <View style={[styles.inputWrap, compact && styles.inputWrapCompact]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={[styles.input, multiline && styles.inputMulti]}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize || 'none'}
      multiline={multiline}
      placeholderTextColor="#7d8590"
    />
  </View>
);

const SwitchField = ({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) => (
  <View style={styles.switchRow}>
    <Text style={styles.switchLabel}>{label}</Text>
    <Switch value={value} onValueChange={onValueChange} />
  </View>
);

const ActionButton = ({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && styles.buttonDisabled]}>
    <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{title}</Text>
  </Pressable>
);

const GhostButton = ({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.ghostButton, disabled && styles.buttonDisabled]}>
    <Text style={[styles.ghostButtonText, disabled && styles.buttonTextDisabled]}>{title}</Text>
  </Pressable>
);

const DangerButton = ({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.dangerButton, disabled && styles.buttonDisabled]}>
    <Text style={[styles.dangerButtonText, disabled && styles.buttonTextDisabled]}>{title}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0f14',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 14,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
  },
  title: {
    color: '#e6edf3',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: FONT_PRIMARY,
  },
  subtitle: {
    color: '#8b949e',
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#11161d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222b36',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#f0f6fc',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: FONT_PRIMARY,
  },
  authTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  authTab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a3645',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0f141b',
  },
  authTabActive: {
    borderColor: '#8b949e',
    backgroundColor: '#1b2430',
  },
  authTabText: {
    color: '#7d8590',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: FONT_PRIMARY,
  },
  authTabTextActive: {
    color: '#f0f6fc',
  },
  inputWrap: {
    gap: 5,
  },
  inputWrapCompact: {
    flex: 1,
  },
  fieldLabel: {
    color: '#9aa4af',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONT_PRIMARY,
  },
  input: {
    backgroundColor: '#0f141b',
    borderWidth: 1,
    borderColor: '#2a3645',
    borderRadius: 10,
    color: '#e6edf3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#e6edf3',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 2,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#394657',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  dangerButton: {
    backgroundColor: '#3b1212',
    borderWidth: 1,
    borderColor: '#6f1f1f',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#0b0f14',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: FONT_PRIMARY,
  },
  ghostButtonText: {
    color: '#c9d1d9',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: FONT_PRIMARY,
  },
  dangerButtonText: {
    color: '#ffddd2',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: FONT_PRIMARY,
  },
  buttonTextDisabled: {
    opacity: 0.6,
  },
  hint: {
    color: '#7d8590',
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    color: '#8b949e',
    fontSize: 13,
  },
  rowValue: {
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  switchLabel: {
    color: '#d0d7de',
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#2f3d4f',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#101720',
  },
  chipActive: {
    borderColor: '#c9d1d9',
    backgroundColor: '#293241',
  },
  chipText: {
    color: '#9aa4af',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#f0f6fc',
  },
  double: {
    flexDirection: 'row',
    gap: 8,
  },
  preview: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f3d4f',
    backgroundColor: '#0d131a',
    padding: 10,
    gap: 6,
  },
  previewTitle: {
    color: '#c9d1d9',
    fontWeight: '700',
    fontSize: 13,
  },
  previewText: {
    color: '#8b949e',
    fontSize: 11,
    lineHeight: 17,
  },
});

export default UserManagementScreen;
