import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
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
import { 
  Search, Compass, CalendarCheck, MapPin, 
  MessageCircle, Bell, Star, CloudOff, 
  UserCircle, ShieldCheck, Settings, Download 
} from 'lucide-react-native';
import LocationDiscoveryPanel from './LocationDiscoveryPanel';
import DiscoveryModulePanel from './DiscoveryModulePanel';
import ProfilePreferencesPrivacyPanel from './ProfilePreferencesPrivacyPanel';
import EventManagementPanel from './EventManagementPanel';
import CommunityReviewsPanel from './CommunityReviewsPanel';
import NotificationsPanel from './NotificationsPanel';
import AdminDashboardPanel from './AdminDashboardPanel';
import TravelPlanningPanel from './TravelPlanningPanel';
import SocialPanel from './SocialPanel';
import SmartSearchPanel from './SmartSearchPanel';
import DirectMessagingPanel from './DirectMessagingPanel';
import MessagingPanel from './MessagingPanel';
import { sessionStore } from '../services/backend';

type TabKey = 'discover' | 'events' | 'travel' | 'notifications' | 'community' | 'social' | 'messages' | 'offline' | 'profile' | 'admin';

type Props = {
  onLoggedOut: () => void;
};

const { width } = Dimensions.get('window');
const IS_WIDE = width >= 900;
const HEADER_BG = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80&w=1000';

