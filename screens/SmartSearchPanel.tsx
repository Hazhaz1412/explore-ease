import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  smartSearchApi,
  DiscoveryItem,
  ItineraryResult,
  ItinerarySlot,
} from '../services/backend';

const MOODS = [
  { key: 'romantic', label: '💕 Romantic' },
  { key: 'adventure', label: '🧗 Adventure' },
  { key: 'cultural', label: '🏛️ Cultural' },
  { key: 'foodie', label: '🍜 Foodie' },
  { key: 'relaxing', label: '🧘 Relaxing' },
  { key: 'nightlife', label: '🌃 Nightlife' },
  { key: 'shopping', label: '🛍️ Shopping' },
];

const BUDGETS = [
  { value: 50000, label: '₫ Low' },
  { value: 200000, label: '₫₫ Med' },
  { value: 500000, label: '₫₫₫ High' },
  { value: 1000000, label: '💎 Premium' },
];

type SmartTab = 'search' | 'itinerary';

const SmartSearchPanel = () => {
  const [tab, setTab] = useState<SmartTab>('search');
  const [loading, setLoading] = useState(false);

  // Smart search state
  const [mood, setMood] = useState('');
  const [budget, setBudget] = useState<number | null>(null);
  const [freeHours, setFreeHours] = useState('');
  const [maxDistance, setMaxDistance] = useState('15');
  const [results, setResults] = useState<DiscoveryItem[]>([]);

  // Itinerary state
  const [itDuration, setItDuration] = useState('4');
  const [itStartTime, setItStartTime] = useState('18:00');
  const [itMood, setItMood] = useState('relaxing');
  const [itBudget, setItBudget] = useState<number | null>(200000);
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await smartSearchApi.smartSearch({
        mood: mood || undefined,
        budget: budget ?? undefined,
        freeHours: freeHours ? parseFloat(freeHours) : undefined,
        maxDistanceKm: maxDistance ? parseFloat(maxDistance) : 15,
      });
      setResults(data || []);
      if (!data?.length) {
        Alert.alert('Info', 'No places matched your filters. Try adjusting your mood or budget.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Smart search failed');
    } finally {
      setLoading(false);
    }
  }, [mood, budget, freeHours, maxDistance]);

  const handleItinerary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await smartSearchApi.generateItinerary({
        durationHours: itDuration ? parseFloat(itDuration) : 4,
        startTime: itStartTime || '18:00',
        mood: itMood || 'relaxing',
        budget: itBudget ?? undefined,
      });
      setItinerary(data);
      if (!data?.slots?.length) {
        Alert.alert('Info', 'Could not find enough places for your itinerary. Try increasing duration or distance.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Itinerary generation failed');
    } finally {
      setLoading(false);
    }
  }, [itDuration, itStartTime, itMood, itBudget]);

  const renderPlaceCard = (item: DiscoveryItem, index: number) => (
    <Animated.View
      key={item.id}
      entering={FadeInDown.delay(index * 45).duration(240)}
      style={styles.placeCard}
    >
      <View style={styles.placeHeader}>
        <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {item.rating?.toFixed(1) || '—'}</Text>
        </View>
      </View>
      <Text style={styles.placeMeta} numberOfLines={1}>
        {item.category} • {item.distanceKm?.toFixed(1)} km •{'  '}
        {'₫'.repeat(item.priceLevel || 1)}
      </Text>
      {item.shortDescription ? (
        <Text style={styles.placeDesc} numberOfLines={2}>{item.shortDescription}</Text>
      ) : null}
      {item.tags?.length ? (
        <View style={styles.tagRow}>
          {item.tags.slice(0, 4).map((tag, i) => (
            <View key={i} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );

  const renderSlotCard = (slot: ItinerarySlot, index: number) => (
    <Animated.View
      key={slot.order}
      entering={FadeInDown.delay(index * 60).duration(280)}
      style={styles.slotCard}
    >
      <View style={styles.slotTimeline}>
        <View style={styles.slotDot} />
        {index < (itinerary?.slots?.length ?? 0) - 1 ? <View style={styles.slotLine} /> : null}
      </View>
      <View style={styles.slotContent}>
        <View style={styles.slotTimeRow}>
          <Text style={styles.slotTime}>{slot.startTime} — {slot.endTime}</Text>
          <Text style={styles.slotDuration}>{slot.durationMinutes} min</Text>
        </View>
        <Text style={styles.slotName}>{slot.placeName}</Text>
        <Text style={styles.slotMeta}>
          {slot.category} • ⭐ {slot.rating?.toFixed(1)} • {slot.distanceKm?.toFixed(1)} km
        </Text>
        {slot.note ? <Text style={styles.slotNote}>{slot.note}</Text> : null}
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        <Pressable
          onPress={() => setTab('search')}
          style={[styles.tabChip, tab === 'search' && styles.tabChipActive]}
        >
          <Text style={[styles.tabChipText, tab === 'search' && styles.tabChipTextActive]}>🔍 Smart Search</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('itinerary')}
          style={[styles.tabChip, tab === 'itinerary' && styles.tabChipActive]}
        >
          <Text style={[styles.tabChipText, tab === 'itinerary' && styles.tabChipTextActive]}>🗓️ Itinerary Builder</Text>
        </Pressable>
      </ScrollView>

      {/* Smart Search Tab */}
      {tab === 'search' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Choose Your Mood</Text>
          <View style={styles.moodGrid}>
            {MOODS.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMood(mood === m.key ? '' : m.key)}
                style={[styles.moodChip, mood === m.key && styles.moodChipActive]}
              >
                <Text style={[styles.moodText, mood === m.key && styles.moodTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>💰 Budget</Text>
          <View style={styles.budgetRow}>
            {BUDGETS.map((b) => (
              <Pressable
                key={b.value}
                onPress={() => setBudget(budget === b.value ? null : b.value)}
                style={[styles.budgetChip, budget === b.value && styles.budgetChipActive]}
              >
                <Text style={[styles.budgetText, budget === b.value && styles.budgetTextActive]}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Free hours</Text>
              <TextInput
                value={freeHours}
                onChangeText={setFreeHours}
                placeholder="e.g. 3"
                placeholderTextColor="#666"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Max distance (km)</Text>
              <TextInput
                value={maxDistance}
                onChangeText={setMaxDistance}
                placeholder="15"
                placeholderTextColor="#666"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
          </View>

          <Pressable onPress={handleSearch} style={styles.searchBtn}>
            {loading ? (
              <ActivityIndicator color="#0b0b0b" />
            ) : (
              <Text style={styles.searchBtnText}>🔍 Find Places</Text>
            )}
          </Pressable>

          {results.length > 0 && (
            <View style={styles.resultList}>
              <Text style={styles.resultCountText}>{results.length} places found</Text>
              {results.map((item, idx) => renderPlaceCard(item, idx))}
            </View>
          )}
        </View>
      )}

      {/* Itinerary Builder Tab */}
      {tab === 'itinerary' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗓️ Plan Your Outing</Text>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Duration (hours)</Text>
              <TextInput
                value={itDuration}
                onChangeText={setItDuration}
                placeholder="4"
                placeholderTextColor="#666"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Start time</Text>
              <TextInput
                value={itStartTime}
                onChangeText={setItStartTime}
                placeholder="18:00"
                placeholderTextColor="#666"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Mood</Text>
          <View style={styles.moodGrid}>
            {MOODS.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setItMood(m.key)}
                style={[styles.moodChip, itMood === m.key && styles.moodChipActive]}
              >
                <Text style={[styles.moodText, itMood === m.key && styles.moodTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Budget</Text>
          <View style={styles.budgetRow}>
            {BUDGETS.map((b) => (
              <Pressable
                key={b.value}
                onPress={() => setItBudget(itBudget === b.value ? null : b.value)}
                style={[styles.budgetChip, itBudget === b.value && styles.budgetChipActive]}
              >
                <Text style={[styles.budgetText, itBudget === b.value && styles.budgetTextActive]}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={handleItinerary} style={styles.searchBtn}>
            {loading ? (
              <ActivityIndicator color="#0b0b0b" />
            ) : (
              <Text style={styles.searchBtnText}>🗓️ Generate Itinerary</Text>
            )}
          </Pressable>

          {itinerary && itinerary.slots.length > 0 && (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.itineraryCard}>
              <View style={styles.itineraryHeader}>
                <Text style={styles.itineraryTitle}>
                  Your {itinerary.totalHours}h {itinerary.mood} itinerary
                </Text>
                <Text style={styles.itineraryTime}>
                  {itinerary.startTime} → {itinerary.endTime}
                </Text>
              </View>
              {itinerary.slots.map((slot, idx) => renderSlotCard(slot, idx))}
            </Animated.View>
          )}

          {itinerary && itinerary.slots.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No slots generated</Text>
              <Text style={styles.emptyMeta}>Try different settings</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14 },
  tabRow: { gap: 8, paddingRight: 12 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#181818', borderWidth: 1, borderColor: '#333',
  },
  tabChipActive: { backgroundColor: '#f5f5f5', borderColor: '#f5f5f5' },
  tabChipText: { color: '#999', fontWeight: '700', fontSize: 13 },
  tabChipTextActive: { color: '#0b0b0b' },
  section: {
    gap: 14,
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
  },
  sectionTitle: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
  },
  moodChipActive: { backgroundColor: '#f5f5f5', borderColor: '#f5f5f5' },
  moodText: { color: '#999', fontSize: 13, fontWeight: '600' },
  moodTextActive: { color: '#0b0b0b' },
  budgetRow: { flexDirection: 'row', gap: 8 },
  budgetChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
  },
  budgetChipActive: { backgroundColor: '#f5f5f5', borderColor: '#f5f5f5' },
  budgetText: { color: '#999', fontSize: 12, fontWeight: '700' },
  budgetTextActive: { color: '#0b0b0b' },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: '#888', fontSize: 12, fontWeight: '600' },
  input: {
    borderRadius: 12, borderWidth: 1, borderColor: '#333', backgroundColor: '#171717',
    color: '#f2f2f2', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
  },
  searchBtn: {
    borderRadius: 14, backgroundColor: '#f5f5f5', paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  searchBtnText: { color: '#0b0b0b', fontSize: 15, fontWeight: '800' },
  resultList: { gap: 10, marginTop: 6 },
  resultCountText: { color: '#888', fontSize: 12, fontWeight: '600' },
  placeCard: {
    padding: 14, borderRadius: 14, backgroundColor: '#171717',
    borderWidth: 1, borderColor: '#282828', gap: 6,
  },
  placeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeName: { color: '#f2f2f2', fontSize: 15, fontWeight: '700', flex: 1 },
  ratingBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#222',
  },
  ratingText: { color: '#f5c518', fontSize: 12, fontWeight: '600' },
  placeMeta: { color: '#888', fontSize: 12 },
  placeDesc: { color: '#999', fontSize: 13, lineHeight: 18 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tagChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: '#222', borderWidth: 1, borderColor: '#333',
  },
  tagText: { color: '#aaa', fontSize: 10 },
  itineraryCard: {
    gap: 2, marginTop: 6,
    backgroundColor: '#0f0f0f', borderRadius: 16,
    borderWidth: 1, borderColor: '#2a2a2a', padding: 14,
  },
  itineraryHeader: { marginBottom: 12, gap: 4 },
  itineraryTitle: { color: '#f2f2f2', fontSize: 16, fontWeight: '800' },
  itineraryTime: { color: '#888', fontSize: 13 },
  slotCard: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  slotTimeline: { alignItems: 'center', width: 20 },
  slotDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#f5f5f5', marginTop: 4,
  },
  slotLine: {
    width: 2, flex: 1, backgroundColor: '#333', marginTop: 4,
  },
  slotContent: {
    flex: 1, gap: 4, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f1f1f',
  },
  slotTimeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slotTime: { color: '#f5f5f5', fontSize: 13, fontWeight: '700' },
  slotDuration: {
    color: '#888', fontSize: 11, backgroundColor: '#222',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  slotName: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  slotMeta: { color: '#888', fontSize: 12 },
  slotNote: { color: '#aaa', fontSize: 13, fontStyle: 'italic' },
  emptyCard: {
    padding: 32, borderRadius: 16, backgroundColor: '#111',
    borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', gap: 8,
  },
  emptyTitle: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  emptyMeta: { color: '#888', fontSize: 13, textAlign: 'center' },
});

export default SmartSearchPanel;
