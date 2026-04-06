import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  socialApi,
  UserPublicProfile,
  ActivityFeedItem as FeedItemType,
  sessionStore,
} from '../services/backend';

/* ────────── Helpers ────────── */

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const ACTION_META: Record<string, { verb: string; emoji: string; gradient: [string, string] }> = {
  REVIEW:       { verb: 'rated',                emoji: '⭐',  gradient: ['#fbbf24', '#f59e0b'] },
  EVENT_JOIN:   { verb: 'joined event',         emoji: '🎉',  gradient: ['#a78bfa', '#7c3aed'] },
  EVENT_CREATE: { verb: 'created event',        emoji: '🎪',  gradient: ['#34d399', '#059669'] },
  BOOKMARK:     { verb: 'saved',                emoji: '🔖',  gradient: ['#fb923c', '#ea580c'] },
  FOLLOW:       { verb: 'started following',    emoji: '👤',  gradient: ['#22d3ee', '#0891b2'] },
};
const getAction = (t: string) => ACTION_META[t] || { verb: 'interacted with', emoji: '📌', gradient: ['#94a3b8', '#64748b'] };

const avatarColor = (id: number) => `hsl(${(id * 53) % 360}, 55%, 40%)`;

/* ────────── QR / Share Modal ────────── */

const ShareProfileModal = ({ visible, onClose, user }: {
  visible: boolean;
  onClose: () => void;
  user: { username: string; id: number } | null;
}) => {
  if (!user) return null;
  const link = `exploreease://user/${user.id}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <Animated.View entering={FadeInUp.duration(280)} style={modal.card}>
          {/* Profile header */}
          <View style={[modal.avatar, { backgroundColor: avatarColor(user.id) }]}>  
            <Text style={modal.avatarText}>{user.username.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={modal.name}>@{user.username}</Text>
          <Text style={modal.subtitle}>ExploreEase Traveler</Text>

          {/* QR-style visual card */}
          <View style={modal.qrCard}>
            <View style={modal.qrInner}>
              <Text style={modal.qrIcon}>📱</Text>
              <Text style={modal.qrLabel}>Scan or share profile</Text>
            </View>
            <View style={modal.cornerTL} /><View style={modal.cornerTR} />
            <View style={modal.cornerBL} /><View style={modal.cornerBR} />
          </View>

          <Text style={modal.link}>{link}</Text>

          {/* Actions */}
          <Pressable
            style={modal.shareBtn}
            onPress={async () => {
              try {
                await Share.share({
                  message: `Check out @${user.username} on ExploreEase! 🌍\n${link}`,
                  title: `${user.username} — ExploreEase`,
                });
              } catch {}
            }}
          >
            <Text style={modal.shareBtnText}>📤  Share Profile Link</Text>
          </Pressable>

          <Pressable onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeBtnText}>Close</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const CORNER_BASE = { position: 'absolute' as const, width: 20, height: 20, borderColor: '#8b5cf6' };
const modal = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: '#0f172a', borderRadius: 28,
    padding: 28, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  name: { color: '#f1f5f9', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 13 },
  qrCard: {
    width: 160, height: 160, backgroundColor: '#f8fafc', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginVertical: 8, position: 'relative',
  },
  qrInner: { alignItems: 'center', gap: 8 },
  qrIcon: { fontSize: 44 },
  qrLabel: { color: '#334155', fontSize: 11, fontWeight: '700' },
  cornerTL: { ...CORNER_BASE, top: 4, left: 4, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { ...CORNER_BASE, top: 4, right: 4, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { ...CORNER_BASE, bottom: 4, left: 4, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { ...CORNER_BASE, bottom: 4, right: 4, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  link: { color: '#64748b', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.5 },
  shareBtn: {
    backgroundColor: '#8b5cf6', borderRadius: 16, paddingVertical: 14, width: '100%',
    alignItems: 'center', marginTop: 4,
  },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  closeBtn: { paddingTop: 8, paddingBottom: 4 },
  closeBtnText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
});

/* ────────── Main Component ────────── */

type SocialTab = 'feed' | 'followers' | 'following' | 'search';

const SocialPanel = () => {
  const currentUser = sessionStore.get()?.user;
  const [tab, setTab] = useState<SocialTab>('feed');
  const [loading, setLoading] = useState(false);

  const [feed, setFeed] = useState<FeedItemType[]>([]);
  const [followers, setFollowers] = useState<UserPublicProfile[]>([]);
  const [following, setFollowing] = useState<UserPublicProfile[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shareUser, setShareUser] = useState<{ username: string; id: number } | null>(null);

  /* ── Data ── */

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try { setFeed((await socialApi.getFeed(0, 40)) || []); } catch {} finally { setLoading(false); }
  }, []);

  const loadFollowers = useCallback(async () => {
    setLoading(true);
    try { setFollowers((await socialApi.getFollowers(0, 50)) || []); } catch (e: any) { Alert.alert('Error', e?.message || 'Cannot load'); } finally { setLoading(false); }
  }, []);

  const loadFollowing = useCallback(async () => {
    setLoading(true);
    try { setFollowing((await socialApi.getFollowing(0, 50)) || []); } catch (e: any) { Alert.alert('Error', e?.message || 'Cannot load'); } finally { setLoading(false); }
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    try { setSearchResults((await socialApi.searchUsers(q.trim(), 20)) || []); } catch {} finally { setSearching(false); }
  }, []);

  const onSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(q), 400);
  }, [doSearch]);

  /* ── Follow/Unfollow ── */

  const handleFollow = async (userId: number) => {
    try {
      await socialApi.follow(userId);
      const up = (l: UserPublicProfile[]) => l.map(u => u.id === userId ? { ...u, followedByCurrentUser: true, followerCount: u.followerCount + 1 } : u);
      setSearchResults(up); setFollowers(up);
      setFollowing(prev => {
        if (prev.some(u => u.id === userId)) return up(prev);
        const f = searchResults.find(u => u.id === userId);
        return f ? [{ ...f, followedByCurrentUser: true }, ...prev] : prev;
      });
    } catch (e: any) { Alert.alert('Error', e?.message || 'Cannot follow'); }
  };

  const handleUnfollow = async (userId: number) => {
    try {
      await socialApi.unfollow(userId);
      const up = (l: UserPublicProfile[]) => l.map(u => u.id === userId ? { ...u, followedByCurrentUser: false, followerCount: Math.max(0, u.followerCount - 1) } : u);
      setSearchResults(up); setFollowers(up);
      setFollowing(prev => prev.filter(u => u.id !== userId));
    } catch (e: any) { Alert.alert('Error', e?.message || 'Cannot unfollow'); }
  };

  useEffect(() => {
    if (tab === 'feed') void loadFeed();
    if (tab === 'followers') void loadFollowers();
    if (tab === 'following') void loadFollowing();
  }, [tab, loadFeed, loadFollowers, loadFollowing]);

  /* ────────── USER CARD ────────── */

  const UserCard = ({ user, index }: { user: UserPublicProfile; index: number }) => {
    const isSelf = currentUser && user.id === currentUser.id;
    const isFollowed = user.followedByCurrentUser;
    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(200)} style={s.userCard}>
        <View style={[s.avatar, { backgroundColor: avatarColor(user.id) }]}>
          <Text style={s.avatarLetter}>{user.username?.charAt(0).toUpperCase() || '?'}</Text>
        </View>
        <View style={s.userBody}>
          <View style={s.userNameRow}>
            <Text style={s.userName} numberOfLines={1}>{user.username}</Text>
            {user.followerCount >= 10 && <View style={s.verifiedDot} />}
          </View>
          {user.bio ? <Text style={s.userBio} numberOfLines={1}>{user.bio}</Text> : null}
          <Text style={s.userStats}>{user.followerCount} followers · {user.followingCount} following</Text>
        </View>
        <View style={s.userActions}>
          {!isSelf && (
            <Pressable
              onPress={() => isFollowed ? handleUnfollow(user.id) : handleFollow(user.id)}
              style={[s.followBtn, isFollowed && s.followBtnFollowing]}
            >
              <Text style={[s.followBtnText, isFollowed && s.followBtnTextFollowing]}>
                {isFollowed ? '✓ Following' : '+ Follow'}
              </Text>
            </Pressable>
          )}
          <View style={s.actionIcons}>
            <Pressable onPress={() => Share.share({ message: `@${user.username} on ExploreEase! 🌍\nexploreease://user/${user.id}` })} style={s.iconBtn}>
              <Text style={s.iconText}>↗</Text>
            </Pressable>
            <Pressable onPress={() => setShareUser({ username: user.username, id: user.id })} style={s.iconBtn}>
              <Text style={s.iconText}>📱</Text>  
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
  };

  /* ────────── TABS ────────── */

  const TABS: { key: SocialTab; label: string; emoji: string }[] = [
    { key: 'feed', label: 'Activity', emoji: '📰' },
    { key: 'followers', label: 'Followers', emoji: '👥' },
    { key: 'following', label: 'Following', emoji: '💫' },
    { key: 'search', label: 'Discover', emoji: '🔍' },
  ];

  return (
    <View style={s.root}>
      {/* ── Tab Bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, active && s.tabActive]}>
              <Text style={s.tabEmoji}>{t.emoji}</Text>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
              {active && <View style={s.tabDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ══════ FEED ══════ */}
      {tab === 'feed' && (
        <View style={s.section}>
          {loading ? (
            <View style={s.center}><ActivityIndicator color="#a78bfa" /><Text style={s.centerText}>Loading feed…</Text></View>
          ) : feed.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🌍</Text>
              <Text style={s.emptyTitle}>Your feed is empty</Text>
              <Text style={s.emptyDesc}>Follow travelers, bloggers, and friends to see their reviews, event activity, and saved places here.</Text>
              <Pressable onPress={() => setTab('search')} style={s.emptyAction}>
                <Text style={s.emptyActionText}>🔍 Discover people</Text>
              </Pressable>
            </View>
          ) : (
            feed.map((item, idx) => {
              const a = getAction(item.actionType);
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(idx * 25).duration(200)} style={s.feedCard}>
                  <View style={[s.feedStripe, { backgroundColor: a.gradient[0] }]} />
                  <View style={s.feedInner}>
                    <View style={s.feedRow}>
                      <View style={[s.feedAvatar, { backgroundColor: avatarColor(item.actorId) }]}>
                        <Text style={s.feedAvatarText}>{item.actorUsername?.charAt(0).toUpperCase() || '?'}</Text>
                      </View>
                      <View style={s.feedBody}>
                        <Text style={s.feedSentence}>
                          <Text style={s.feedActor}>{item.actorUsername}</Text>
                          {' '}{a.verb}{' '}
                          <Text style={s.feedTarget}>{item.targetName}</Text>
                        </Text>
                        <View style={s.feedMeta}>
                          <View style={[s.feedBadge, { backgroundColor: a.gradient[0] + '20' }]}>
                            <Text style={{ fontSize: 11 }}>{a.emoji}</Text>
                            <Text style={[s.feedBadgeLabel, { color: a.gradient[0] }]}>{item.actionType.replace('_', ' ')}</Text>
                          </View>
                          <Text style={s.feedTime}>{formatTime(item.createdAt)}</Text>
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={s.feedShare}
                      onPress={() => Share.share({ message: `${item.actorUsername} ${a.verb} ${item.targetName || ''} on ExploreEase! 🌍` })}
                    >
                      <Text style={s.feedShareText}>Share ↗</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>
      )}

      {/* ══════ SEARCH ══════ */}
      {tab === 'search' && (
        <View style={s.section}>
          <View style={s.searchBox}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="Find travelers, bloggers, friends…"
              placeholderTextColor="#475569"
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Text style={s.searchClear}>✕</Text>
              </Pressable>
            )}
          </View>

          {searching && (
            <View style={s.searchStatus}>
              <ActivityIndicator color="#a78bfa" size="small" />
              <Text style={s.searchStatusText}>Searching…</Text>
            </View>
          )}

          {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🔎</Text>
              <Text style={s.emptyTitle}>No users found</Text>
              <Text style={s.emptyDesc}>Try a different name or username</Text>
            </View>
          )}

          {searchQuery.trim().length < 2 && searchResults.length === 0 && !searching && (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>👋</Text>
              <Text style={s.emptyTitle}>Discover travelers</Text>
              <Text style={s.emptyDesc}>Search by username to find other explorers, travel bloggers, and friends to follow.</Text>
            </View>
          )}

          {searchResults.map((u, i) => <UserCard key={u.id} user={u} index={i} />)}
        </View>
      )}

      {/* ══════ FOLLOWERS ══════ */}
      {tab === 'followers' && (
        <View style={s.section}>
          {loading && <ActivityIndicator color="#a78bfa" />}
          {!loading && followers.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>👥</Text>
              <Text style={s.emptyTitle}>No followers yet</Text>
              <Text style={s.emptyDesc}>Share your profile link or QR code to grow your network.</Text>
              <Pressable onPress={() => currentUser && setShareUser({ username: currentUser.username, id: currentUser.id })} style={s.emptyAction}>
                <Text style={s.emptyActionText}>📱 Share my profile</Text>
              </Pressable>
            </View>
          )}
          {followers.map((u, i) => <UserCard key={u.id} user={u} index={i} />)}
        </View>
      )}

      {/* ══════ FOLLOWING ══════ */}
      {tab === 'following' && (
        <View style={s.section}>
          {loading && <ActivityIndicator color="#a78bfa" />}
          {!loading && following.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>💫</Text>
              <Text style={s.emptyTitle}>Not following anyone</Text>
              <Text style={s.emptyDesc}>Discover travelers and bloggers on the Search tab to follow them.</Text>
              <Pressable onPress={() => setTab('search')} style={s.emptyAction}>
                <Text style={s.emptyActionText}>🔍 Discover people</Text>
              </Pressable>
            </View>
          )}
          {following.map((u, i) => <UserCard key={u.id} user={u} index={i} />)}
        </View>
      )}

      {/* QR / Share modal */}
      <ShareProfileModal visible={!!shareUser} onClose={() => setShareUser(null)} user={shareUser} />
    </View>
  );
};

