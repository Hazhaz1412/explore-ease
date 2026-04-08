import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  apiBaseUrl,
  CreateReviewInput,
  ReviewItem,
  ReviewSortBy,
  ReviewSummary,
  ReviewTargetType,
  reviewApi,
  sessionStore,
} from '../services/backend';

type TargetFilter = 'ALL' | ReviewTargetType;
type ViewMode = 'all' | 'mine' | 'admin';

const PAGE_SIZE = 10;

const TARGET_OPTIONS: { key: TargetFilter; label: string; icon: string }[] = [
  { key: 'ALL', label: 'All', icon: 'ALL' },
  { key: 'PLACE', label: 'Place', icon: 'PLC' },
  { key: 'EVENT', label: 'Event', icon: 'EVT' },
  { key: 'ATTRACTION', label: 'Attraction', icon: 'ATT' },
  { key: 'CUISINE', label: 'Cuisine', icon: 'FOOD' },
  { key: 'ACTIVITY', label: 'Activity', icon: 'ACT' },
];

const SORT_OPTIONS: { key: ReviewSortBy; label: string }[] = [
  { key: 'NEWEST', label: 'Newest' },
  { key: 'TOP_RATED', label: 'Top Rated' },
  { key: 'MOST_HELPFUL', label: 'Most Helpful' },
];

const REPORT_REASONS = ['Spam', 'Offensive Content', 'False Information', 'Harassment', 'Other'];

const defaultForm: CreateReviewInput = {
  targetType: 'PLACE',
  targetId: '',
  targetName: '',
  rating: 5,
  comment: '',
  photoUrl: '',
};

