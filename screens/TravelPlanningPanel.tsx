import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  ImageBackground,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Calendar, Clock, MapPin, Plus, Share2, StickyNote, Trash2 } from 'lucide-react-native';
import {
  apiBaseUrl,
  CreateTravelPlanItemInput,
  TravelMode,
  TravelPlanDetail,
  TravelPlanItem,
  TravelPlanItemType,
  TravelPlanSummary,
  TravelRouteOptimization,
  travelApi,
} from '../services/backend';

const ITEM_TYPES: TravelPlanItemType[] = ['PLACE', 'EVENT', 'NOTE'];
const ROUTE_MODES: TravelMode[] = ['walking', 'driving', 'bicycling'];

type DraftItem = CreateTravelPlanItemInput & {
  dayNumberText: string;
  latitudeText: string;
  longitudeText: string;
};

const blankDraft = (day = 1): DraftItem => ({
  dayNumber: day,
  dayNumberText: String(day),
  itemType: 'PLACE',
  title: '',
  locationName: '',
  note: '',
  reminderAt: '',
  startTime: '',
  latitudeText: '',
  longitudeText: '',
});

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const toIsoDateString = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseIsoDate = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const parsePlanDateInput = (raw: string): string | undefined | null => {
  const value = raw.trim();
  if (!value) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseIsoDate(value) ? value : null;
  }

  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }
    return toIsoDateString(parsed);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDateString(parsed);
};

const addDaysToIso = (isoDate: string, days: number): string => {
  const parsed = parseIsoDate(isoDate) || new Date();
  const next = new Date(parsed);
  next.setDate(next.getDate() + days);
  return toIsoDateString(next);
};

const createShareLink = (sharePath: string, shareToken: string) => {
  const fallbackPath = `/api/travel-plans/shared/${shareToken}`;
  const path = (sharePath || fallbackPath).startsWith('/') ? (sharePath || fallbackPath) : `/${sharePath}`;
  return `${apiBaseUrl}${path}`;
};

