import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  NotificationCategory,
  NotificationListResponse,
  notificationApi,
} from '../services/backend';

const ConstantsModule: any = (() => {
  try {
    const loaded = require('expo-constants');
    return loaded?.default || loaded;
  } catch {
    return null;
  }
})();

const isExpoGoRuntime =
  ConstantsModule?.appOwnership === 'expo' ||
  ConstantsModule?.executionEnvironment === 'storeClient';

let notificationsModuleCache: any = null;
const loadNotificationsModule = async () => {
  if (isExpoGoRuntime) {
    return null;
  }
  if (notificationsModuleCache) {
    return notificationsModuleCache;
  }
  try {
    const loaded = await import('expo-notifications');
    notificationsModuleCache = loaded?.default || loaded;
    return notificationsModuleCache;
  } catch {
    return null;
  }
};

let pushHandlerConfigured = false;

type CategoryFilter = 'ALL' | NotificationCategory;

const FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OFFERS', label: 'Offers' },
  { key: 'ALERTS', label: 'Alerts' },
  { key: 'MESSAGES', label: 'Messages' },
];

const categoryColor = (category: NotificationCategory) => {
  if (category === 'OFFERS') return '#16a34a';
  if (category === 'ALERTS') return '#f97316';
  return '#3b82f6';
};