const resolveAvatarUri = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${apiBaseUrl}${value}`;
  }
  return `${apiBaseUrl}/${value}`;
};

const CommunityReviewsPanel: React.FC = () => {
  const currentUser = sessionStore.get()?.user;
  const currentUserId = currentUser?.id;
  const isAdmin = !!(currentUser?.isSuperuser || currentUser?.isStaff);

  const [activeView, setActiveView] = useState<ViewMode>('all');
  const [activeFilter, setActiveFilter] = useState<TargetFilter>('ALL');
  const [sortBy, setSortBy] = useState<ReviewSortBy>('NEWEST');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [totalReviews, setTotalReviews] = useState(0);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateReviewInput>(defaultForm);

  const [replyVisible, setReplyVisible] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyReview, setReplyReview] = useState<ReviewItem | null>(null);
  const [replyText, setReplyText] = useState('');

  const [reportVisible, setReportVisible] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReview, setReportReview] = useState<ReviewItem | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');

  const totalPages = useMemo(() => Math.ceil(totalReviews / PAGE_SIZE), [totalReviews]);

  const slugify = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const starsText = (rating: number) => {
    const rounded = Math.max(1, Math.min(5, Math.round(rating || 0)));
    return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
  };

  const targetMeta = (targetType: string) =>
    TARGET_OPTIONS.find((item) => item.key === targetType) || TARGET_OPTIONS[0];

  const applyResponse = useCallback((payload: { reviews?: ReviewItem[]; total?: number; page?: number; hasNext?: boolean; summary?: ReviewSummary | null }, pageNum: number) => {
    const nextReviews: ReviewItem[] = payload?.reviews || [];
    if (pageNum === 0) {
      setReviews(nextReviews);
    } else {
      setReviews((prev) => [...prev, ...nextReviews]);
    }
    setPage(payload?.page ?? pageNum);
    setHasNext(!!payload?.hasNext);
    setTotalReviews(payload?.total ?? 0);
    setSummary(payload?.summary ?? null);
  }, []);

  const fetchReviews = useCallback(
    async (pageNum = 0, silent = false) => {
      if (!silent && pageNum === 0) setLoading(true);
      try {
        if (activeView === 'mine') {
          const response = await reviewApi.myReviews(pageNum, PAGE_SIZE);
          applyResponse(response, pageNum);
        } else if (activeView === 'admin') {
          const response = await reviewApi.getFlagged(pageNum, PAGE_SIZE);
          applyResponse(response, pageNum);
        } else {
          const response = await reviewApi.list({
            targetType: activeFilter !== 'ALL' ? activeFilter : undefined,
            search: searchTerm || undefined,
            sortBy,
            page: pageNum,
            size: PAGE_SIZE,
          });
          applyResponse(response, pageNum);
        }
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Could not load reviews');
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, activeView, applyResponse, searchTerm, sortBy]
  );

  useEffect(() => {
    fetchReviews(0);
  }, [fetchReviews]);

  const loadMore = useCallback(async () => {
    if (!hasNext || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchReviews(page + 1, true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchReviews, hasNext, loadingMore, page]);

  const resetComposer = () => {
    setCreateVisible(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const openCreate = () => {
    resetComposer();
    setCreateVisible(true);
  };

  const openEdit = (review: ReviewItem) => {
    setEditingId(review.id);
    setForm({
      targetType: review.targetType,
      targetId: review.targetId,
      targetName: review.targetName,
      rating: review.rating,
      comment: review.comment,
      photoUrl: review.photoUrl || '',
    });
    setCreateVisible(true);
  };

  const submitReview = async () => {
    if (!form.targetName.trim() || !form.comment.trim()) {
      Alert.alert('Validation', 'Target name and review text are required.');
      return;
    }
    setCreating(true);
    try {
      const payload: CreateReviewInput = {
        ...form,
        targetId: form.targetId.trim() || slugify(form.targetName) || `${Date.now()}`,
        photoUrl: form.photoUrl?.trim() || '',
      };
      if (editingId) {
        await reviewApi.update(editingId, payload);
      } else {
        await reviewApi.create(payload);
      }
      resetComposer();
      await fetchReviews(0, true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not save review');
    } finally {
      setCreating(false);
    }
  };

  const removeReview = (reviewId: number) => {
    Alert.alert('Delete Review', 'Are you sure you want to delete this review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await reviewApi.remove(reviewId);
            setReviews((prev) => prev.filter((item) => item.id !== reviewId));
            setTotalReviews((prev) => Math.max(0, prev - 1));
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not delete review');
          }
        },
      },
    ]);
  };

  const toggleHelpful = async (review: ReviewItem) => {
    try {
      const response = await reviewApi.toggleHelpful(review.id);
      setReviews((prev) =>
        prev.map((item) =>
          item.id === review.id
            ? {
                ...item,
                helpfulCount: response.helpfulCount,
                helpfulByCurrentUser: response.helpfulByCurrentUser,
              }
            : item
        )
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not update helpful vote');
    }
  };

  const openReply = (review: ReviewItem) => {
    setReplyReview(review);
    setReplyText(review.ownerReply || '');
    setReplyVisible(true);
  };

  const submitReply = async () => {
    if (!replyReview) return;
    if (!replyText.trim()) {
      Alert.alert('Validation', 'Reply text is required.');
      return;
    }
    setReplying(true);
    try {
      const updated = await reviewApi.reply(replyReview.id, replyText.trim());
      setReviews((prev) => prev.map((item) => (item.id === replyReview.id ? updated : item)));
      setReplyVisible(false);
      setReplyReview(null);
      setReplyText('');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not submit reply');
    } finally {
      setReplying(false);
    }
  };

  const openReport = (review: ReviewItem) => {
    setReportReview(review);
    setReportReason(REPORT_REASONS[0]);
    setReportDetails('');
    setReportVisible(true);
  };

  const submitReport = async () => {
    if (!reportReview) return;
    setReporting(true);
    try {
      await reviewApi.report(reportReview.id, {
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportVisible(false);
      setReportReview(null);
      await fetchReviews(0, true);
      Alert.alert('Reported', 'Review has been sent to moderation.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not report review');
    } finally {
      setReporting(false);
    }
  };

  const approveFlagged = (review: ReviewItem) => {
    Alert.alert('Approve Review', 'Approve this flagged review and restore it?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          try {
            await reviewApi.approveFlagged(review.id);
            setReviews((prev) => prev.filter((item) => item.id !== review.id));
            setTotalReviews((prev) => Math.max(0, prev - 1));
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not approve review');
          }
        },
      },
    ]);
  };

  const deleteFlagged = (review: ReviewItem) => {
    Alert.alert('Delete Flagged Review', 'Permanently delete this flagged review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await reviewApi.removeFlagged(review.id);
            setReviews((prev) => prev.filter((item) => item.id !== review.id));
            setTotalReviews((prev) => Math.max(0, prev - 1));
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not delete flagged review');
          }
        },
      },
    ]);
  };

  const renderSummary = () => {
    if (!summary) return null;

    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <View>
            <Text style={styles.summaryTitle}>Rating Overview</Text>
            <Text style={styles.summaryMeta}>{summary?.totalReviews || 0} reviews</Text>
          </View>
          <View style={styles.summaryScoreBox}>
            <Text style={styles.summaryScore}>{Number(summary?.averageRating || 0).toFixed(1)}</Text>
            <Text style={styles.summaryStars}>/5</Text>
          </View>
        </View>

        {(summary?.ratingBars || []).map((bar) => (
          <View key={bar.stars} style={styles.barRow}>
            <Text style={styles.barLabel}>{bar.stars}★</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(0, Math.min(bar.percentage || 0, 100))}%` }]} />
            </View>
            <Text style={styles.barCount}>{bar.count}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderReviewCard = (review: ReviewItem, index: number) => {
    const meta = targetMeta(review.targetType);
    const isOwner = currentUserId === review.authorId;
    const showReport = !isOwner && activeView !== 'admin';
    const authorAvatarUri = resolveAvatarUri(review.authorProfilePictureUrl);

    return (
      <Animated.View
        key={review.id}
        entering={FadeInDown.delay(45 * Math.min(index, 6)).duration(280)}
        style={styles.reviewCard}
      >
        <View style={styles.reviewTop}>
          <View style={styles.targetWrap}>
            <View style={styles.targetBadge}>
              <Text style={styles.targetBadgeText}>{meta.icon}</Text>
            </View>
            <View style={styles.targetTextWrap}>
              <Text style={styles.targetName} numberOfLines={1}>
                {review.targetName}
              </Text>
              <Text style={styles.targetType}>{review.targetType}</Text>
            </View>
          </View>
          <View style={styles.scoreWrap}>
            <Text style={styles.scoreStars}>{starsText(review.rating)}</Text>
            <Text style={styles.scoreValue}>{Number(review.rating).toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.reviewComment}>{review.comment}</Text>

        {!!review.photoUrl && (
          <Image
            source={{ uri: review.photoUrl }}
            style={styles.reviewImage}
            resizeMode="cover"
          />
        )}

        {!!review.ownerReply && (
          <View style={styles.replyBox}>
            <Text style={styles.replyLabel}>
              Official reply by {review.ownerReplyAuthor || 'Organizer'}
            </Text>
            <Text style={styles.replyText}>{review.ownerReply}</Text>
          </View>
        )}

        {activeView === 'admin' && !!review.reportReasons?.length && (
          <View style={styles.reasonWrap}>
            {review.reportReasons.map((reason) => (
              <View key={reason} style={styles.reasonChip}>
                <Text style={styles.reasonChipText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.reviewFooter}>
          <View style={styles.reviewAuthorWrap}>
            {authorAvatarUri ? (
              <Image source={{ uri: authorAvatarUri }} style={styles.reviewAuthorAvatar} />
            ) : (
              <View style={styles.reviewAuthorAvatarFallback}>
                <Text style={styles.reviewAuthorAvatarText}>{review.authorUsername?.charAt(0).toUpperCase() || '?'}</Text>
              </View>
            )}
            <Text style={styles.reviewMeta}>
              by {review.authorUsername} · {formatDate(review.createdAt)}
            </Text>
          </View>
          <Text style={styles.helpfulCount}>Helpful: {review.helpfulCount || 0}</Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => toggleHelpful(review)}>
            <Text style={[styles.actionText, review.helpfulByCurrentUser && styles.actionTextActive]}>
              Helpful
            </Text>
          </Pressable>

          {showReport && (
            <Pressable style={styles.actionBtn} onPress={() => openReport(review)}>
              <Text style={[styles.actionText, styles.reportText]}>Report</Text>
            </Pressable>
          )}

          {!!review.canReply && (
            <Pressable style={styles.actionBtn} onPress={() => openReply(review)}>
              <Text style={styles.actionText}>{review.ownerReply ? 'Edit Reply' : 'Reply'}</Text>
            </Pressable>
          )}

          {isOwner && activeView !== 'admin' && (
            <>
              <Pressable style={styles.actionBtn} onPress={() => openEdit(review)}>
                <Text style={styles.actionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => removeReview(review.id)}>
                <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>

        {activeView === 'admin' && isAdmin && (
          <View style={styles.adminActionsRow}>
            <Pressable style={[styles.adminBtn, styles.adminApprove]} onPress={() => approveFlagged(review)}>
              <Text style={styles.adminBtnText}>Approve</Text>
            </Pressable>
            <Pressable style={[styles.adminBtn, styles.adminDelete]} onPress={() => deleteFlagged(review)}>
              <Text style={styles.adminBtnText}>Delete</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.topSwitch}>
        <Pressable
          style={[styles.segBtn, activeView === 'all' && styles.segBtnActive]}
          onPress={() => setActiveView('all')}
        >
          <Text style={[styles.segBtnText, activeView === 'all' && styles.segBtnTextActive]}>All Reviews</Text>
        </Pressable>

        <Pressable
          style={[styles.segBtn, activeView === 'mine' && styles.segBtnActive]}
          onPress={() => setActiveView('mine')}
        >
          <Text style={[styles.segBtnText, activeView === 'mine' && styles.segBtnTextActive]}>My Reviews</Text>
        </Pressable>

        {isAdmin && (
          <Pressable
            style={[styles.segBtn, activeView === 'admin' && styles.segBtnActive]}
            onPress={() => setActiveView('admin')}
          >
            <Text style={[styles.segBtnText, activeView === 'admin' && styles.segBtnTextActive]}>Moderation</Text>
          </Pressable>
        )}
      </View>

      {activeView === 'all' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {TARGET_OPTIONS.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.filterChip, activeFilter === item.key && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterChipText, activeFilter === item.key && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {SORT_OPTIONS.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.filterChip, sortBy === item.key && styles.filterChipActive]}
                onPress={() => setSortBy(item.key)}
              >
                <Text style={[styles.filterChipText, sortBy === item.key && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search reviews..."
              placeholderTextColor="#6c6c6c"
              value={searchInput}
              onChangeText={setSearchInput}
              returnKeyType="search"
              onSubmitEditing={() => setSearchTerm(searchInput.trim())}
            />
            <Pressable style={styles.searchBtn} onPress={() => setSearchTerm(searchInput.trim())}>
              <Text style={styles.searchBtnText}>Go</Text>
            </Pressable>
          </View>
        </>
      )}

      {activeView !== 'admin' && (
        <Pressable style={styles.createBtn} onPress={openCreate}>
          <Text style={styles.createBtnText}>+ Write Review</Text>
        </Pressable>
      )}

      {(activeView === 'all' || activeView === 'admin') && renderSummary()}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading reviews...</Text>
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No reviews found</Text>
          <Text style={styles.emptySubtext}>
            {activeView === 'admin' ? 'No flagged reviews right now.' : 'Be the first to share your experience.'}
          </Text>
        </View>
      ) : (
        <View style={styles.reviewList}>{reviews.map(renderReviewCard)}</View>
      )}

      {!loading && reviews.length > 0 && (
        <Text style={styles.counterText}>
          Showing {reviews.length} of {totalReviews} reviews • page {page + 1}/{Math.max(1, totalPages)}
        </Text>
      )}

      {hasNext && (
        <Pressable style={styles.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>
          {loadingMore ? <ActivityIndicator size="small" color="#60a5fa" /> : <Text style={styles.loadMoreText}>Load More</Text>}
        </Pressable>
      )}

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={resetComposer}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Review' : 'Create Review'}</Text>
              <Pressable onPress={resetComposer}>
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Content Type</Text>
              <View style={styles.typeGrid}>
                {TARGET_OPTIONS.filter((option) => option.key !== 'ALL').map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.typeBtn,
                      form.targetType === option.key && styles.typeBtnActive,
                    ]}
                    onPress={() => setForm((prev) => ({ ...prev, targetType: option.key as ReviewTargetType }))}
                  >
                    <Text style={[styles.typeBtnText, form.targetType === option.key && styles.typeBtnTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Target Name</Text>
              <TextInput
                style={styles.input}
                value={form.targetName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, targetName: value }))}
                placeholder="Enter place/event name"
                placeholderTextColor="#666"
              />

              <Text style={styles.fieldLabel}>Target ID (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.targetId}
                onChangeText={(value) => setForm((prev) => ({ ...prev, targetId: value }))}
                placeholder="Leave blank to auto-generate"
                placeholderTextColor="#666"
              />

              <Text style={styles.fieldLabel}>Rating (1-5)</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} onPress={() => setForm((prev) => ({ ...prev, rating: value }))}>
                    <Text style={[styles.ratingStar, value <= form.rating && styles.ratingStarActive]}>★</Text>
                  </Pressable>
                ))}
                <Text style={styles.ratingValue}>{form.rating}/5</Text>
              </View>

              <Text style={styles.fieldLabel}>Review Text</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={4}
                value={form.comment}
                onChangeText={(value) => setForm((prev) => ({ ...prev, comment: value }))}
                placeholder="Write your detailed review..."
                placeholderTextColor="#666"
              />

              <Text style={styles.fieldLabel}>Photo URL (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.photoUrl || ''}
                onChangeText={(value) => setForm((prev) => ({ ...prev, photoUrl: value }))}
                placeholder="https://example.com/photo.jpg"
                placeholderTextColor="#666"
              />
            </ScrollView>

            <Pressable style={styles.submitBtn} onPress={submitReview} disabled={creating}>
              {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>{editingId ? 'Update Review' : 'Submit Review'}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={replyVisible} transparent animationType="fade" onRequestClose={() => setReplyVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Official Reply</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={4}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Write your reply to this review..."
              placeholderTextColor="#666"
            />
            <View style={styles.modalActionRow}>
              <Pressable style={styles.secondaryBtn} onPress={() => setReplyVisible(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={submitReply} disabled={replying}>
                {replying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Save Reply</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="fade" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Report Review</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  style={[styles.filterChip, reportReason === reason && styles.filterChipActive]}
                  onPress={() => setReportReason(reason)}
                >
                  <Text style={[styles.filterChipText, reportReason === reason && styles.filterChipTextActive]}>
                    {reason}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={4}
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Additional details (optional)"
              placeholderTextColor="#666"
            />
            <View style={styles.modalActionRow}>
              <Pressable style={styles.secondaryBtn} onPress={() => setReportVisible(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.warningBtn} onPress={submitReport} disabled={reporting}>
                {reporting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Submit Report</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: 10 },

  topSwitch: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#323232',
    backgroundColor: '#161616',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segBtnActive: { backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  segBtnText: { color: '#a3a3a3', fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
  segBtnTextActive: { color: '#0f172a' },

  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    backgroundColor: '#151515',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  filterChipActive: { borderColor: '#60a5fa', backgroundColor: '#1e3a5f' },
  filterChipText: { color: '#9a9a9a', fontSize: 11, fontWeight: '600' },
  filterChipTextActive: { color: '#dbeafe' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    backgroundColor: '#151515',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    color: '#f5f5f5',
    fontSize: 13,
    fontFamily: 'monospace',
    paddingVertical: 0,
  },
  searchBtn: {
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  createBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontFamily: 'monospace', fontSize: 13 },

  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#171717',
    padding: 12,
    gap: 8,
  },
  summaryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: { color: '#f5f5f5', fontSize: 14, fontWeight: '700' },
  summaryMeta: { color: '#8f8f8f', fontSize: 11 },
  summaryScoreBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  summaryScore: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  summaryStars: { color: '#94a3b8', fontSize: 12, marginBottom: 3 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 24, color: '#d1d5db', fontSize: 11, fontFamily: 'monospace' },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2a2a2a',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f59e0b',
  },
  barCount: { width: 30, textAlign: 'right', color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' },

  loadingWrap: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  loadingText: { color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' },

  emptyWrap: { alignItems: 'center', gap: 4, paddingVertical: 28 },
  emptyText: { color: '#d1d5db', fontSize: 14, fontWeight: '700' },
  emptySubtext: { color: '#8a8a8a', fontSize: 12 },

  reviewList: { gap: 10 },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#171717',
    padding: 12,
    gap: 8,
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  targetWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  targetBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetBadgeText: { color: '#bfdbfe', fontSize: 10, fontWeight: '800', fontFamily: 'monospace' },
  targetTextWrap: { flex: 1 },
  targetName: { color: '#f3f4f6', fontSize: 14, fontWeight: '700' },
  targetType: { color: '#94a3b8', fontSize: 11, marginTop: 1 },
  scoreWrap: { alignItems: 'flex-end', gap: 1 },
  scoreStars: { color: '#f59e0b', fontSize: 11, fontFamily: 'monospace' },
  scoreValue: { color: '#e5e7eb', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  reviewComment: { color: '#b8b8b8', fontSize: 12, lineHeight: 18 },
  reviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#101010',
  },

  replyBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#101826',
    padding: 10,
    gap: 4,
  },
  replyLabel: { color: '#bfdbfe', fontSize: 11, fontWeight: '700' },
  replyText: { color: '#dbeafe', fontSize: 12, lineHeight: 17 },

  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#3f1515',
  },
  reasonChipText: { color: '#fecaca', fontSize: 10, fontWeight: '700' },

  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewAuthorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  reviewAuthorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  reviewAuthorAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAuthorAvatarText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewMeta: { color: '#8c8c8c', fontSize: 11 },
  helpfulCount: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#353535',
    backgroundColor: '#141414',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  actionText: { color: '#93c5fd', fontSize: 11, fontWeight: '700' },
  actionTextActive: { color: '#facc15' },
  reportText: { color: '#fbbf24' },
  deleteText: { color: '#ef4444' },

  adminActionsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  adminBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  adminApprove: { backgroundColor: '#065f46' },
  adminDelete: { backgroundColor: '#991b1b' },
  adminBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  counterText: {
    textAlign: 'center',
    color: '#757575',
    fontSize: 11,
    fontFamily: 'monospace',
  },

  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#274b73',
    backgroundColor: '#10233a',
    paddingVertical: 12,
  },
  loadMoreText: { color: '#bfdbfe', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.76)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '88%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#191919',
    overflow: 'hidden',
  },
  smallModalCard: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#191919',
    padding: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d2d',
  },
  modalTitle: { color: '#f5f5f5', fontSize: 16, fontWeight: '700' },
  modalClose: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  modalBody: { paddingHorizontal: 14, paddingVertical: 10 },

  fieldLabel: {
    color: '#d4d4d4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#141414',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  typeBtnActive: { borderColor: '#60a5fa', backgroundColor: '#1e3a5f' },
  typeBtnText: { color: '#9f9f9f', fontSize: 12, fontWeight: '700' },
  typeBtnTextActive: { color: '#dbeafe' },

  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#131313',
    color: '#f3f4f6',
    fontSize: 13,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  textArea: { minHeight: 86, textAlignVertical: 'top' },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingStar: { fontSize: 28, color: '#3f3f3f' },
  ratingStarActive: { color: '#f59e0b' },
  ratingValue: { color: '#9ca3af', fontSize: 12, fontFamily: 'monospace', marginLeft: 4 },

  submitBtn: {
    margin: 14,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },

  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondaryBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3d3d3d',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryBtnText: { color: '#a3a3a3', fontSize: 12, fontWeight: '700' },
  primaryBtn: {
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningBtn: {
    borderRadius: 8,
    backgroundColor: '#b45309',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default CommunityReviewsPanel;