const TravelPlanningPanel: React.FC = () => {
  const [plans, setPlans] = useState<TravelPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [activePlan, setActivePlan] = useState<TravelPlanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [activeDay, setActiveDay] = useState(1);
  const [routeMode, setRouteMode] = useState<TravelMode>('walking');
  const [optimizing, setOptimizing] = useState(false);
  const [optimized, setOptimized] = useState<TravelRouteOptimization | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [newPlanStartDate, setNewPlanStartDate] = useState('');
  const [newPlanEndDate, setNewPlanEndDate] = useState('');
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [itemDraft, setItemDraft] = useState<DraftItem>(blankDraft(1));
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const [latestShareLink, setLatestShareLink] = useState<string | null>(null);

  const loadPlanDetail = useCallback(async (planId: number) => {
    try {
      setDetailLoading(true);
      setLatestShareLink(null);
      const payload = await travelApi.getPlan(planId);
      setActivePlan(payload);
      setActivePlanId(planId);
      setOptimized(null);
    } catch (error: any) {
      Alert.alert('Travel Plan', error?.message || 'Cannot load plan details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadPlans = useCallback(
    async (preferredId?: number | null) => {
      try {
        setPlansLoading(true);
        const payload = await travelApi.listPlans();
        setPlans(payload);

        if (!payload.length) {
          setActivePlan(null);
          setActivePlanId(null);
          setActiveDay(1);
          return;
        }

        const requestedId = preferredId ?? activePlanId ?? payload[0].id;
        const chosen = payload.some((plan) => plan.id === requestedId) ? requestedId : payload[0].id;
        await loadPlanDetail(chosen);
      } catch (error: any) {
        Alert.alert('Travel Plans', error?.message || 'Cannot load plans.');
      } finally {
        setPlansLoading(false);
      }
    },
    [activePlanId, loadPlanDetail]
  );

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const dayGroups = useMemo(() => {
    if (!activePlan?.items?.length) return [] as Array<{ day: number; items: TravelPlanItem[] }>;

    const groups = new Map<number, TravelPlanItem[]>();
    activePlan.items.forEach((item) => {
      const day = item.dayNumber || 1;
      const current = groups.get(day) || [];
      current.push(item);
      groups.set(day, current);
    });

    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => ({
        day,
        items: [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
      }));
  }, [activePlan?.items]);

  useEffect(() => {
    if (!dayGroups.length) {
      setActiveDay(1);
      return;
    }
    if (!dayGroups.some((group) => group.day === activeDay)) {
      setActiveDay(dayGroups[0].day);
    }
  }, [activeDay, dayGroups]);

  const activeDayItems = useMemo(
    () => dayGroups.find((group) => group.day === activeDay)?.items || [],
    [activeDay, dayGroups]
  );

  const openAddItemModal = () => {
    setShowAdvancedFields(false);
    setItemDraft(blankDraft(activeDay));
    setItemModalVisible(true);
  };

  const normalizeStartDateInput = () => {
    const normalized = parsePlanDateInput(newPlanStartDate);
    if (typeof normalized === 'string') {
      setNewPlanStartDate(normalized);
    }
  };

  const normalizeEndDateInput = () => {
    const normalized = parsePlanDateInput(newPlanEndDate);
    if (typeof normalized === 'string') {
      setNewPlanEndDate(normalized);
    }
  };

  const setStartDateQuick = (offsetDays: number) => {
    const today = toIsoDateString(new Date());
    const start = addDaysToIso(today, offsetDays);
    setNewPlanStartDate(start);
    if (!newPlanEndDate.trim()) {
      setNewPlanEndDate(addDaysToIso(start, 2));
    }
  };

  const setEndDateFromStart = (offsetDays: number) => {
    const parsedStart = parsePlanDateInput(newPlanStartDate);
    const base = typeof parsedStart === 'string' ? parsedStart : toIsoDateString(new Date());
    setNewPlanEndDate(addDaysToIso(base, offsetDays));
  };

  const onCreatePlan = async () => {
    if (!newPlanTitle.trim()) {
      Alert.alert('Create Plan', 'Title is required.');
      return;
    }

    const normalizedStart = parsePlanDateInput(newPlanStartDate);
    if (normalizedStart === null) {
      Alert.alert('Create Plan', 'Start date invalid. Use yyyy-mm-dd or dd/mm/yyyy.');
      return;
    }

    const normalizedEnd = parsePlanDateInput(newPlanEndDate);
    if (normalizedEnd === null) {
      Alert.alert('Create Plan', 'End date invalid. Use yyyy-mm-dd or dd/mm/yyyy.');
      return;
    }

    if (normalizedStart && normalizedEnd && normalizedEnd < normalizedStart) {
      Alert.alert('Create Plan', 'End date must be on or after start date.');
      return;
    }

    if (typeof normalizedStart === 'string') {
      setNewPlanStartDate(normalizedStart);
    }
    if (typeof normalizedEnd === 'string') {
      setNewPlanEndDate(normalizedEnd);
    }

    try {
      setCreatingPlan(true);
      const created = await travelApi.createPlan({
        title: newPlanTitle.trim(),
        startDate: normalizedStart,
        endDate: normalizedEnd,
      });
      setCreateModalVisible(false);
      setNewPlanTitle('');
      setNewPlanStartDate('');
      setNewPlanEndDate('');
      await loadPlans(created.id);
    } catch (error: any) {
      Alert.alert('Create Plan', error?.message || 'Failed to create plan.');
    } finally {
      setCreatingPlan(false);
    }
  };

  const onDeletePlan = async () => {
    if (!activePlanId) return;

    const runDelete = async () => {
      try {
        await travelApi.deletePlan(activePlanId);
        setLatestShareLink(null);
        await loadPlans();
      } catch (error: any) {
        Alert.alert('Delete Plan', error?.message || 'Failed to delete plan.');
      }
    };

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('Delete this plan permanently?');
      if (!confirmed) return;
      await runDelete();
      return;
    }

    Alert.alert('Delete Plan', 'Delete this plan permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void runDelete();
        },
      },
    ]);
  };

  const onAddItem = async () => {
    if (!activePlanId) return;

    const dayNumber = Number(itemDraft.dayNumberText);
    if (!Number.isFinite(dayNumber) || dayNumber <= 0) {
      Alert.alert('Itinerary', 'Day must be greater than 0.');
      return;
    }
    if (itemDraft.itemType !== 'NOTE' && !itemDraft.title?.trim()) {
      Alert.alert('Itinerary', 'Title is required.');
      return;
    }

    const latitude = itemDraft.latitudeText.trim() ? Number(itemDraft.latitudeText) : undefined;
    const longitude = itemDraft.longitudeText.trim() ? Number(itemDraft.longitudeText) : undefined;
    if ((latitude == null) !== (longitude == null)) {
      Alert.alert('Itinerary', 'Latitude and longitude must be entered together.');
      return;
    }

    try {
      setAddingItem(true);
      await travelApi.addItem(activePlanId, {
        dayNumber,
        itemType: itemDraft.itemType,
        title: itemDraft.title?.trim() || undefined,
        locationName: itemDraft.locationName?.trim() || undefined,
        note: itemDraft.note?.trim() || undefined,
        reminderAt: itemDraft.reminderAt?.trim() || undefined,
        startTime: itemDraft.startTime?.trim() || undefined,
        latitude,
        longitude,
      });
      setItemModalVisible(false);
      await loadPlanDetail(activePlanId);
      setActiveDay(dayNumber);
    } catch (error: any) {
      Alert.alert('Itinerary', error?.message || 'Failed to add item.');
    } finally {
      setAddingItem(false);
    }
  };

  const onDeleteItem = async (itemId: number) => {
    if (!activePlanId) return;
    try {
      await travelApi.deleteItem(activePlanId, itemId);
      await loadPlanDetail(activePlanId);
    } catch (error: any) {
      Alert.alert('Itinerary', error?.message || 'Failed to remove item.');
    }
  };

  const onOptimizeRoute = async () => {
    if (!activePlanId) return;
    try {
      setOptimizing(true);
      const payload = await travelApi.optimizeRoute(activePlanId, {
        dayNumber: activeDay,
        mode: routeMode,
      });
      setOptimized(payload);
    } catch (error: any) {
      Alert.alert('Optimize Route', error?.message || 'Unable to optimize this day route.');
    } finally {
      setOptimizing(false);
    }
  };

  const onSharePlan = async () => {
    if (!activePlanId) return;

    try {
      const payload = await travelApi.sharePlan(activePlanId);
      const link = createShareLink(payload.sharePath, payload.shareToken);
      setLatestShareLink(link);

      try {
        await Share.share({
          title: activePlan?.title || 'Travel plan',
          message: `Check my travel plan:\n${link}`,
          url: link,
        });
      } catch {
        Alert.alert('Share Link Ready', link);
      }
    } catch (error: any) {
      Alert.alert('Share Plan', error?.message || 'Unable to generate share link.');
    }
  };

  const onOpenSharedLink = async () => {
    if (!latestShareLink) return;
    try {
      await Linking.openURL(latestShareLink);
    } catch {
      Alert.alert('Open Link', 'Cannot open the share link on this device.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Your Plans</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.primaryBtnText}>+ New Plan</Text>
          </Pressable>
        </View>

        {plansLoading ? (
          <ActivityIndicator color="#f8fafc" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planRow}>
            {plans.map((plan) => (
              <Pressable
                key={plan.id}
                style={[styles.planChip, activePlanId === plan.id && styles.planChipActive]}
                onPress={() => void loadPlanDetail(plan.id)}
              >
                <Text style={[styles.planChipText, activePlanId === plan.id && styles.planChipTextActive]}>{plan.title}</Text>
                <Text style={[styles.planChipMeta, activePlanId === plan.id && styles.planChipTextActive]}>
                  {plan.dayCount} days
                </Text>
              </Pressable>
            ))}
            {!plans.length && <Text style={styles.empty}>No plan yet.</Text>}
          </ScrollView>
        )}
      </View>

      <View style={styles.card}>
        {detailLoading ? (
          <ActivityIndicator color="#f8fafc" />
        ) : !activePlan ? (
          <Text style={styles.empty}>Create a plan to start building itinerary.</Text>
        ) : (
          <>
            <ImageBackground 
              source={{ uri: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=800' }}
              style={styles.planBannerBg}
              imageStyle={{ borderRadius: 14 }}
            >
              <View style={styles.planBannerOverlay}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.bannerTitle}>{activePlan.title}</Text>
                    <View style={styles.bannerMetaRow}>
                      <Calendar size={12} color="#e2e8f0" />
                      <Text style={styles.bannerMetaText}>
                        {activePlan.startDate || 'No start date'} {'->'} {activePlan.endDate || 'No end date'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <Pressable style={styles.ghostBtnLight} onPress={onSharePlan}>
                      <Share2 size={16} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.primaryBtnModern} onPress={openAddItemModal}>
                      <Plus size={16} color="#0f172a" />
                      <Text style={styles.primaryBtnTextModern}>Item</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ImageBackground>

            {!!latestShareLink && (
              <View style={styles.shareCard}>
                <Text style={styles.shareTitle}>Share link ready</Text>
                <Text style={styles.shareLink} selectable>
                  {latestShareLink}
                </Text>
                <Pressable style={styles.shareOpenBtn} onPress={onOpenSharedLink}>
                  <Text style={styles.shareOpenBtnText}>Open link</Text>
                </Pressable>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {dayGroups.map((group) => (
                <Pressable
                  key={`day-${group.day}`}
                  style={[styles.dayChip, group.day === activeDay && styles.dayChipActive]}
                  onPress={() => setActiveDay(group.day)}
                >
                  <Text style={[styles.dayChipText, group.day === activeDay && styles.dayChipTextActive]}>
                    Day {group.day}
                  </Text>
                </Pressable>
              ))}
              {!dayGroups.length && (
                <Pressable style={[styles.dayChip, styles.dayChipActive]} onPress={() => setActiveDay(1)}>
                  <Text style={[styles.dayChipText, styles.dayChipTextActive]}>Day 1</Text>
                </Pressable>
              )}
            </ScrollView>

            <View style={styles.routeRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
                {ROUTE_MODES.map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.modeChip, routeMode === mode && styles.modeChipActive]}
                    onPress={() => setRouteMode(mode)}
                  >
                    <Text style={[styles.modeChipText, routeMode === mode && styles.modeChipTextActive]}>{mode}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.primaryBtn} onPress={onOptimizeRoute} disabled={optimizing}>
                <Text style={styles.primaryBtnText}>{optimizing ? 'Optimizing...' : `Optimize Day ${activeDay}`}</Text>
              </Pressable>
            </View>

            {!!optimized && optimized.dayNumber === activeDay && (
              <View style={styles.optimizedCard}>
                <Text style={styles.optimizedTitle}>
                  {optimized.totalDistanceKm} km | {optimized.estimatedMinutes} mins
                </Text>
                <Text style={styles.meta}>
                  {optimized.optimizedItems.map((item) => item.title || item.locationName || `Stop ${item.id}`).join(' -> ')}
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Day {activeDay} Itinerary</Text>
            {!activeDayItems.length && <Text style={styles.empty}>No items for this day.</Text>}
            {activeDayItems.map((item) => (
              <Animated.View key={`item-${item.id}`} entering={FadeInDown.duration(180)} style={styles.itemCardModern}>
                <View style={styles.itemCardLeftAccent} />
                <View style={styles.itemCardContent}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle}>{item.title || item.locationName || `Item ${item.id}`}</Text>
                    <View style={styles.itemTypeBadge}>
                      <Text style={styles.itemTypeText}>{item.itemType}</Text>
                    </View>
                  </View>
                  
                  {!!item.locationName && (
                    <View style={styles.metaIconRow}>
                      <MapPin size={12} color="#9ca3af" />
                      <Text style={styles.metaText}>{item.locationName}</Text>
                    </View>
                  )}
                  {!!item.startTime && (
                    <View style={styles.metaIconRow}>
                      <Clock size={12} color="#9ca3af" />
                      <Text style={styles.metaText}>{formatDate(item.startTime)}</Text>
                    </View>
                  )}
                  {!!item.reminderAt && (
                    <View style={styles.metaIconRow}>
                      <Calendar size={12} color="#fde047" />
                      <Text style={styles.reminderText}>Reminder: {formatDate(item.reminderAt)}</Text>
                    </View>
                  )}
                  {!!item.note && (
                    <View style={styles.metaIconRow}>
                      <StickyNote size={12} color="#93c5fd" />
                      <Text style={styles.noteText}>{item.note}</Text>
                    </View>
                  )}

                  <View style={styles.itemActions}>
                    <Pressable onPress={() => void onDeleteItem(item.id)} style={styles.deleteBtnModern}>
                      <Trash2 size={12} color="#ef4444" />
                      <Text style={styles.deleteBtnTextModern}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ))}

            <Pressable style={styles.deletePlanBtn} onPress={onDeletePlan}>
              <Text style={styles.deletePlanBtnText}>Delete Plan</Text>
            </Pressable>
          </>
        )}
      </View>

      <Modal visible={createModalVisible} transparent animationType="fade" onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Plan</Text>
            <TextInput
              style={styles.input}
              placeholder="Plan title"
              placeholderTextColor="#6b7280"
              value={newPlanTitle}
              onChangeText={setNewPlanTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Start date (yyyy-mm-dd or dd/mm/yyyy)"
              placeholderTextColor="#6b7280"
              value={newPlanStartDate}
              onChangeText={setNewPlanStartDate}
              onBlur={normalizeStartDateInput}
            />
            <View style={styles.quickDateRow}>
              <Pressable style={styles.quickDateBtn} onPress={() => setStartDateQuick(0)}>
                <Text style={styles.quickDateBtnText}>Today</Text>
              </Pressable>
              <Pressable style={styles.quickDateBtn} onPress={() => setStartDateQuick(1)}>
                <Text style={styles.quickDateBtnText}>Tomorrow</Text>
              </Pressable>
              <Pressable style={styles.quickDateBtn} onPress={() => setStartDateQuick(3)}>
                <Text style={styles.quickDateBtnText}>+3 days</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="End date (yyyy-mm-dd or dd/mm/yyyy)"
              placeholderTextColor="#6b7280"
              value={newPlanEndDate}
              onChangeText={setNewPlanEndDate}
              onBlur={normalizeEndDateInput}
            />
            <View style={styles.quickDateRow}>
              <Pressable style={styles.quickDateBtn} onPress={() => setEndDateFromStart(0)}>
                <Text style={styles.quickDateBtnText}>Same day</Text>
              </Pressable>
              <Pressable style={styles.quickDateBtn} onPress={() => setEndDateFromStart(2)}>
                <Text style={styles.quickDateBtnText}>+2 days</Text>
              </Pressable>
              <Pressable style={styles.quickDateBtn} onPress={() => setEndDateFromStart(7)}>
                <Text style={styles.quickDateBtnText}>+7 days</Text>
              </Pressable>
            </View>
            <Text style={styles.dateHelperText}>Tip: You can type `20/03/2026`, app will convert automatically.</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onCreatePlan} disabled={creatingPlan}>
                <Text style={styles.primaryBtnText}>{creatingPlan ? 'Creating...' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={itemModalVisible} transparent animationType="fade" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Itinerary Item</Text>
            <TextInput
              style={styles.input}
              placeholder="Day"
              placeholderTextColor="#6b7280"
              keyboardType="numeric"
              value={itemDraft.dayNumberText}
              onChangeText={(value) => setItemDraft((prev) => ({ ...prev, dayNumberText: value }))}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
              {ITEM_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.modeChip, itemDraft.itemType === type && styles.modeChipActive]}
                  onPress={() => setItemDraft((prev) => ({ ...prev, itemType: type }))}
                >
                  <Text style={[styles.modeChipText, itemDraft.itemType === type && styles.modeChipTextActive]}>{type}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder={itemDraft.itemType === 'NOTE' ? 'Title (optional)' : 'Title'}
              placeholderTextColor="#6b7280"
              value={itemDraft.title}
              onChangeText={(value) => setItemDraft((prev) => ({ ...prev, title: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Location (optional)"
              placeholderTextColor="#6b7280"
              value={itemDraft.locationName}
              onChangeText={(value) => setItemDraft((prev) => ({ ...prev, locationName: value }))}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Note / reminder details"
              placeholderTextColor="#6b7280"
              multiline
              value={itemDraft.note}
              onChangeText={(value) => setItemDraft((prev) => ({ ...prev, note: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Reminder ISO (optional)"
              placeholderTextColor="#6b7280"
              value={itemDraft.reminderAt}
              onChangeText={(value) => setItemDraft((prev) => ({ ...prev, reminderAt: value }))}
            />

            <Pressable style={styles.advancedToggle} onPress={() => setShowAdvancedFields((prev) => !prev)}>
              <Text style={styles.advancedToggleText}>{showAdvancedFields ? 'Hide advanced fields' : 'Show advanced fields'}</Text>
            </Pressable>

            {showAdvancedFields && (
              <View style={{ gap: 8 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Start time ISO (optional)"
                  placeholderTextColor="#6b7280"
                  value={itemDraft.startTime}
                  onChangeText={(value) => setItemDraft((prev) => ({ ...prev, startTime: value }))}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    placeholder="Latitude"
                    placeholderTextColor="#6b7280"
                    value={itemDraft.latitudeText}
                    onChangeText={(value) => setItemDraft((prev) => ({ ...prev, latitudeText: value }))}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    placeholder="Longitude"
                    placeholderTextColor="#6b7280"
                    value={itemDraft.longitudeText}
                    onChangeText={(value) => setItemDraft((prev) => ({ ...prev, longitudeText: value }))}
                  />
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onAddItem} disabled={addingItem}>
                <Text style={styles.primaryBtnText}>{addingItem ? 'Saving...' : 'Save Item'}</Text>
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
  card: {
    borderWidth: 1,
    borderColor: '#2a3342',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  meta: {
    color: '#9eb1cd',
    fontSize: 12,
  },
  sectionTitle: {
    color: '#dbe7fb',
    fontSize: 13,
    fontWeight: '700',
  },
  planRow: {
    gap: 8,
  },
  planChip: {
    borderWidth: 1,
    borderColor: '#2d3f57',
    borderRadius: 10,
    backgroundColor: '#0f1c31',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 130,
  },
  planChipActive: {
    borderColor: '#f8fafc',
    backgroundColor: '#f8fafc',
  },
  planChipText: {
    color: '#d8e7ff',
    fontWeight: '700',
    fontSize: 12,
  },
  planChipTextActive: {
    color: '#0f172a',
  },
  planChipMeta: {
    color: '#9eb1cd',
    fontSize: 11,
    marginTop: 2,
  },
  primaryBtn: {
    borderRadius: 8,
    backgroundColor: '#00f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  ghostBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  
  /* Banners and Modern buttons */
  planBannerBg: {
    width: '100%',
    height: 110,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  planBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    padding: 12,
    justifyContent: 'flex-end',
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerMetaText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ghostBtnLight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    backgroundColor: '#00f2fe',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryBtnTextModern: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },

  shareCard: {
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  shareTitle: {
    color: '#e0f2fe',
    fontSize: 12,
    fontWeight: '800',
  },
  shareLink: {
    color: '#7dd3fc',
    fontSize: 12,
  },
  shareOpenBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#0284c7',
    backgroundColor: '#0369a1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareOpenBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  dayRow: {
    gap: 8,
    marginBottom: 4,
  },
  dayChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dayChipActive: {
    borderColor: '#00f2fe',
    backgroundColor: 'rgba(0,242,254,0.15)',
  },
  dayChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
  },
  dayChipTextActive: {
    color: '#00f2fe',
  },
  routeRow: {
    gap: 8,
  },
  modeRow: {
    gap: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modeChipActive: {
    borderColor: '#e2e8f0',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: '#f8fafc',
  },
  optimizedCard: {
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 12,
    backgroundColor: 'rgba(6,78,59,0.3)',
    padding: 12,
    gap: 6,
  },
  optimizedTitle: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '800',
  },
  
  /* Item Card Modern */
  itemCardModern: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(31,41,55,0.6)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  itemCardLeftAccent: {
    width: 6,
    backgroundColor: '#00f2fe',
  },
  itemCardContent: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  itemTypeBadge: {
    backgroundColor: 'rgba(56,189,248,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  itemTypeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },
  metaIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  reminderText: {
    color: '#fef08a',
    fontSize: 12,
    fontWeight: '600',
  },
  noteText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontStyle: 'italic',
  },
  itemActions: {
    marginTop: 4,
    flexDirection: 'row',
  },
  deleteBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteBtnTextModern: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  deletePlanBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  deletePlanBtnText: {
    color: '#fca5a5',
    fontWeight: '800',
    fontSize: 12,
  },
  empty: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#2a3342',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    padding: 12,
    gap: 9,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#304159',
    backgroundColor: '#0f1c31',
    color: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  halfInput: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  advancedToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  advancedToggleText: {
    color: '#93c5fd',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  quickDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickDateBtn: {
    borderWidth: 1,
    borderColor: '#2e4866',
    backgroundColor: '#13233b',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickDateBtnText: {
    color: '#d6e6ff',
    fontSize: 11,
    fontWeight: '700',
  },
  dateHelperText: {
    color: '#8ea5c7',
    fontSize: 11,
  },
  modalActions: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

export default TravelPlanningPanel;