/* ────────────── Styles ────────────── */

const s = StyleSheet.create({
  root: { gap: 14 },

  /* Tabs */
  tabBar: { gap: 6, paddingRight: 8 },
  tab: {
    alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.5)',
  },
  tabActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: '#8b5cf6' },
  tabEmoji: { fontSize: 18 },
  tabLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  tabLabelActive: { color: '#c4b5fd' },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#8b5cf6' },

  /* Sections */
  section: { gap: 10 },
  center: { padding: 40, alignItems: 'center', gap: 8 },
  centerText: { color: '#94a3b8', fontSize: 13 },

  /* Search bar */
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0f172a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 14, paddingVertical: 14 },
  searchClear: { color: '#475569', fontSize: 16, fontWeight: '700', padding: 4 },
  searchStatus: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
  searchStatusText: { color: '#94a3b8', fontSize: 12 },

  /* User card */
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 1, borderColor: 'rgba(30,41,59,0.6)',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '900' },
  userBody: { flex: 1, gap: 2 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { color: '#f1f5f9', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  verifiedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22d3ee' },
  userBio: { color: '#94a3b8', fontSize: 12 },
  userStats: { color: '#475569', fontSize: 11, marginTop: 2 },
  userActions: { alignItems: 'flex-end', gap: 6 },
  followBtn: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 14,
    backgroundColor: '#8b5cf6',
  },
  followBtnFollowing: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155',
  },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  followBtnTextFollowing: { color: '#94a3b8' },
  actionIcons: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(30,41,59,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 12 },

  /* Feed */
  feedCard: {
    borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderWidth: 1, borderColor: 'rgba(30,41,59,0.6)',
    flexDirection: 'row',
  },
  feedStripe: { width: 4 },
  feedInner: { flex: 1, padding: 14, gap: 10 },
  feedRow: { flexDirection: 'row', gap: 12 },
  feedAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  feedAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  feedBody: { flex: 1, gap: 6 },
  feedSentence: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  feedActor: { fontWeight: '800', color: '#f1f5f9' },
  feedTarget: { fontWeight: '700', color: '#c4b5fd' },
  feedMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  feedBadgeLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  feedTime: { color: '#475569', fontSize: 11 },
  feedShare: { alignSelf: 'flex-end' },
  feedShareText: { color: '#a78bfa', fontSize: 12, fontWeight: '700' },

  /* Empty */
  emptyBox: {
    padding: 36, borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1, borderColor: 'rgba(30,41,59,0.5)',
    alignItems: 'center', gap: 10,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '800' },
  emptyDesc: { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyAction: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#8b5cf6',
  },
  emptyActionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

export default SocialPanel;
