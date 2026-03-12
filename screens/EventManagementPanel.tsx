import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  eventApi,
  EventItem,
  EventStatus,
  EventType,
  CreateEventInput,
} from '../services/backend';
import {
  cacheEventsSnapshot,
  enqueueSyncOperation,
  getSyncStatus,
  isLikelyOfflineError,
  loadEventsSnapshot,
  startOfflineSync,
  subscribeSyncStatus,
  type SyncStatus,
} from '../services/offlineSync';

const { width } = Dimensions.get('window');

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_TABS: { key: EventStatus | 'ALL'; label: string; color: string }[] = [
  { key: 'ALL', label: 'All', color: '#8b5cf6' },
  { key: 'INCOMING', label: 'Incoming', color: '#3b82f6' },
  { key: 'ONGOING', label: 'Ongoing', color: '#10b981' },
  { key: 'COMPLETED', label: 'Completed', color: '#6b7280' },
];

const EVENT_TYPES: { key: EventType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All Types' },
  { key: 'FOOD', label: '🍜 Food' },
  { key: 'CULTURE', label: '🏛 Culture' },
  { key: 'NATURE', label: '🌿 Nature' },
  { key: 'SPORTS', label: '⚽ Sports' },
  { key: 'ADVENTURE', label: '🧗 Adventure' },
  { key: 'MUSIC', label: '🎵 Music' },
  { key: 'MARKET', label: '🛍 Market' },
  { key: 'WORKSHOP', label: '🔧 Workshop' },
  { key: 'SOCIAL', label: '👥 Social' },
  { key: 'OTHER', label: '📌 Other' },
];

const PRICING_FILTERS: { key: 'all' | 'free' | 'paid'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'paid', label: 'Paid' },
];

const TYPE_ICON: Record<string, string> = {
  FOOD: '🍜',
  CULTURE: '🏛',
  NATURE: '🌿',
  SPORTS: '⚽',
  ADVENTURE: '🧗',
  MUSIC: '🎵',
  MARKET: '🛍',
  WORKSHOP: '🔧',
  SOCIAL: '👥',
  OTHER: '📌',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: EventStatus): string {
  if (status === 'INCOMING') return '#3b82f6';
  if (status === 'ONGOING') return '#10b981';
  return '#6b7280';
}