const formatTime = (iso: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const NotificationsPanel = () => {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabled' | 'unsupported'>('idle');

  const items = data?.notifications || [];

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await notificationApi.list({
        category: filter,
        unreadOnly,
        page: 0,
        size: 40,
      });
      setData(payload);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Cannot load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter, unreadOnly]);

  const withBusy = async (task: () => Promise<void>) => {
    if (busy) return;
    try {
      setBusy(true);
      await task();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleEnablePush = () =>
    withBusy(async () => {
      if (isExpoGoRuntime) {
        setPushStatus('unsupported');
        Alert.alert(
          'Push Unavailable In Expo Go',
          'Expo Go (SDK 53+) does not support remote push notifications. Use a development build.'
        );
        return;
      }

      const notificationsModule = await loadNotificationsModule();
      if (!notificationsModule) {
        setPushStatus('unsupported');
        Alert.alert('Push Unavailable', 'Please install expo-notifications in this app to enable push.');
        return;
      }

      if (!pushHandlerConfigured && notificationsModule.setNotificationHandler) {
        notificationsModule.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        pushHandlerConfigured = true;
      }

      const existing = await notificationsModule.getPermissionsAsync();
      let status = existing?.status;
      if (status !== 'granted') {
        const requested = await notificationsModule.requestPermissionsAsync();
        status = requested?.status;
      }
      if (status !== 'granted') {
        throw new Error('Push permission is not granted.');
      }

      const projectId =
        ConstantsModule?.expoConfig?.extra?.eas?.projectId ||
        ConstantsModule?.easConfig?.projectId ||
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

      const tokenPayload = projectId
        ? await notificationsModule.getExpoPushTokenAsync({ projectId })
        : await notificationsModule.getExpoPushTokenAsync();

      const token = tokenPayload?.data;
      if (!token) {
        throw new Error('Could not acquire Expo push token.');
      }

      await notificationApi.registerDevice({
        deviceToken: token,
        platform: Platform.OS,
      });

      setPushToken(token);
      setPushStatus('enabled');
      Alert.alert('Push Enabled', 'This device is now registered for push notifications.');
    });

  const handleDisablePush = () =>
    withBusy(async () => {
      if (!pushToken) {
        setPushStatus('idle');
        return;
      }
      await notificationApi.unregisterDevice(pushToken);
      setPushToken(null);
      setPushStatus('idle');
      Alert.alert('Push Disabled', 'Push notifications are disabled on this device.');
    });

  const markRead = (notificationId: number) =>
    withBusy(async () => {
      await notificationApi.markRead(notificationId);
      await loadInbox();
    });

  const removeOne = (notificationId: number) =>
    withBusy(async () => {
      await notificationApi.remove(notificationId);
      await loadInbox();
    });

  const markAllRead = () =>
    withBusy(async () => {
      await notificationApi.markAllRead();
      await loadInbox();
    });

  const clearAll = () =>
    withBusy(async () => {
      await notificationApi.clearAll();
      await loadInbox();
    });

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (isExpoGoRuntime) {
      setPushStatus('unsupported');
    }
  }, []);

  const unreadSummary = useMemo(() => {
    if (!data) {
      return { total: 0, offers: 0, alerts: 0, messages: 0 };
    }
    return {
      total: data.unreadCount,
      offers: data.unreadOffers,
      alerts: data.unreadAlerts,
      messages: data.unreadMessages,
    };
  }, [data]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.countCard}>
          <Text style={styles.countLabel}>Unread</Text>
          <Text style={styles.countValue}>{unreadSummary.total}</Text>
          <Text style={styles.countMeta}>
            {unreadSummary.offers} offers • {unreadSummary.alerts} alerts • {unreadSummary.messages} messages
          </Text>
        </View>
        <View style={styles.pushCard}>
          <Text style={styles.pushTitle}>Push Device</Text>
          <Text style={styles.pushMeta}>
            {pushStatus === 'enabled'
              ? 'Registered'
              : pushStatus === 'unsupported'
                ? 'Not supported'
                : 'Not registered'}
          </Text>
          <View style={styles.pushActions}>
            <Pressable style={styles.enableBtn} onPress={handleEnablePush} disabled={busy}>
              <Text style={styles.enableBtnText}>Enable</Text>
            </Pressable>
            <Pressable style={styles.disableBtn} onPress={handleDisablePush} disabled={busy}>
              <Text style={styles.disableBtnText}>Disable</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setFilter(item.key)}
            style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.quickActions}>
        <Pressable
          onPress={() => setUnreadOnly((prev) => !prev)}
          style={[styles.quickActionBtn, unreadOnly && styles.quickActionActive]}
        >
          <Text style={[styles.quickActionText, unreadOnly && styles.quickActionTextActive]}>
            {unreadOnly ? 'Unread only: ON' : 'Unread only: OFF'}
          </Text>
        </Pressable>
        <Pressable style={styles.quickActionBtn} onPress={markAllRead} disabled={busy}>
          <Text style={styles.quickActionText}>Read All</Text>
        </Pressable>
        <Pressable
          style={styles.quickActionBtn}
          onPress={() =>
            Alert.alert('Clear all?', 'This will delete all notifications.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearAll },
            ])
          }
          disabled={busy}
        >
          <Text style={styles.quickActionText}>Clear All</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#f8fafc" />
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptyText}>New offers, alerts, and messages will appear here.</Text>
            </View>
          ) : (
            items.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInDown.delay(index * 35).duration(260)}
                style={[styles.itemCard, !item.isRead && styles.itemCardUnread]}
              >
                <View style={styles.itemTop}>
                  <View style={styles.itemHeader}>
                    <View style={[styles.categoryDot, { backgroundColor: categoryColor(item.category) }]} />
                    <Text style={styles.itemTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.itemTime}>{formatTime(item.createdAt)}</Text>
                </View>
                <Text style={styles.itemMessage}>{item.message}</Text>
                <View style={styles.itemFoot}>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                  <View style={styles.itemActions}>
                    {!item.isRead ? (
                      <Pressable style={styles.itemActionBtn} onPress={() => markRead(item.id)} disabled={busy}>
                        <Text style={styles.itemActionText}>Read</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.itemActionBtn, styles.itemDeleteBtn]}
                      onPress={() =>
                        Alert.alert('Delete notification?', 'This action cannot be undone.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeOne(item.id) },
                        ])
                      }
                      disabled={busy}
                    >
                      <Text style={[styles.itemActionText, styles.itemDeleteText]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  toolbar: {
    gap: 10,
  },
  countCard: {
    backgroundColor: '#101417',
    borderWidth: 1,
    borderColor: '#24303a',
    borderRadius: 14,
    padding: 12,
  },
  countLabel: {
    color: '#9fb4c6',
    fontSize: 12,
    fontWeight: '600',
  },
  countValue: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
  },
  countMeta: {
    color: '#b8c9d7',
    fontSize: 12,
    marginTop: 4,
  },
  pushCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2d2d2d',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  pushTitle: {
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '700',
  },
  pushMeta: {
    color: '#c5c5c5',
    fontSize: 12,
  },
  pushActions: {
    flexDirection: 'row',
    gap: 8,
  },
  enableBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  enableBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  disableBtn: {
    backgroundColor: '#3a3a3a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disableBtnText: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#2f3640',
    backgroundColor: '#11151a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#f8fafc',
  },
  filterText: {
    color: '#dbe8f2',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#0f1720',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionBtn: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: '#2f2f2f',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quickActionActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  quickActionText: {
    color: '#ececec',
    fontSize: 12,
    fontWeight: '600',
  },
  quickActionTextActive: {
    color: '#92400e',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  list: {
    maxHeight: 640,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#29333d',
    borderRadius: 14,
    backgroundColor: '#10151a',
    padding: 14,
    gap: 6,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#aab9c8',
    fontSize: 12,
    lineHeight: 18,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#101010',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  itemCardUnread: {
    borderColor: '#f59e0b',
    backgroundColor: '#1b1308',
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  itemTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  itemTime: {
    color: '#9aa7b4',
    fontSize: 11,
  },
  itemMessage: {
    color: '#d2dbe4',
    fontSize: 13,
    lineHeight: 19,
  },
  itemFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemCategory: {
    color: '#9fb4c6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  itemActionBtn: {
    borderWidth: 1,
    borderColor: '#3a4652',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  itemDeleteBtn: {
    borderColor: '#6b2828',
  },
  itemActionText: {
    color: '#d8e1ea',
    fontSize: 11,
    fontWeight: '700',
  },
  itemDeleteText: {
    color: '#fecaca',
  },
});

export default NotificationsPanel;
