import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AuthSession, Interest, TravelStyle, authApi, privacyApi, sessionStore, userApi } from '../services/backend';

type Props = {
  onLoggedOut: () => void;
};

const INTEREST_OPTIONS: { key: Interest; label: string }[] = [
  { key: 'FOOD', label: 'Food' },
  { key: 'CULTURE', label: 'Culture' },
  { key: 'SHOPPING', label: 'Shopping' },
  { key: 'NATURE', label: 'Nature' },
  { key: 'ADVENTURE', label: 'Adventure' },
];

const TRAVEL_STYLE_OPTIONS: { key: TravelStyle; label: string }[] = [
  { key: 'solo', label: 'Solo' },
  { key: 'family', label: 'Family' },
  { key: 'group', label: 'Group' },
];

type ProfileForm = {
  firstName: string;
  lastName: string;
  age: string;
  gender: string;
  travelStyle: TravelStyle | '';
  profilePictureUrl: string;
  interests: Interest[];
  bio: string;
};

type PreferencesForm = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  profileVisibility: boolean;
  language: string;
  timezone: string;
  darkMode: boolean;
};

const defaultProfile: ProfileForm = {
  firstName: '',
  lastName: '',
  age: '',
  gender: '',
  travelStyle: '',
  profilePictureUrl: '',
  interests: [],
  bio: '',
};

const defaultPreferences: PreferencesForm = {
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
  profileVisibility: true,
  language: 'en',
  timezone: 'UTC',
  darkMode: false,
};

const normalizeProfile = (payload: Record<string, any> | null | undefined): ProfileForm => ({
  firstName: payload?.firstName || '',
  lastName: payload?.lastName || '',
  age: payload?.age ? String(payload.age) : '',
  gender: payload?.gender || '',
  travelStyle: (payload?.travelStyle || '').toLowerCase() as TravelStyle | '',
  profilePictureUrl: payload?.profilePictureUrl || '',
  interests: Array.isArray(payload?.interests)
    ? payload.interests.filter((value: Interest) => INTEREST_OPTIONS.some((item) => item.key === value))
    : [],
  bio: payload?.bio || '',
});

const normalizePreferences = (payload: Record<string, any> | null | undefined): PreferencesForm => ({
  emailNotifications: !!payload?.emailNotifications,
  pushNotifications: !!payload?.pushNotifications,
  smsNotifications: !!payload?.smsNotifications,
  profileVisibility: !!payload?.profileVisibility,
  language: payload?.language || 'en',
  timezone: payload?.timezone || 'UTC',
  darkMode: !!payload?.darkMode,
});