/* ─── Custom DateTimePicker ──────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type DateTimePickerProps = {
  visible: boolean;
  value: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
};

const CustomDateTimePicker: React.FC<DateTimePickerProps> = ({
  visible,
  value,
  onConfirm,
  onCancel,
  title = 'Select Date & Time',
}) => {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [selectedDay, setSelectedDay] = useState(value.getDate());
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());

  useEffect(() => {
    if (visible) {
      setViewYear(value.getFullYear());
      setViewMonth(value.getMonth());
      setSelectedDay(value.getDate());
      setHour(value.getHours());
      setMinute(value.getMinutes());
    }
  }, [visible, value]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleConfirm = () => {
    const d = new Date(viewYear, viewMonth, selectedDay, hour, minute, 0);
    onConfirm(d);
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={dtp.backdrop}>
        <View style={dtp.card}>
          <Text style={dtp.title}>{title}</Text>

          {/* Month / Year nav */}
          <View style={dtp.navRow}>
            <Pressable onPress={prevMonth} style={dtp.navBtn}><Text style={dtp.navBtnText}>‹</Text></Pressable>
            <Text style={dtp.navTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
            <Pressable onPress={nextMonth} style={dtp.navBtn}><Text style={dtp.navBtnText}>›</Text></Pressable>
          </View>

          {/* Weekday headers */}
          <View style={dtp.weekRow}>
            {WEEKDAYS.map((wd) => (
              <Text key={wd} style={dtp.weekText}>{wd}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={dtp.calendarGrid}>
            {calendarCells.map((day, i) => (
              <Pressable
                key={i}
                style={[
                  dtp.dayCell,
                  day === selectedDay && dtp.dayCellSelected,
                  day != null && isToday(day) && day !== selectedDay && dtp.dayCellToday,
                ]}
                onPress={() => day && setSelectedDay(day)}
                disabled={!day}
              >
                <Text
                  style={[
                    dtp.dayText,
                    day === selectedDay && dtp.dayTextSelected,
                    !day && { color: 'transparent' },
                  ]}
                >
                  {day ?? ''}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Time selector */}
          <View style={dtp.timeSection}>
            <Text style={dtp.timeLabel}>Time</Text>
            <View style={dtp.timeRow}>
              <Pressable onPress={() => setHour((h) => (h + 23) % 24)} style={dtp.timeBtn}>
                <Text style={dtp.timeBtnText}>▲</Text>
              </Pressable>
              <Text style={dtp.timeValue}>{pad(hour)}</Text>
              <Pressable onPress={() => setHour((h) => (h + 1) % 24)} style={dtp.timeBtn}>
                <Text style={dtp.timeBtnText}>▼</Text>
              </Pressable>

              <Text style={dtp.timeSep}>:</Text>

              <Pressable onPress={() => setMinute((m) => (m + 55) % 60)} style={dtp.timeBtn}>
                <Text style={dtp.timeBtnText}>▲</Text>
              </Pressable>
              <Text style={dtp.timeValue}>{pad(minute)}</Text>
              <Pressable onPress={() => setMinute((m) => (m + 5) % 60)} style={dtp.timeBtn}>
                <Text style={dtp.timeBtnText}>▼</Text>
              </Pressable>
            </View>
          </View>

          {/* Actions */}
          <View style={dtp.actions}>
            <Pressable style={dtp.cancelBtn} onPress={onCancel}>
              <Text style={dtp.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={dtp.confirmBtn} onPress={handleConfirm}>
              <Text style={dtp.confirmText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const dtp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navBtn: { padding: 8 },
  navBtnText: { color: '#8b5cf6', fontSize: 24, fontWeight: '700' },
  navTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  weekText: {
    width: 36,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  dayCellSelected: {
    backgroundColor: '#8b5cf6',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#8b5cf644',
  },
  dayText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },
  timeSection: {
    marginTop: 12,
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timeBtnText: { color: '#8b5cf6', fontSize: 12 },
  timeValue: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'monospace',
    minWidth: 34,
    textAlign: 'center',
  },
  timeSep: {
    color: '#64748b',
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ─── Component ───────────────────────────────────────────────────────────────

const EventManagementPanel: React.FC = () => {
  // ── State ──
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<EventType | 'ALL'>('ALL');
  const [pricingFilter, setPricingFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Detail modal
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState<CreateEventInput>({
    title: '',
    eventType: 'SOCIAL',
    startDate: '',
    endDate: '',
    isFree: true,
  });
  const [creating, setCreating] = useState(false);

  // Date picker
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerField, setDatePickerField] = useState<'start' | 'end'>('start');

  // Countdown timer
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [usingOfflineData, setUsingOfflineData] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);

  // ── Fetch ──
  const fetchEvents = useCallback(
    async (silent = false, pageNum = 0) => {
      if (!silent && pageNum === 0) setLoading(true);
      else if (silent) setRefreshing(true);
      try {
        const isFreeParam =
          pricingFilter === 'free' ? true : pricingFilter === 'paid' ? false : undefined;
        const res = await eventApi.list({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          eventType: typeFilter !== 'ALL' ? typeFilter : undefined,
          isFree: isFreeParam,
          search: searchQuery || undefined,
          page: pageNum,
          size: 10,
        });
        if (pageNum === 0) {
          setEvents(res.events);
        } else {
          setEvents((prev) => [...prev, ...res.events]);
        }
        setPage(res.page ?? pageNum);
        setHasNext(res.hasNext ?? false);
        setTotalEvents(res.total ?? res.events?.length ?? 0);
        setUsingOfflineData(false);
      } catch (e: any) {
        if (pageNum === 0) {
          const cached = await loadEventsSnapshot();
          if (cached) {
            setEvents(cached.events || []);
            setPage(cached.page ?? 0);
            setHasNext(false);
            setTotalEvents(cached.total ?? (cached.events || []).length);
            setUsingOfflineData(true);
            return;
          }
        }
        console.warn('Event fetch error:', e?.message || e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, typeFilter, pricingFilter, searchQuery]
  );

  const loadMoreEvents = useCallback(async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    try {
      await fetchEvents(true, page + 1);
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasNext, fetchEvents, page]);

  useEffect(() => {
    startOfflineSync();
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    void (async () => {
      const cached = await loadEventsSnapshot();
      if (cached) {
        setEvents(cached.events || []);
        setPage(cached.page ?? 0);
        setHasNext(false);
        setTotalEvents(cached.total ?? (cached.events || []).length);
        setUsingOfflineData(true);
      }
      setCacheReady(true);
    })();
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!cacheReady) return;
    void cacheEventsSnapshot({
      events,
      page,
      hasNext,
      total: totalEvents,
      filters: {
        status: statusFilter,
        type: typeFilter,
        pricing: pricingFilter,
        searchQuery,
      },
    });
  }, [
    cacheReady,
    events,
    page,
    hasNext,
    totalEvents,
    statusFilter,
    typeFilter,
    pricingFilter,
    searchQuery,
  ]);

  // Countdown timer (ticks every 30s to update countdown display)
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdownTick((t) => t + 1), 30000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Recompute countdowns when tick changes
  const eventsWithLiveCountdown = useMemo(() => {
    return events.map((ev) => {
      if (ev.status !== 'INCOMING' || !ev.startDate) return ev;
      const diff = Math.max(0, Math.floor((new Date(ev.startDate).getTime() - Date.now()) / 1000));
      return { ...ev, countdownSeconds: diff };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, countdownTick]);

  // ── Actions ──
  const handleShare = async (ev: EventItem) => {
    try {
      const msg = `📍 ${ev.title}\n📅 ${formatDate(ev.startDate)} → ${formatDate(ev.endDate)}\n📌 ${ev.locationName || 'TBD'}\n${ev.isFree ? 'Free' : `${ev.price} ${ev.currency}`}`;
      await Share.share({ message: msg, title: ev.title });
    } catch {}
  };

  const handleBookmark = async (ev: EventItem) => {
    const nextBookmarked = !ev.bookmarked;
    setEvents((prev) =>
      prev.map((item) => (item.id === ev.id ? { ...item, bookmarked: nextBookmarked } : item))
    );
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent((prev) => (prev ? { ...prev, bookmarked: nextBookmarked } : prev));
    }

    if (!syncStatus.isOnline) {
      await enqueueSyncOperation({ type: 'EVENT_BOOKMARK_TOGGLE', eventId: ev.id });
      return;
    }

    try {
      const res = await eventApi.toggleBookmark(ev.id);
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, bookmarked: res.bookmarked } : e)));
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent((prev) => (prev ? { ...prev, bookmarked: res.bookmarked } : prev));
      }
      setUsingOfflineData(false);
    } catch (e: any) {
      if (isLikelyOfflineError(e)) {
        await enqueueSyncOperation({ type: 'EVENT_BOOKMARK_TOGGLE', eventId: ev.id });
        return;
      }
      setEvents((prev) =>
        prev.map((item) => (item.id === ev.id ? { ...item, bookmarked: ev.bookmarked } : item))
      );
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent((prev) => (prev ? { ...prev, bookmarked: ev.bookmarked } : prev));
      }
      Alert.alert('Error', e?.message || 'Could not toggle bookmark');
    }
  };

  const handleJoin = async (ev: EventItem) => {
    try {
      const updated = await eventApi.join(ev.id);
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)));
      if (selectedEvent?.id === ev.id) setSelectedEvent(updated);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not join event');
    }
  };

  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      Alert.alert('Validation', 'Please enter a title');
      return;
    }
    if (!createForm.startDate || !createForm.endDate) {
      Alert.alert('Validation', 'Please enter start and end dates (ISO format)');
      return;
    }
    setCreating(true);
    try {
      await eventApi.create(createForm);
      setCreateVisible(false);
      setCreateForm({ title: '', eventType: 'SOCIAL', startDate: '', endDate: '', isFree: true });
      fetchEvents();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create event');
    } finally {
      setCreating(false);
    }
  };

  // ── Render helpers ──

  const renderStatusTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
      {STATUS_TABS.map((tab) => {
        const active = statusFilter === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => setStatusFilter(tab.key)}
            style={[styles.statusTab, active && { backgroundColor: tab.color + '22', borderColor: tab.color }]}
          >
            <View style={[styles.statusDot, { backgroundColor: active ? tab.color : '#444' }]} />
            <Text style={[styles.statusTabText, active && { color: tab.color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderFilters = () => {
    if (!showFilters) return null;
    return (
      <Animated.View entering={FadeInDown.duration(250)} style={styles.filtersContainer}>
        {/* Type filter */}
        <Text style={styles.filterLabel}>Event Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {EVENT_TYPES.map((t) => {
            const active = typeFilter === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTypeFilter(t.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Pricing filter */}
        <Text style={[styles.filterLabel, { marginTop: 10 }]}>Pricing</Text>
        <View style={styles.pricingRow}>
          {PRICING_FILTERS.map((p) => {
            const active = pricingFilter === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPricingFilter(p.key)}
                style={[styles.filterChip, active && styles.filterChipActive, { marginRight: 8 }]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  const renderEventCard = (ev: EventItem, idx: number) => {
    const sColor = statusColor(ev.status);
    const countdown = ev.countdownSeconds;
    return (
      <Animated.View key={ev.id} entering={FadeInDown.delay(50 * idx).duration(320)}>
        <Pressable style={styles.eventCard} onPress={() => setSelectedEvent(ev)}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.typeIcon}>{TYPE_ICON[ev.eventType] || '📌'}</Text>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {ev.title}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: sColor + '22', borderColor: sColor }]}>
              <Text style={[styles.statusBadgeText, { color: sColor }]}>{ev.status}</Text>
            </View>
          </View>

          {/* Countdown */}
          {ev.status === 'INCOMING' && countdown != null && countdown > 0 && (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownIcon}>⏳</Text>
              <Text style={styles.countdownText}>Starts in {formatCountdown(countdown)}</Text>
            </View>
          )}

          {/* Meta */}
          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>📅 {formatDate(ev.startDate)}</Text>
          </View>
          {ev.locationName ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaItem}>📍 {ev.locationName}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>
              👥 {ev.currentAttendees}
              {ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''}
            </Text>
            <Text style={styles.metaItem}>
              {ev.isFree ? '🆓 Free' : `💰 ${ev.price ?? ''} ${ev.currency}`}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            <Pressable style={styles.actionBtn} onPress={() => handleBookmark(ev)}>
              <Text style={styles.actionBtnText}>{ev.bookmarked ? '★' : '☆'}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => handleShare(ev)}>
              <Text style={styles.actionBtnText}>↗</Text>
            </Pressable>
            {ev.status !== 'COMPLETED' && (
              <Pressable style={[styles.actionBtn, styles.joinBtn]} onPress={() => handleJoin(ev)}>
                <Text style={[styles.actionBtnText, { color: '#10b981' }]}>Join</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const renderDetailModal = () => {
    if (!selectedEvent) return null;
    const ev = selectedEvent;
    const sColor = statusColor(ev.status);
    const countdown = ev.status === 'INCOMING' && ev.startDate
      ? Math.max(0, Math.floor((new Date(ev.startDate).getTime() - Date.now()) / 1000))
      : null;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedEvent(null)}>
        <View style={styles.modalBackdrop}>
          <Animated.View entering={FadeInUp.duration(300)} style={styles.detailModal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Close */}
              <Pressable style={styles.closeBtn} onPress={() => setSelectedEvent(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>

              {/* Title & Status */}
              <View style={styles.detailHeaderRow}>
                <Text style={styles.detailTypeIcon}>{TYPE_ICON[ev.eventType] || '📌'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{ev.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sColor + '22', borderColor: sColor, alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={[styles.statusBadgeText, { color: sColor }]}>{ev.status}</Text>
                  </View>
                </View>
              </View>

              {/* Countdown */}
              {countdown != null && countdown > 0 && (
                <View style={styles.detailCountdown}>
                  <Text style={styles.detailCountdownLabel}>⏳ Starts in</Text>
                  <Text style={styles.detailCountdownValue}>{formatCountdown(countdown)}</Text>
                </View>
              )}

              {/* Description */}
              {ev.description ? (
                <Text style={styles.detailDesc}>{ev.description}</Text>
              ) : null}

              {/* Info rows */}
              <View style={styles.detailInfoBlock}>
                <DetailRow label="Type" value={`${TYPE_ICON[ev.eventType] || ''} ${ev.eventType}`} />
                <DetailRow label="Start" value={formatDate(ev.startDate)} />
                <DetailRow label="End" value={formatDate(ev.endDate)} />
                <DetailRow label="Location" value={ev.locationName || 'Not specified'} />
                <DetailRow label="Price" value={ev.isFree ? 'Free' : `${ev.price ?? '—'} ${ev.currency}`} />
                <DetailRow label="Attendees" value={`${ev.currentAttendees}${ev.maxAttendees ? ' / ' + ev.maxAttendees : ''}`} />
                <DetailRow label="Organizer" value={ev.organizerUsername} />
              </View>

              {/* Action buttons */}
              <View style={styles.detailActions}>
                <Pressable style={[styles.detailActionBtn, { backgroundColor: '#1e293b' }]} onPress={() => handleBookmark(ev)}>
                  <Text style={styles.detailActionText}>{ev.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</Text>
                </Pressable>
                <Pressable style={[styles.detailActionBtn, { backgroundColor: '#1e293b' }]} onPress={() => handleShare(ev)}>
                  <Text style={styles.detailActionText}>↗ Share</Text>
                </Pressable>
                {ev.status !== 'COMPLETED' && (
                  <Pressable style={[styles.detailActionBtn, { backgroundColor: '#064e3b' }]} onPress={() => handleJoin(ev)}>
                    <Text style={[styles.detailActionText, { color: '#34d399' }]}>Join Event</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  const renderCreateModal = () => (
    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalBackdrop}>
        <Animated.View entering={FadeInUp.duration(300)} style={styles.createModal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.createTitle}>Create Event</Text>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Event title"
              placeholderTextColor="#6b7280"
              value={createForm.title}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, title: v }))}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor="#6b7280"
              value={createForm.description ?? ''}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, description: v }))}
              multiline
            />

            <Text style={styles.inputLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {EVENT_TYPES.filter((t) => t.key !== 'ALL').map((t) => {
                const active = createForm.eventType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setCreateForm((p) => ({ ...p, eventType: t.key as EventType }))}
                    style={[styles.filterChip, active && styles.filterChipActive, { marginRight: 6 }]}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Start Date *</Text>
            <Pressable
              style={styles.datePickerBtn}
              onPress={() => { setDatePickerField('start'); setDatePickerVisible(true); }}
            >
              <Text style={createForm.startDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                {createForm.startDate ? formatDate(createForm.startDate) : 'Tap to select start date'}
              </Text>
              <Text style={styles.datePickerIcon}>📅</Text>
            </Pressable>

            <Text style={styles.inputLabel}>End Date *</Text>
            <Pressable
              style={styles.datePickerBtn}
              onPress={() => { setDatePickerField('end'); setDatePickerVisible(true); }}
            >
              <Text style={createForm.endDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                {createForm.endDate ? formatDate(createForm.endDate) : 'Tap to select end date'}
              </Text>
              <Text style={styles.datePickerIcon}>📅</Text>
            </Pressable>

            <Text style={styles.inputLabel}>Location Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Central Park"
              placeholderTextColor="#6b7280"
              value={createForm.locationName ?? ''}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, locationName: v }))}
            />

            <Text style={styles.inputLabel}>Max Attendees</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50"
              placeholderTextColor="#6b7280"
              keyboardType="number-pad"
              value={createForm.maxAttendees != null ? String(createForm.maxAttendees) : ''}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, maxAttendees: v ? parseInt(v, 10) : undefined }))}
            />

            <View style={styles.freeRow}>
              <Text style={styles.inputLabel}>Free Event?</Text>
              <Pressable
                style={[styles.toggleBtn, createForm.isFree && styles.toggleBtnActive]}
                onPress={() => setCreateForm((p) => ({ ...p, isFree: !p.isFree }))}
              >
                <Text style={styles.toggleBtnText}>{createForm.isFree ? 'Yes' : 'No'}</Text>
              </Pressable>
            </View>

            {!createForm.isFree && (
              <>
                <Text style={styles.inputLabel}>Price</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 50000"
                  placeholderTextColor="#6b7280"
                  keyboardType="numeric"
                  value={createForm.price != null ? String(createForm.price) : ''}
                  onChangeText={(v) => setCreateForm((p) => ({ ...p, price: v ? parseFloat(v) : undefined }))}
                />
              </>
            )}

            <View style={styles.createActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setCreateVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={handleCreate} disabled={creating}>
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Create</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );

  // ── Main render ──
  return (
    <View style={styles.container}>
      {(!syncStatus.isOnline || syncStatus.pendingCount > 0 || usingOfflineData) && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {!syncStatus.isOnline
              ? 'Offline mode: showing cached events.'
              : usingOfflineData
                ? 'Showing cached events while refreshing.'
                : 'Connection restored.'}
            {syncStatus.pendingCount > 0 ? ` Pending sync: ${syncStatus.pendingCount}.` : ''}
          </Text>
        </View>
      )}

      {/* Search + filter toggle */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search events by name..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Pressable
          style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          onPress={() => setShowFilters((p) => !p)}
        >
          <Text style={styles.filterToggleText}>⚙</Text>
        </Pressable>
        <Pressable style={styles.createFloatingBtn} onPress={() => setCreateVisible(true)}>
          <Text style={styles.createFloatingBtnText}>+</Text>
        </Pressable>
      </View>

      {/* Status tabs */}
      {renderStatusTabs()}

      {/* Collapsible filters */}
      {renderFilters()}

      {/* Events list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : eventsWithLiveCountdown.length === 0 ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No events found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters or create a new event</Text>
        </Animated.View>
      ) : (
        <View style={styles.eventsList}>
          {eventsWithLiveCountdown.map((ev, idx) => renderEventCard(ev, idx))}
          {hasNext && (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={loadMoreEvents}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color="#8b5cf6" />
              ) : (
                <Text style={styles.loadMoreText}>Load more events…</Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* Refresh button */}
      {!loading && (
        <Pressable style={styles.refreshBtn} onPress={() => fetchEvents(true)}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#a78bfa" />
          ) : (
            <Text style={styles.refreshBtnText}>↻ Refresh</Text>
          )}
        </Pressable>
      )}

      {/* Modals */}
      {renderDetailModal()}
      {renderCreateModal()}

      {/* Date Time Picker */}
      <CustomDateTimePicker
        visible={datePickerVisible}
        title={datePickerField === 'start' ? 'Select Start Date & Time' : 'Select End Date & Time'}
        value={(() => {
          const iso = datePickerField === 'start' ? createForm.startDate : createForm.endDate;
          const d = iso ? new Date(iso) : new Date();
          return isNaN(d.getTime()) ? new Date() : d;
        })()}
        onCancel={() => setDatePickerVisible(false)}
        onConfirm={(date) => {
          const iso = date.toISOString().replace(/\.\d{3}Z$/, '');
          if (datePickerField === 'start') {
            setCreateForm((p) => ({ ...p, startDate: iso }));
          } else {
            setCreateForm((p) => ({ ...p, endDate: iso }));
          }
          setDatePickerVisible(false);
        }}
      />
    </View>
  );
};

// ── Small sub-component ──
const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailRowLabel}>{label}</Text>
    <Text style={styles.detailRowValue}>{value}</Text>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  offlineBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e3442',
    backgroundColor: '#111826',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  offlineBannerText: {
    color: '#b8c3d9',
    fontSize: 12,
    lineHeight: 18,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    color: '#e2e8f0',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf615',
  },
  filterToggleText: {
    fontSize: 18,
    color: '#cbd5e1',
  },
  createFloatingBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createFloatingBtnText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
    marginTop: -1,
  },

  // Status tabs
  tabScroll: {
    marginBottom: 10,
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#111',
    marginRight: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusTabText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },

  // Filters
  filtersContainer: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 12,
    marginBottom: 10,
  },
  filterLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterScroll: {
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#0d0d0d',
    marginRight: 6,
  },
  filterChipActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf618',
  },
  filterChipText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  filterChipTextActive: {
    color: '#c4b5fd',
    fontWeight: '600',
  },
  pricingRow: {
    flexDirection: 'row',
  },

  // Event card
  eventCard: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  typeIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e8f0',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Countdown
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  countdownIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  countdownText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  metaItem: {
    fontSize: 13,
    color: '#94a3b8',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e1e',
    paddingTop: 10,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  actionBtnText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  joinBtn: {
    borderColor: '#10b981',
    backgroundColor: '#064e3b22',
  },

  // Loading / empty
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 12,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#64748b',
    fontSize: 13,
  },
  eventsList: {
    marginTop: 2,
  },
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#8b5cf633',
  },
  loadMoreText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },

  // Refresh
  refreshBtn: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    marginTop: 6,
    marginBottom: 10,
  },
  refreshBtnText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },

  // Detail modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailModal: {
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 20,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  detailTypeIcon: {
    fontSize: 32,
    marginTop: 2,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f1f5f9',
  },
  detailCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  detailCountdownLabel: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '600',
  },
  detailCountdownValue: {
    color: '#bfdbfe',
    fontSize: 18,
    fontWeight: '800',
  },
  detailDesc: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  detailInfoBlock: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  detailRowLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  detailRowValue: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  detailActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  detailActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  detailActionText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },

  // Create modal
  createModal: {
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 20,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 480,
  },
  createTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    color: '#e2e8f0',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  datePickerBtn: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerValue: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  datePickerPlaceholder: {
    color: '#6b7280',
    fontSize: 14,
  },
  datePickerIcon: {
    fontSize: 16,
  },
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  toggleBtnActive: {
    borderColor: '#10b981',
    backgroundColor: '#064e3b22',
  },
  toggleBtnText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#111',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default EventManagementPanel;
