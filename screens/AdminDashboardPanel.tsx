import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  adminApi,
  AdminAnalytics,
  AdminReviewItem,
  AdminUserListResponse,
  EventItem,
  EventListResponse,
  EventModerationStatus,
  ReviewItem,
  ReviewModerationStatus,
} from '../services/backend';

type AdminSection = 'users' | 'events' | 'reviews' | 'analytics';

type RejectTarget = {
  id: number;
  title: string;
} | null;

const SECTION_TABS: { key: AdminSection; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'events', label: 'Events' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'analytics', label: 'Analytics' },
];

const MODERATION_FILTERS: { key: EventModerationStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const REVIEW_FILTERS: { key: ReviewModerationStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'FLAGGED', label: 'Flagged' },
];

const emptyUsers: AdminUserListResponse = {
  users: [],
  total: 0,
  page: 0,
  size: 10,
  totalPages: 0,
  hasNext: false,
};

const emptyEvents: EventListResponse = {
  events: [],
  total: 0,
  page: 0,
  size: 10,
  totalPages: 0,
  hasNext: false,
  filterStatus: null,
  filterType: null,
  searchQuery: null,
};

const emptyReviews = {
  reviews: [] as AdminReviewItem[],
  total: 0,
  page: 0,
  size: 10,
  totalPages: 0,
  hasNext: false,
};

