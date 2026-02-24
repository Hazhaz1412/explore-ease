import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import LocationDiscoveryPanel from './LocationDiscoveryPanel';
import ProfilePreferencesPrivacyPanel from './ProfilePreferencesPrivacyPanel';

type TabKey = 'discover' | 'events' | 'community' | 'offline' | 'profile';

type Props = {
  onLoggedOut: () => void;
};

const { width } = Dimensions.get('window');
const IS_WIDE = width >= 900;

const tabs: { key: TabKey; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'events', label: 'Events' },
  { key: 'community', label: 'Reviews' },
  { key: 'offline', label: 'Offline' },
  { key: 'profile', label: 'Profile' },
];

const ExploreEaseMain = ({ onLoggedOut }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [searchText, setSearchText] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    category: '',
    maxPeople: '',
  });

  const events = useMemo(
    () => [
      {
        title: 'Sunset Kayak Meetup',
        time: 'Today, 18:30',
        attendees: '12 / 20',
        privacy: 'Public',
      },
      {
        title: 'Local Food Tasting Loop',
        time: 'Tomorrow, 19:00',
        attendees: '8 / 12',
        privacy: 'Friends',
      },
      {
        title: 'Weekend Craft Market Walk',
        time: 'Sat, 10:00',
        attendees: '25 / 40',
        privacy: 'Public',
      },
    ],
    []
  );

  const reviews = useMemo(
    () => [
      {
        place: 'Lantern Night Street',
        rating: 4.8,
        comment: 'Great food quality and smooth walking route suggestions.',
        reviewer: 'A. Tran',
      },
      {
        place: 'Coastal Bike Path',
        rating: 4.7,
        comment: 'Clean route, safe at dawn, and accurate location prompts.',
        reviewer: 'M. Nguyen',
      },
      {
        place: 'Riverfront Acoustic Event',
        rating: 4.6,
        comment: 'Good event host controls, friendly group atmosphere.',
        reviewer: 'L. Ho',
      },
    ],
    []
  );

  const offlinePacks = useMemo(
    () => [
      { name: 'City Core Map', size: '38 MB', syncedAt: '2 mins ago', downloaded: true },
      { name: 'Cuisine Guide', size: '21 MB', syncedAt: '8 mins ago', downloaded: true },
      { name: 'Weekend Events', size: '12 MB', syncedAt: 'Pending', downloaded: false },
    ],
    []
  );

  const createEvent = () => {
    setEventForm({ title: '', date: '', category: '', maxPeople: '' });
    setEventModalVisible(false);
  };

  const renderDiscover = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Location-Based Discovery</Text>
        <Text style={styles.sectionMeta}>GPS, Map, Nearby POI/Events, Distance & Route</Text>
      </View>
      <LocationDiscoveryPanel />
    </Animated.View>
  );

  const renderEvents = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Event Explorer</Text>
        <Pressable onPress={() => setEventModalVisible(true)} style={styles.compactButton}>
          <Text style={styles.compactButtonPlus}>+</Text>
          <Text style={styles.compactButtonText}>Create Event</Text>
        </Pressable>
      </View>
      <View style={styles.eventList}>
        {events.map((event, idx) => (
          <Animated.View key={event.title} entering={FadeInDown.delay(70 * idx).duration(350)} style={styles.eventCard}>
            <View style={styles.eventTop}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventBadge}>{event.privacy}</Text>
            </View>
            <View style={styles.eventMetaRow}>
              <View style={styles.systemIconSmall}>
                <Text style={styles.systemIconTextSmall}>TM</Text>
              </View>
              <Text style={styles.eventMetaText}>{event.time}</Text>
            </View>
            <Text style={styles.eventMetaText}>Attendees: {event.attendees}</Text>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );

  const renderCommunity = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Community Reviews</Text>
        <Text style={styles.sectionMeta}>Verified traveler feedback</Text>
      </View>
      <View style={styles.reviewList}>
        {reviews.map((review, idx) => (
          <Animated.View key={review.place} entering={FadeInDown.delay(80 * idx).duration(350)} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <Text style={styles.reviewPlace}>{review.place}</Text>
              <View style={styles.reviewScore}>
                <Text style={styles.reviewStar}>*</Text>
                <Text style={styles.reviewScoreText}>{review.rating}</Text>
              </View>
            </View>
            <Text style={styles.reviewComment}>{review.comment}</Text>
            <Text style={styles.reviewAuthor}>by {review.reviewer}</Text>
          </Animated.View>
        ))}
      </View>
      <View style={styles.systemCard}>
        <View style={styles.systemIcon}>
          <Text style={styles.systemIconText}>ENC</Text>
        </View>
        <Text style={styles.systemCardText}>
          Secure communication is enabled for event messages and host coordination.
        </Text>
      </View>
    </Animated.View>
  );

  const renderOffline = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Offline Hub</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Offline Mode</Text>
          <Switch value={offlineMode} onValueChange={setOfflineMode} />
        </View>
      </View>
      <View style={styles.offlineList}>
        {offlinePacks.map((pack, idx) => (
          <Animated.View key={pack.name} entering={FadeInDown.delay(80 * idx).duration(350)} style={styles.offlineCard}>
            <View style={styles.offlineTop}>
              <Text style={styles.offlineTitle}>{pack.name}</Text>
              <Text style={styles.offlineBadge}>{pack.downloaded ? 'Ready' : 'Not Downloaded'}</Text>
            </View>
            <View style={styles.offlineMetaRow}>
              <View style={styles.systemIconSmall}>
                <Text style={styles.systemIconTextSmall}>DL</Text>
              </View>
              <Text style={styles.offlineMetaText}>
                {pack.size} • Last sync: {pack.syncedAt}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
      <View style={styles.systemCard}>
        <View style={styles.systemIcon}>
          <Text style={styles.systemIconText}>OFF</Text>
        </View>
        <Text style={styles.systemCardText}>
          Cached routes, saved places, and emergency notes remain available without network.
        </Text>
      </View>
    </Animated.View>
  );

  const renderProfile = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Profile, Preferences & Privacy</Text>
        <Text style={styles.sectionMeta}>Mapped directly to backend endpoints</Text>
      </View>
      <ProfilePreferencesPrivacyPanel onLoggedOut={onLoggedOut} />
    </Animated.View>
  );

  const renderContent = () => {
    if (activeTab === 'events') return renderEvents();
    if (activeTab === 'community') return renderCommunity();
    if (activeTab === 'offline') return renderOffline();
    if (activeTab === 'profile') return renderProfile();
    return renderDiscover();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgBlobTop} />
      <View style={styles.bgBlobBottom} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn.duration(420)} style={styles.headerCard}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>EE</Text>
            </View>
            <View>
              <Text style={styles.appTitle}>ExploreEase</Text>
              <Text style={styles.appSubtitle}>Smart assistant for seamless travel flow</Text>
            </View>
          </View>
          <View style={styles.searchWrap}>
            <TextInput
              placeholder="Search attractions, food, events..."
              placeholderTextColor="#6b7885"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.tabRow}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {renderContent()}
      </ScrollView>

      <Modal visible={eventModalVisible} transparent animationType="fade" onRequestClose={() => setEventModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Travel Event</Text>
            <TextInput
              placeholder="Event title"
              placeholderTextColor="#6f7a85"
              value={eventForm.title}
              onChangeText={(value) => setEventForm((prev) => ({ ...prev, title: value }))}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="Date / time"
              placeholderTextColor="#6f7a85"
              value={eventForm.date}
              onChangeText={(value) => setEventForm((prev) => ({ ...prev, date: value }))}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="Category"
              placeholderTextColor="#6f7a85"
              value={eventForm.category}
              onChangeText={(value) => setEventForm((prev) => ({ ...prev, category: value }))}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="Max attendees"
              placeholderTextColor="#6f7a85"
              value={eventForm.maxPeople}
              onChangeText={(value) => setEventForm((prev) => ({ ...prev, maxPeople: value }))}
              keyboardType="number-pad"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEventModalVisible(false)} style={styles.modalButtonGhost}>
                <Text style={styles.modalButtonGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={createEvent} style={styles.modalButtonPrimary}>
                <Text style={styles.modalButtonPrimaryText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090909',
  },
  bgBlobTop: {
    position: 'absolute',
    top: -130,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#141414',
  },
  bgBlobBottom: {
    position: 'absolute',
    bottom: -150,
    left: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#111111',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    gap: 14,
  },
  headerCard: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  logoText: {
    color: '#0b0b0b',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  appTitle: {
    color: '#f5f5f5',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.7,
    fontFamily: 'monospace',
  },
  appSubtitle: {
    color: '#a7a7a7',
    fontSize: 12,
  },
  searchWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#171717',
  },
  searchInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f2f2f2',
    fontSize: 14,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#181818',
  },
  tabButtonActive: {
    backgroundColor: '#f5f5f5',
    borderColor: '#f5f5f5',
  },
  tabButtonText: {
    color: '#9f9f9f',
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  tabButtonTextActive: {
    color: '#0b0b0b',
  },
  sectionContainer: {
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#f4f4f4',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  sectionMeta: {
    color: '#979797',
    fontSize: 12,
  },
  cardGrid: {
    gap: 10,
  },
  cardGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  discoverCard: {
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 14,
    backgroundColor: '#171717',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  discoverCardWide: {
    width: '48%',
  },
  discoverIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverIconCode: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  discoverTextWrap: {
    flex: 1,
    gap: 5,
  },
  discoverTitle: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '700',
  },
  discoverSubtitle: {
    color: '#a4a4a4',
    fontSize: 12,
    lineHeight: 17,
  },
  discoverMetaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaPill: {
    fontSize: 11,
    color: '#d8d8d8',
    backgroundColor: '#242424',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  compactButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactButtonText: {
    color: '#0b0b0b',
    fontSize: 12,
    fontWeight: '600',
  },
  compactButtonPlus: {
    color: '#0b0b0b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
  },
  eventList: {
    gap: 10,
  },
  eventCard: {
    borderWidth: 1,
    borderColor: '#2f2f2f',
    borderRadius: 12,
    backgroundColor: '#171717',
    padding: 11,
    gap: 7,
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTitle: {
    color: '#f1f1f1',
    fontSize: 14,
    fontWeight: '700',
  },
  eventBadge: {
    color: '#d4d4d4',
    fontSize: 11,
    backgroundColor: '#242424',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  eventMetaRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  eventMetaText: {
    color: '#a7a7a7',
    fontSize: 12,
  },
  reviewList: {
    gap: 10,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 12,
    backgroundColor: '#171717',
    padding: 11,
    gap: 7,
  },
  reviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewPlace: {
    color: '#f2f2f2',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewScoreText: {
    color: '#f1f1f1',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewStar: {
    color: '#f5f5f5',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 16,
  },
  reviewComment: {
    color: '#a8a8a8',
    fontSize: 12,
    lineHeight: 18,
  },
  reviewAuthor: {
    color: '#8f8f8f',
    fontSize: 11,
  },
  offlineList: {
    gap: 10,
  },
  offlineCard: {
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 12,
    backgroundColor: '#171717',
    padding: 11,
    gap: 7,
  },
  offlineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  offlineTitle: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '700',
  },
  offlineBadge: {
    color: '#d5d5d5',
    fontSize: 10,
    backgroundColor: '#242424',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  offlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineMetaText: {
    color: '#a5a5a5',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchLabel: {
    color: '#c8c8c8',
    fontSize: 12,
  },
  systemCard: {
    borderRadius: 12,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2d2d2d',
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  systemCardText: {
    flex: 1,
    color: '#c8c8c8',
    fontSize: 12,
    lineHeight: 18,
  },
  systemIcon: {
    width: 28,
    height: 18,
    borderRadius: 6,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3b3b3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemIconSmall: {
    width: 24,
    height: 15,
    borderRadius: 5,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3b3b3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemIconText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  systemIconTextSmall: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  preferenceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#171717',
    padding: 11,
    gap: 10,
  },
  fieldLabel: {
    color: '#f3f3f3',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#363636',
    backgroundColor: '#222222',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: '#f5f5f5',
    backgroundColor: '#343434',
  },
  chipText: {
    color: '#bcbcbc',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: '#f5f5f5',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#353535',
    backgroundColor: '#1a1a1a',
    color: '#f3f3f3',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  modalButtonGhost: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#1b1b1b',
  },
  modalButtonGhostText: {
    color: '#d0d0d0',
    fontSize: 13,
    fontWeight: '600',
  },
  modalButtonPrimary: {
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modalButtonPrimaryText: {
    color: '#0b0b0b',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ExploreEaseMain;