const ProfilePreferencesPrivacyPanel = ({ onLoggedOut }: Props) => {
  const [session, setSession] = useState<AuthSession | null>(sessionStore.get());
  const [profile, setProfile] = useState<ProfileForm>(defaultProfile);
  const [preferences, setPreferences] = useState<PreferencesForm>(defaultPreferences);
  const [biometricLock, setBiometricLock] = useState(false);
  const [secureMessaging, setSecureMessaging] = useState(true);
  const [privacyPreview, setPrivacyPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const profileName = useMemo(() => {
    const value = `${profile.firstName} ${profile.lastName}`.trim();
    return value || session?.user.username || 'Traveler';
  }, [profile.firstName, profile.lastName, session?.user.username]);

  const logoutLocal = () => {
    sessionStore.clear();
    setSession(null);
    onLoggedOut();
  };

  const handleAuthError = (error: any) => {
    const message = error?.message || '';
    if (message.includes('401') || message.toLowerCase().includes('refresh token')) {
      logoutLocal();
      return true;
    }
    return false;
  };

  const run = async (action: () => Promise<void>) => {
    try {
      setBusy(true);
      await action();
    } catch (error: any) {
      if (!handleAuthError(error)) {
        Alert.alert('Error', error?.message || 'Request failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const loadData = async () => {
    const currentSession = sessionStore.get();
    if (!currentSession) {
      setLoading(false);
      setSession(null);
      return;
    }

    setSession(currentSession);
    try {
      const [profileRes, preferencesRes] = await Promise.all([userApi.getProfile(), userApi.getPreferences()]);
      setProfile(normalizeProfile(profileRes as Record<string, any>));
      setPreferences(normalizePreferences(preferencesRes as Record<string, any>));
    } catch (error: any) {
      if (!handleAuthError(error)) {
        Alert.alert('Error', error?.message || 'Cannot load profile data');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
      const age = profile.age.trim() ? Number(profile.age.trim()) : null;
      if (age !== null && (Number.isNaN(age) || age < 1 || age > 120)) {
        throw new Error('Age must be between 1 and 120');
      }

      const payload = {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        age,
        gender: profile.gender.trim(),
        travelStyle: profile.travelStyle || null,
        profilePictureUrl: profile.profilePictureUrl.trim(),
        interests: profile.interests,
        bio: profile.bio.trim(),
      };

      const updated = await userApi.updateProfile(payload);
      setProfile(normalizeProfile(updated as Record<string, any>));
      Alert.alert('Saved', 'Profile updated');
    });

  const savePreferences = () =>
    run(async () => {
      const payload = {
        ...preferences,
        language: preferences.language.trim() || 'en',
        timezone: preferences.timezone.trim() || 'UTC',
      };
      const updated = await userApi.updatePreferences(payload);
      setPreferences(normalizePreferences(updated as Record<string, any>));
      Alert.alert('Saved', 'Preferences updated');
    });

  const showDataExport = () =>
    run(async () => {
      const payload = await privacyApi.exportData();
      setPrivacyPreview(JSON.stringify(payload, null, 2));
    });

  const showActivityLogs = () =>
    run(async () => {
      const payload = await privacyApi.getActivityLogs(50);
      setPrivacyPreview(JSON.stringify(payload, null, 2));
    });

  const confirmDelete = (type: 'soft' | 'hard') => {
    Alert.alert(
      type === 'hard' ? 'Delete account permanently?' : 'Disable account?',
      type === 'hard'
        ? 'All personal data will be permanently removed.'
        : 'Your account will be disabled and can be restored by admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: type === 'hard' ? 'destructive' : 'default',
          onPress: () =>
            run(async () => {
              await privacyApi.deleteAccount(type);
              logoutLocal();
              Alert.alert('Done', type === 'hard' ? 'Account deleted' : 'Account disabled');
            }),
        },
      ]
    );
  };

  const logout = () =>
    run(async () => {
      try {
        await authApi.logout();
      } catch {
        // local session still needs to be cleared when server logout fails
      }
      logoutLocal();
    });

  if (!session) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session expired</Text>
        <Text style={styles.helper}>Please sign in again to edit profile and privacy settings.</Text>
        <Button label="Back to Login" onPress={onLoggedOut} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Identity & Security</Text>
        <InfoRow label="Signed in as" value={session.user.email} />
        <InfoRow label="Display name" value={profileName} />
        <InfoRow label="Credentials" value="Encrypted in transit (HTTPS/TLS)" />
        <InfoRow label="Sensitive channels" value={secureMessaging ? 'E2E mode ON (UI flag)' : 'E2E mode OFF'} />
        <SwitchRow label="Enable biometric lock (optional)" value={biometricLock} onValueChange={setBiometricLock} />
        <SwitchRow label="Enable secure chat mode" value={secureMessaging} onValueChange={setSecureMessaging} />
        <Text style={styles.helper}>Biometric and E2E toggles are app-level controls and can be bound to native modules.</Text>
        <Button label={busy ? 'Working...' : 'Logout'} onPress={logout} disabled={busy} kind="ghost" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile & Interests</Text>
        <View style={styles.row}>
          <Field label="First name" value={profile.firstName} onChangeText={(value) => setProfile((prev) => ({ ...prev, firstName: value }))} />
          <Field label="Last name" value={profile.lastName} onChangeText={(value) => setProfile((prev) => ({ ...prev, lastName: value }))} />
        </View>
        <View style={styles.row}>
          <Field
            label="Age"
            value={profile.age}
            keyboardType="number-pad"
            onChangeText={(value) => setProfile((prev) => ({ ...prev, age: value.replace(/[^0-9]/g, '') }))}
          />
          <Field label="Gender (optional)" value={profile.gender} onChangeText={(value) => setProfile((prev) => ({ ...prev, gender: value }))} />
        </View>
        <Field
          label="Profile picture URL"
          value={profile.profilePictureUrl}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, profilePictureUrl: value }))}
        />
        <Field label="Bio" value={profile.bio} multiline onChangeText={(value) => setProfile((prev) => ({ ...prev, bio: value }))} />

        <Text style={styles.label}>Travel style</Text>
        <View style={styles.chipWrap}>
          {TRAVEL_STYLE_OPTIONS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setProfile((prev) => ({ ...prev, travelStyle: item.key }))}
              style={[styles.chip, profile.travelStyle === item.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, profile.travelStyle === item.key && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Interests</Text>
        <View style={styles.chipWrap}>
          {INTEREST_OPTIONS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => toggleInterest(item.key)}
              style={[styles.chip, profile.interests.includes(item.key) && styles.chipActive]}
            >
              <Text style={[styles.chipText, profile.interests.includes(item.key) && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={busy ? 'Saving...' : 'Save Profile'} onPress={saveProfile} disabled={busy} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preferences</Text>
        <SwitchRow
          label="Email notifications"
          value={preferences.emailNotifications}
          onValueChange={(value) => setPreferences((prev) => ({ ...prev, emailNotifications: value }))}
        />
        <SwitchRow
          label="Push notifications"
          value={preferences.pushNotifications}
          onValueChange={(value) => setPreferences((prev) => ({ ...prev, pushNotifications: value }))}
        />
        <SwitchRow
          label="SMS notifications"
          value={preferences.smsNotifications}
          onValueChange={(value) => setPreferences((prev) => ({ ...prev, smsNotifications: value }))}
        />
        <SwitchRow
          label="Public profile"
          value={preferences.profileVisibility}
          onValueChange={(value) => setPreferences((prev) => ({ ...prev, profileVisibility: value }))}
        />
        <Field
          label="Language"
          value={preferences.language}
          onChangeText={(value) => setPreferences((prev) => ({ ...prev, language: value }))}
        />
        <Field
          label="Timezone"
          value={preferences.timezone}
          onChangeText={(value) => setPreferences((prev) => ({ ...prev, timezone: value }))}
        />
        <Button label={busy ? 'Saving...' : 'Save Preferences'} onPress={savePreferences} disabled={busy} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy (GDPR)</Text>
        <Button label="View personal data" onPress={showDataExport} disabled={busy} />
        <Button label="View activity logs" onPress={showActivityLogs} disabled={busy} kind="ghost" />
        <Button label="Disable account" onPress={() => confirmDelete('soft')} disabled={busy} kind="ghost" />
        <Button label="Delete account permanently" onPress={() => confirmDelete('hard')} disabled={busy} kind="danger" />
        {!!privacyPreview && (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Data Preview</Text>
            <ScrollView style={styles.previewScroll}>
              <Text style={styles.previewText}>{privacyPreview}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const SwitchRow = ({
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

const Field = ({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={[styles.input, multiline && styles.inputMulti]}
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      placeholderTextColor="#7f7f7f"
      autoCapitalize="none"
    />
  </View>
);

const Button = ({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'ghost' | 'danger';
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[
      styles.button,
      kind === 'ghost' && styles.buttonGhost,
      kind === 'danger' && styles.buttonDanger,
      disabled && styles.buttonDisabled,
    ]}
  >
    <Text
      style={[
        styles.buttonText,
        kind === 'ghost' && styles.buttonGhostText,
        kind === 'danger' && styles.buttonDangerText,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#101010',
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    color: '#f5f5f5',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  helper: {
    color: '#9d9d9d',
    fontSize: 12,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoLabel: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: '#e5e5e5',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    color: '#d9d9d9',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldWrap: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: '#a9a9a9',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#161616',
    color: '#f1f1f1',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  inputMulti: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#171717',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: '#f2f2f2',
    backgroundColor: '#2a2a2a',
  },
  chipText: {
    color: '#9d9d9d',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#f5f5f5',
  },
  button: {
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonGhost: {
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#393939',
  },
  buttonDanger: {
    backgroundColor: '#2b1212',
    borderWidth: 1,
    borderColor: '#5d1e1e',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#0b0b0b',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  buttonGhostText: {
    color: '#d9d9d9',
  },
  buttonDangerText: {
    color: '#ffd6d6',
  },
  preview: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    backgroundColor: '#0f0f0f',
    padding: 10,
    gap: 6,
    maxHeight: 260,
  },
  previewScroll: {
    maxHeight: 220,
  },
  previewTitle: {
    color: '#ebebeb',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  previewText: {
    color: '#a9a9a9',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
});

export default ProfilePreferencesPrivacyPanel;