const emptyFlagged = {
  reviews: [] as ReviewItem[],
  total: 0,
  page: 0,
  size: 10,
  totalPages: 0,
  hasNext: false,
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statColor = (status?: string | null) => {
  if (status === 'APPROVED') return '#0f766e';
  if (status === 'PENDING') return '#9a3412';
  if (status === 'REJECTED') return '#991b1b';
  if (status === 'FLAGGED') return '#9f1239';
  return '#1f2937';
};

const AdminDashboardPanel: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AdminSection>('users');
  const [loadedSections, setLoadedSections] = useState<Record<AdminSection, boolean>>({
    users: false,
    events: false,
    reviews: false,
    analytics: false,
  });

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersData, setUsersData] = useState<AdminUserListResponse>(emptyUsers);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersPage, setUsersPage] = useState(0);

  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsData, setEventsData] = useState<EventListResponse>(emptyEvents);
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventModeration, setEventModeration] = useState<EventModerationStatus | 'ALL'>('PENDING');
  const [eventsPage, setEventsPage] = useState(0);

  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsData, setReviewsData] = useState(emptyReviews);
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [reviewStatus, setReviewStatus] = useState<ReviewModerationStatus | 'ALL'>('ALL');
  const [reviewsPage, setReviewsPage] = useState(0);

  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [flaggedData, setFlaggedData] = useState(emptyFlagged);

  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);

  const [actionEventId, setActionEventId] = useState<number | null>(null);
  const [actionReviewId, setActionReviewId] = useState<number | null>(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadUsers = useCallback(
    async (page = usersPage) => {
      try {
        setUsersLoading(true);
        const payload = await adminApi.listUsers({
          search: usersSearch.trim() || undefined,
          page,
          size: 10,
        });
        setUsersData(payload);
        setUsersPage(page);
      } catch (error: any) {
        Alert.alert('Users', error?.message || 'Failed to load users');
      } finally {
        setUsersLoading(false);
      }
    },
    [usersPage, usersSearch]
  );

  const loadEvents = useCallback(
    async (
      page = eventsPage,
      moderationStatus: EventModerationStatus | 'ALL' = eventModeration,
      searchValue: string = eventsSearch
    ) => {
      try {
        setEventsLoading(true);
        const payload = await adminApi.listEvents({
          moderationStatus,
          search: searchValue.trim() || undefined,
          page,
          size: 10,
        });
        setEventsData(payload);
        setEventsPage(page);
      } catch (error: any) {
        Alert.alert('Events', error?.message || 'Failed to load events');
      } finally {
        setEventsLoading(false);
      }
    },
    [eventModeration, eventsPage, eventsSearch]
  );

  const loadReviews = useCallback(
    async (
      page = reviewsPage,
      moderationStatus: ReviewModerationStatus | 'ALL' = reviewStatus,
      searchValue: string = reviewsSearch
    ) => {
      try {
        setReviewsLoading(true);
        const payload = await adminApi.listReviews({
          moderationStatus,
          search: searchValue.trim() || undefined,
          page,
          size: 10,
        });
        setReviewsData(payload);
        setReviewsPage(page);
      } catch (error: any) {
        Alert.alert('Reviews', error?.message || 'Failed to load reviews');
      } finally {
        setReviewsLoading(false);
      }
    },
    [reviewStatus, reviewsPage, reviewsSearch]
  );

  const loadFlagged = useCallback(async () => {
    try {
      setFlaggedLoading(true);
      const payload = await adminApi.getFlaggedReviews(0, 10);
      setFlaggedData(payload);
    } catch (error: any) {
      Alert.alert('Flagged', error?.message || 'Failed to load flagged reviews');
    } finally {
      setFlaggedLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const payload = await adminApi.analytics(14);
      setAnalytics(payload);
    } catch (error: any) {
      Alert.alert('Analytics', error?.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedSections[activeSection]) {
      return;
    }

    setLoadedSections((prev) => ({ ...prev, [activeSection]: true }));

    if (activeSection === 'users') {
      loadUsers(0);
      return;
    }

    if (activeSection === 'events') {
      loadEvents(0);
      return;
    }

    if (activeSection === 'reviews') {
      loadReviews(0);
      loadFlagged();
      return;
    }

    loadAnalytics();
  }, [activeSection, loadAnalytics, loadEvents, loadFlagged, loadReviews, loadUsers, loadedSections]);

  const openRejectModal = (event: EventItem) => {
    setRejectTarget({ id: event.id, title: event.title });
    setRejectReason(event.moderationReason || '');
    setRejectModalVisible(true);
  };

  const approveEvent = async (event: EventItem) => {
    try {
      setActionEventId(event.id);
      await adminApi.approveEvent(event.id);
      await loadEvents(eventsPage);
      if (analytics) {
        await loadAnalytics();
      }
    } catch (error: any) {
      Alert.alert('Approve event', error?.message || 'Action failed');
    } finally {
      setActionEventId(null);
    }
  };

  const rejectEvent = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      Alert.alert('Reject event', 'Please provide a reason.');
      return;
    }

    try {
      setActionEventId(rejectTarget.id);
      await adminApi.rejectEvent(rejectTarget.id, rejectReason.trim());
      setRejectModalVisible(false);
      setRejectTarget(null);
      setRejectReason('');
      await loadEvents(eventsPage);
      if (analytics) {
        await loadAnalytics();
      }
    } catch (error: any) {
      Alert.alert('Reject event', error?.message || 'Action failed');
    } finally {
      setActionEventId(null);
    }
  };

  const approveFlaggedReview = async (reviewId: number) => {
    try {
      setActionReviewId(reviewId);
      await adminApi.approveFlaggedReview(reviewId);
      await Promise.all([loadReviews(reviewsPage), loadFlagged()]);
      if (analytics) {
        await loadAnalytics();
      }
    } catch (error: any) {
      Alert.alert('Approve review', error?.message || 'Action failed');
    } finally {
      setActionReviewId(null);
    }
  };

  const deleteFlaggedReview = async (reviewId: number) => {
    Alert.alert('Delete flagged review', 'Delete this flagged review permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setActionReviewId(reviewId);
            await adminApi.deleteFlaggedReview(reviewId);
            await Promise.all([loadReviews(reviewsPage), loadFlagged()]);
            if (analytics) {
              await loadAnalytics();
            }
          } catch (error: any) {
            Alert.alert('Delete review', error?.message || 'Action failed');
          } finally {
            setActionReviewId(null);
          }
        },
      },
    ]);
  };

  const summaryCards = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: 'Total Users', value: analytics.totalUsers },
      { label: 'Active Users', value: analytics.activeUsersInWindow },
      { label: 'Total Events', value: analytics.totalEvents },
      { label: 'Pending Events', value: analytics.pendingEvents },
      { label: 'Rejected Events', value: analytics.rejectedEvents },
      { label: 'Flagged Reviews', value: analytics.flaggedReviews },
      { label: 'Total Reviews', value: analytics.totalReviews },
      { label: 'Logins (Window)', value: analytics.successfulLoginsInWindow },
    ];
  }, [analytics]);

  const renderUsers = () => (
    <View style={styles.block}>
      <View style={styles.toolbarRow}>
        <TextInput
          value={usersSearch}
          onChangeText={setUsersSearch}
          placeholder="Search username/email"
          placeholderTextColor="#6b7280"
          style={styles.searchInput}
        />
        <Pressable
          style={styles.toolbarButton}
          onPress={() => loadUsers(0)}
          disabled={usersLoading}
        >
          <Text style={styles.toolbarButtonText}>Search</Text>
        </Pressable>
      </View>

      {usersLoading ? (
        <ActivityIndicator color="#f8fafc" style={{ marginTop: 16 }} />
      ) : (
        <>
          {usersData.users.map((item) => (
            <View style={styles.card} key={`user-${item.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.username}</Text>
                <Text style={[styles.badge, { backgroundColor: item.isActive ? '#065f46' : '#7f1d1d' }]}>
                  {item.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <Text style={styles.metaText}>{item.email}</Text>
              <Text style={styles.metaText}>
                Role: {item.isSuperuser ? 'Admin' : item.isStaff ? 'Staff' : 'User'}
              </Text>
              <Text style={styles.metaText}>Joined: {formatDate(item.dateJoined)}</Text>
              <Text style={styles.metaText}>Last Login: {formatDate(item.lastLogin)}</Text>
              {!!(item.firstName || item.lastName) && (
                <Text style={styles.metaText}>Name: {[item.firstName, item.lastName].filter(Boolean).join(' ')}</Text>
              )}
            </View>
          ))}

          {!usersData.users.length && <Text style={styles.emptyText}>No users found.</Text>}

          <View style={styles.paginationRow}>
            <Pressable
              onPress={() => loadUsers(Math.max(0, usersPage - 1))}
              disabled={usersLoading || usersPage <= 0}
              style={[styles.pageButton, usersPage <= 0 && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Prev</Text>
            </Pressable>
            <Text style={styles.pageMeta}>Page {usersData.page + 1} / {Math.max(1, usersData.totalPages)}</Text>
            <Pressable
              onPress={() => loadUsers(usersPage + 1)}
              disabled={usersLoading || !usersData.hasNext}
              style={[styles.pageButton, !usersData.hasNext && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  const renderEvents = () => (
    <View style={styles.block}>
      <View style={styles.toolbarRow}>
        <TextInput
          value={eventsSearch}
          onChangeText={setEventsSearch}
          placeholder="Search event title"
          placeholderTextColor="#6b7280"
          style={styles.searchInput}
        />
        <Pressable style={styles.toolbarButton} onPress={() => loadEvents(0)} disabled={eventsLoading}>
          <Text style={styles.toolbarButtonText}>Search</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentWrap}>
        {MODERATION_FILTERS.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.segmentBtn, eventModeration === item.key && styles.segmentBtnActive]}
            onPress={() => {
              setEventModeration(item.key);
              setEventsPage(0);
              loadEvents(0, item.key, eventsSearch);
            }}
          >
            <Text style={[styles.segmentText, eventModeration === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {eventsLoading ? (
        <ActivityIndicator color="#f8fafc" style={{ marginTop: 16 }} />
      ) : (
        <>
          {eventsData.events.map((item) => (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.card} key={`event-${item.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.badge, { backgroundColor: statColor(item.moderationStatus) }]}>
                  {item.moderationStatus}
                </Text>
              </View>
              <Text style={styles.metaText}>{item.eventType} • {item.status}</Text>
              <Text style={styles.metaText}>By {item.organizerUsername}</Text>
              <Text style={styles.metaText}>{formatDate(item.startDate)} → {formatDate(item.endDate)}</Text>
              {!!item.locationName && <Text style={styles.metaText}>Location: {item.locationName}</Text>}
              {!!item.moderationReason && <Text style={styles.warningText}>Reason: {item.moderationReason}</Text>}

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.approveBtn]}
                  disabled={actionEventId === item.id || item.moderationStatus === 'APPROVED'}
                  onPress={() => approveEvent(item)}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.rejectBtn]}
                  disabled={actionEventId === item.id}
                  onPress={() => openRejectModal(item)}
                >
                  <Text style={styles.actionText}>Reject</Text>
                </Pressable>
              </View>
            </Animated.View>
          ))}

          {!eventsData.events.length && <Text style={styles.emptyText}>No events found for this filter.</Text>}

          <View style={styles.paginationRow}>
            <Pressable
              onPress={() => loadEvents(Math.max(0, eventsPage - 1))}
              disabled={eventsLoading || eventsPage <= 0}
              style={[styles.pageButton, eventsPage <= 0 && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Prev</Text>
            </Pressable>
            <Text style={styles.pageMeta}>Page {eventsData.page + 1} / {Math.max(1, eventsData.totalPages)}</Text>
            <Pressable
              onPress={() => loadEvents(eventsPage + 1)}
              disabled={eventsLoading || !eventsData.hasNext}
              style={[styles.pageButton, !eventsData.hasNext && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  const renderReviews = () => (
    <View style={styles.block}>
      <View style={styles.toolbarRow}>
        <TextInput
          value={reviewsSearch}
          onChangeText={setReviewsSearch}
          placeholder="Search by content or place"
          placeholderTextColor="#6b7280"
          style={styles.searchInput}
        />
        <Pressable style={styles.toolbarButton} onPress={() => loadReviews(0)} disabled={reviewsLoading}>
          <Text style={styles.toolbarButtonText}>Search</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentWrap}>
        {REVIEW_FILTERS.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.segmentBtn, reviewStatus === item.key && styles.segmentBtnActive]}
            onPress={() => {
              setReviewStatus(item.key);
              setReviewsPage(0);
              loadReviews(0, item.key, reviewsSearch);
            }}
          >
            <Text style={[styles.segmentText, reviewStatus === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {reviewsLoading ? (
        <ActivityIndicator color="#f8fafc" style={{ marginTop: 16 }} />
      ) : (
        <>
          {reviewsData.reviews.map((item) => (
            <View style={styles.card} key={`review-${item.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.targetName || item.targetId}</Text>
                <Text style={[styles.badge, { backgroundColor: statColor(item.moderationStatus) }]}>
                  {item.moderationStatus || 'N/A'}
                </Text>
              </View>
              <Text style={styles.metaText}>{item.targetType} • Rating {item.rating}/5</Text>
              <Text style={styles.metaText}>By {item.authorUsername || 'Unknown'} • Flags {item.flagCount}</Text>
              {!!item.comment && <Text style={styles.metaText}>{item.comment}</Text>}
            </View>
          ))}

          {!reviewsData.reviews.length && <Text style={styles.emptyText}>No reviews found.</Text>}

          <View style={styles.paginationRow}>
            <Pressable
              onPress={() => loadReviews(Math.max(0, reviewsPage - 1))}
              disabled={reviewsLoading || reviewsPage <= 0}
              style={[styles.pageButton, reviewsPage <= 0 && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Prev</Text>
            </Pressable>
            <Text style={styles.pageMeta}>Page {reviewsData.page + 1} / {Math.max(1, reviewsData.totalPages)}</Text>
            <Pressable
              onPress={() => loadReviews(reviewsPage + 1)}
              disabled={reviewsLoading || !reviewsData.hasNext}
              style={[styles.pageButton, !reviewsData.hasNext && styles.pageButtonDisabled]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.subSectionHeader}>
        <Text style={styles.subSectionTitle}>Flagged Queue</Text>
        <Pressable style={styles.toolbarButton} onPress={loadFlagged} disabled={flaggedLoading}>
          <Text style={styles.toolbarButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {flaggedLoading ? (
        <ActivityIndicator color="#f8fafc" style={{ marginTop: 12 }} />
      ) : (
        <>
          {flaggedData.reviews.map((item) => (
            <View style={styles.card} key={`flagged-${item.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.targetName}</Text>
                <Text style={[styles.badge, { backgroundColor: '#9f1239' }]}>FLAGGED</Text>
              </View>
              <Text style={styles.metaText}>By {item.authorUsername} • Flags {item.flagCount}</Text>
              <Text style={styles.metaText}>{item.comment}</Text>
              {!!item.reportReasons?.length && (
                <Text style={styles.warningText}>Reasons: {item.reportReasons.join(', ')}</Text>
              )}
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => approveFlaggedReview(item.id)}
                  disabled={actionReviewId === item.id}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => deleteFlaggedReview(item.id)}
                  disabled={actionReviewId === item.id}
                >
                  <Text style={styles.actionText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {!flaggedData.reviews.length && <Text style={styles.emptyText}>No flagged reviews right now.</Text>}
        </>
      )}
    </View>
  );

  const renderAnalytics = () => (
    <View style={styles.block}>
      <View style={styles.subSectionHeader}>
        <Text style={styles.subSectionTitle}>Window: 14 days</Text>
        <Pressable style={styles.toolbarButton} onPress={loadAnalytics} disabled={analyticsLoading}>
          <Text style={styles.toolbarButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {analyticsLoading ? (
        <ActivityIndicator color="#f8fafc" style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={styles.statsWrap}>
            {summaryCards.map((item) => (
              <View key={item.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{item.label}</Text>
                <Text style={styles.statValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.subSectionTitle}>Top User Activity</Text>
          {analytics?.userActivity?.map((item) => (
            <View style={styles.card} key={`activity-${item.userId}`}>
              <Text style={styles.cardTitle}>{item.username || item.email || `User ${item.userId}`}</Text>
              <Text style={styles.metaText}>
                Logins {item.successfulLogins} • Events {item.eventsCreated} • Reviews {item.reviewsCreated}
              </Text>
            </View>
          ))}

          <Text style={styles.subSectionTitle}>Top Places</Text>
          {analytics?.topPlaces?.map((item, idx) => (
            <View style={styles.rowItem} key={`place-${idx}`}>
              <Text style={styles.metaText}>{idx + 1}. {item.place}</Text>
              <Text style={styles.rowValue}>{item.score}</Text>
            </View>
          ))}

          <Text style={styles.subSectionTitle}>Traffic Stats</Text>
          {analytics?.trafficStats?.map((item) => (
            <View style={styles.rowItem} key={`traffic-${item.date}`}>
              <Text style={styles.metaText}>{item.date}</Text>
              <Text style={styles.rowValue}>
                L:{item.successfulLogins} E:{item.eventsCreated} R:{item.reviewsCreated}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentWrap}>
        {SECTION_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.segmentBtn, activeSection === tab.key && styles.segmentBtnActive]}
            onPress={() => setActiveSection(tab.key)}
          >
            <Text style={[styles.segmentText, activeSection === tab.key && styles.segmentTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {activeSection === 'users' && renderUsers()}
      {activeSection === 'events' && renderEvents()}
      {activeSection === 'reviews' && renderReviews()}
      {activeSection === 'analytics' && renderAnalytics()}

      <Modal visible={rejectModalVisible} transparent animationType="fade" onRequestClose={() => setRejectModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Event</Text>
            <Text style={styles.metaText}>{rejectTarget?.title}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason"
              placeholderTextColor="#6b7280"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionBtn, styles.modalCancel]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectTarget(null);
                  setRejectReason('');
                }}
              >
                <Text style={styles.actionText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.rejectBtn]} onPress={rejectEvent}>
                <Text style={styles.actionText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  block: {
    gap: 10,
  },
  segmentWrap: {
    gap: 8,
    paddingBottom: 2,
  },
  segmentBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentBtnActive: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  segmentText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  segmentTextActive: {
    color: '#0b0f13',
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2d3748',
    borderRadius: 10,
    backgroundColor: '#111827',
    color: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  toolbarButton: {
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toolbarButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  card: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 11,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    color: '#f8fafc',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
  },
  warningText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  approveBtn: {
    backgroundColor: '#065f46',
    borderColor: '#065f46',
  },
  rejectBtn: {
    backgroundColor: '#991b1b',
    borderColor: '#991b1b',
  },
  modalCancel: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  paginationRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageButton: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  pageMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  subSectionHeader: {
    marginTop: 10,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subSectionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  statsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    backgroundColor: '#0f172a',
    padding: 10,
    gap: 4,
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  rowItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingVertical: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowValue: {
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  modalInput: {
    minHeight: 86,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

export default AdminDashboardPanel;