const ExploreEaseMain = ({ onLoggedOut }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [searchText, setSearchText] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const currentUser = sessionStore.get()?.user;
  const isAdmin = !!(currentUser?.isSuperuser || currentUser?.isStaff);
  const tabs = useMemo<{ key: TabKey; label: string; icon: any }[]>(
    () => [
      { key: 'discover', label: 'Explore', icon: Compass },
      { key: 'events', label: 'Events', icon: CalendarCheck },
      { key: 'travel', label: 'Plan', icon: MapPin },
      { key: 'social', label: 'Social', icon: Star },
      { key: 'messages', label: 'Chats', icon: MessageCircle },
      { key: 'notifications', label: 'Alerts', icon: Bell },
      { key: 'community', label: 'Reviews', icon: Star },
      { key: 'offline', label: 'Offline', icon: CloudOff },
      ...(isAdmin ? [{ key: 'admin' as TabKey, label: 'Admin', icon: ShieldCheck }] : []),
      { key: 'profile', label: 'Profile', icon: UserCircle },
    ],
    [isAdmin]
  );

  const offlinePacks = useMemo(
    () => [
      { name: 'City Core Map', size: '38 MB', syncedAt: '2 mins ago', downloaded: true },
      { name: 'Cuisine Guide', size: '21 MB', syncedAt: '8 mins ago', downloaded: true },
      { name: 'Weekend Events', size: '12 MB', syncedAt: 'Pending', downloaded: false },
    ],
    []
  );

  const renderDiscover = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Featured Destinations</Text>
        <Text style={styles.sectionMeta}>Handpicked sights & activities for you</Text>
      </View>
      <DiscoveryModulePanel />

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Smart Discovery</Text>
        <Text style={styles.sectionMeta}>AI matches based on your mood</Text>
      </View>
      <SmartSearchPanel />

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Nearby Hotspots</Text>
        <Text style={styles.sectionMeta}>Hidden gems just around the corner</Text>
      </View>
      <View style={{ paddingHorizontal: 0 }}>
        <LocationDiscoveryPanel />
      </View>
    </Animated.View>
  );

  const renderEvents = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Local Events</Text>
        <Text style={styles.sectionMeta}>Join what's happening around you</Text>
      </View>
      <EventManagementPanel />
    </Animated.View>
  );

  const renderCommunity = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Traveler Feedback</Text>
        <Text style={styles.sectionMeta}>Authentic stories & ratings</Text>
      </View>
      <CommunityReviewsPanel />
      <View style={styles.infoCard}>
        <ShieldCheck size={20} color="#00f2fe" />
        <Text style={styles.infoCardText}>
          All reviews are verified by our community moderation filters.
        </Text>
      </View>
    </Animated.View>
  );

  const renderNotifications = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Alert Center</Text>
        <Text style={styles.sectionMeta}>Flight changes, invites & updates</Text>
      </View>
      <NotificationsPanel />
    </Animated.View>
  );

  const renderTravelPlanning = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Itineraries</Text>
        <Text style={styles.sectionMeta}>Organize your daily routes effortlessly</Text>
      </View>
      <TravelPlanningPanel />
    </Animated.View>
  );

  const renderOffline = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Offline Hub</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Work Offline</Text>
          <Switch 
            value={offlineMode} 
            onValueChange={setOfflineMode} 
            trackColor={{ false: '#333', true: '#00f2fe' }}
            thumbColor={'#fff'}
          />
        </View>
      </View>
      <View style={styles.offlineList}>
        {offlinePacks.map((pack, idx) => (
          <Animated.View key={pack.name} entering={FadeInDown.delay(80 * idx).duration(350)} style={styles.offlineCard}>
            <View style={styles.offlineTop}>
              <Text style={styles.offlineTitle}>{pack.name}</Text>
              <View style={[styles.offlineBadge, pack.downloaded && styles.offlineBadgeSuccess]}>
                <Text style={[styles.offlineBadgeText, pack.downloaded && styles.offlineBadgeTextSuccess]}>
                  {pack.downloaded ? 'Ready' : 'Pending'}
                </Text>
              </View>
            </View>
            <View style={styles.offlineMetaRow}>
              <Download size={14} color="#9ca3af" />
              <Text style={styles.offlineMetaText}>
                {pack.size} • Last sync: {pack.syncedAt}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
      <View style={styles.infoCard}>
        <CloudOff size={20} color="#f59e0b" />
        <Text style={styles.infoCardText}>
          Downloaded areas remain fully mapped, routed, and searchable without cellular network.
        </Text>
      </View>
    </Animated.View>
  );

  const renderProfile = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Account Settings</Text>
        <Text style={styles.sectionMeta}>Manage preferences, identity & data</Text>
      </View>
      <ProfilePreferencesPrivacyPanel onLoggedOut={onLoggedOut} />
    </Animated.View>
  );

  const renderAdmin = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Command Center</Text>
        <Text style={styles.sectionMeta}>Analytics, moderation & users</Text>
      </View>
      <AdminDashboardPanel />
    </Animated.View>
  );

  const renderSocial = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Traveler Network</Text>
        <Text style={styles.sectionMeta}>Connect with friends & adventurers</Text>
      </View>
      <SocialPanel />
    </Animated.View>
  );

  const renderMessages = () => (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Inbox</Text>
        <Text style={styles.sectionMeta}>Direct chats & secured connections</Text>
      </View>
      <DirectMessagingPanel />

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Event Groups</Text>
        <Text style={styles.sectionMeta}>Coordinate with your trip members</Text>
      </View>
      <MessagingPanel />
    </Animated.View>
  );

  const renderContent = () => {
    const panelStyle = styles.tabContentContainer;
    if (activeTab === 'discover') {
      return <View style={panelStyle}>{renderDiscover()}</View>;
    }
    if (activeTab === 'events') {
      return <View style={panelStyle}>{renderEvents()}</View>;
    }
    if (activeTab === 'travel') {
      return <View style={panelStyle}>{renderTravelPlanning()}</View>;
    }
    if (activeTab === 'social') {
      return <View style={panelStyle}>{renderSocial()}</View>;
    }
    if (activeTab === 'messages') {
      return <View style={panelStyle}>{renderMessages()}</View>;
    }
    if (activeTab === 'notifications') {
      return <View style={panelStyle}>{renderNotifications()}</View>;
    }
    if (activeTab === 'community') {
      return <View style={panelStyle}>{renderCommunity()}</View>;
    }
    if (activeTab === 'offline') {
      return <View style={panelStyle}>{renderOffline()}</View>;
    }
    if (activeTab === 'admin' && isAdmin) {
      return <View style={panelStyle}>{renderAdmin()}</View>;
    }
    if (activeTab === 'profile') {
      return <View style={panelStyle}>{renderProfile()}</View>;
    }

    return (
      <View style={styles.mainContentWrapper}>
        <View style={styles.tabContentContainer}>{renderDiscover()}</View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Immersive Header Image */}
        <ImageBackground source={{ uri: HEADER_BG }} style={styles.heroBackground} imageStyle={styles.heroImage}>
          <View style={styles.heroOverlay}>
            <Animated.View entering={FadeIn.duration(500)} style={styles.heroContent}>
              <View style={styles.logoRow}>
                <View style={styles.logoBox}>
                  <Compass color="#fff" size={20} strokeWidth={2.5} />
                </View>
                <View>
                  <Text style={styles.appTitle}>ExploreEase</Text>
                  <Text style={styles.appSubtitle}>Wander beyond limits</Text>
                </View>
              </View>

              <View style={styles.searchWrap}>
                <Search color="#9ca3af" size={18} style={styles.searchIcon} />
                <TextInput
                  placeholder="Where do you want to go?"
                  placeholderTextColor="#9ca3af"
                  value={searchText}
                  onChangeText={setSearchText}
                  style={styles.searchInput}
                />
              </View>
            </Animated.View>
          </View>
        </ImageBackground>

        {/* Tab Navigation Hub */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.tabHub}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                >
                  <Icon size={16} color={isActive ? '#0f172a' : '#9ca3af'} />
                  <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Dynamic Content Panel */}
        <View style={styles.mainContent}>
          {renderContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroBackground: {
    width: '100%',
    height: 240,
    justifyContent: 'flex-end',
  },
  heroImage: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)', // Gradient-like darkening
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 28,
  },
  heroContent: {
    gap: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#00f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00f2fe',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  appTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
  },
  tabHub: {
    marginTop: -20,
    zIndex: 10,
  },
  tabScroll: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 10,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonActive: {
    backgroundColor: '#00f2fe',
    borderColor: '#00f2fe',
  },
  tabButtonText: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 13,
  },
  tabButtonTextActive: {
    color: '#0f172a',
  },
  mainContent: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  mainContentWrapper: {
    flex: 1,
  },
  tabContentContainer: {
    flex: 1,
  },
  sectionContainer: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sectionMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  infoCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 242, 254, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.1)',
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginTop: 10,
  },
  infoCardText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
  },
  offlineList: {
    gap: 12,
  },
  offlineCard: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
    backgroundColor: '#1f2937',
    padding: 14,
    gap: 10,
  },
  offlineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offlineTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  offlineBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  offlineBadgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  offlineBadgeText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
  },
  offlineBadgeTextSuccess: {
    color: '#10b981',
  },
  offlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineMetaText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  switchLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ExploreEaseMain;
