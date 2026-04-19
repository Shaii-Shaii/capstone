import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppCard } from '../ui/AppCard';
import { AppIcon } from '../ui/AppIcon';
import {
  fetchDonorRecommendationsBySubmissionId,
  getHairSubmissionImageSignedUrl,
} from '../../features/hairSubmission.api';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const CAPTURE_NOISE_PATTERNS = [
  'retake', 'lighting', 'image quality', 'photo quality', 'clearer photo',
  'clear photo', 'clear image', 'better photo', 'better image', 'capture',
  'resubmit', 'provide a better', 'ensure all views', 'ensure the photo',
  'improve the photo', 'improve lighting', 'provide clear', 'upload',
  'reupload', 'all views are', 'photo is clear', 'visible in the',
];

const normalizeConditionTone = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return {
      dotColor: '#65b96f',
      label: 'Healthy',
    };
  }

  if (normalized.includes('dry') || normalized.includes('damage') || normalized.includes('frizz')) {
    return {
      dotColor: '#d89258',
      label: 'Needs care',
    };
  }

  return {
    dotColor: theme.colors.brandPrimary,
    label: condition || 'Hair check',
  };
};

const formatModalDateLabel = (value) => (
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
);

const formatSavedDateTime = (value) => (
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
);

const formatTimeLabel = (value) => (
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
);

const formatLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not detected';
  const inches = numericValue / 2.54;
  return `${numericValue.toFixed(1)} cm / ${inches.toFixed(1)} in`;
};

const toCompactSummary = (value = '') => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 217).trimEnd()}...`;
};

const isHairCareTip = (recommendation) => {
  const combined = `${recommendation?.title || ''} ${recommendation?.recommendation_text || ''}`.toLowerCase();
  return !CAPTURE_NOISE_PATTERNS.some((pattern) => combined.includes(pattern));
};

const buildEntryKey = (entry, index) => (
  String(
    entry?.screening?.ai_screening_id
    || entry?.screening?.created_at
    || entry?.submission?.submission_id
    || index
  )
);

export function HairLogDetailModal({ visible, dateKey = '', entries = [], onClose }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [activeEntryKey, setActiveEntryKey] = React.useState('');
  const [signedUrls, setSignedUrls] = React.useState({});
  const [isLoadingUrls, setIsLoadingUrls] = React.useState(false);
  const [recommendations, setRecommendations] = React.useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = React.useState(false);

  React.useEffect(() => {
    if (!visible || !entries.length) {
      setActiveEntryKey('');
      return;
    }

    const nextKey = buildEntryKey(entries[0], 0);
    setActiveEntryKey((current) => (
      current && entries.some((entry, index) => buildEntryKey(entry, index) === current)
        ? current
        : nextKey
    ));
  }, [entries, visible]);

  const activeEntry = React.useMemo(
    () => entries.find((entry, index) => buildEntryKey(entry, index) === activeEntryKey) || entries[0] || null,
    [activeEntryKey, entries]
  );

  const allImages = React.useMemo(() => {
    if (!activeEntry) return [];
    if (Array.isArray(activeEntry.images) && activeEntry.images.length) return activeEntry.images;
    return (activeEntry.submission?.submission_details || []).flatMap((detail) => detail.images || []);
  }, [activeEntry]);

  React.useEffect(() => {
    let isCancelled = false;

    if (!visible || !activeEntry) {
      setSignedUrls({});
      setRecommendations([]);
      setIsLoadingUrls(false);
      setIsLoadingRecommendations(false);
      return () => {
        isCancelled = true;
      };
    }

    const imageRows = allImages.filter((image) => image?.file_path);
    if (!imageRows.length) {
      setSignedUrls({});
      setIsLoadingUrls(false);
    } else {
      setIsLoadingUrls(true);
      Promise.all(
        imageRows.map((image) => (
          getHairSubmissionImageSignedUrl(image.file_path).then((result) => ({
            id: image.image_id || image.file_path,
            url: result.data || '',
          }))
        ))
      ).then((results) => {
        if (isCancelled) return;
        const nextUrls = {};
        results.forEach(({ id, url }) => {
          if (url) nextUrls[id] = url;
        });
        setSignedUrls(nextUrls);
        setIsLoadingUrls(false);
      });
    }

    if (Array.isArray(activeEntry.recommendations) && activeEntry.recommendations.length) {
      setRecommendations(activeEntry.recommendations.filter(isHairCareTip));
      setIsLoadingRecommendations(false);
    } else if (activeEntry.submission?.submission_id) {
      setIsLoadingRecommendations(true);
      fetchDonorRecommendationsBySubmissionId(activeEntry.submission.submission_id, 5).then((result) => {
        if (isCancelled) return;
        setRecommendations((result.data || []).filter(isHairCareTip));
        setIsLoadingRecommendations(false);
      });
    } else {
      setRecommendations([]);
      setIsLoadingRecommendations(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [activeEntry, allImages, visible]);

  if (!visible || !activeEntry?.screening) return null;

  const screening = activeEntry.screening;
  const tone = normalizeConditionTone(screening.detected_condition);
  const hasAssessmentDetails = Boolean(
    screening?.estimated_length != null
    || screening?.detected_texture
    || screening?.detected_density
    || screening?.summary
    || screening?.visible_damage_notes
  );
  const photoUris = allImages
    .map((image) => signedUrls[image.image_id || image.file_path])
    .filter(Boolean);
  const compactSummary = toCompactSummary(screening.summary);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: roles.metaText }]}>Hair check</Text>
              <Text style={[styles.title, { color: roles.headingText }]}>
                {dateKey ? formatModalDateLabel(dateKey) : formatSavedDateTime(screening.created_at)}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={[styles.statusCard, { backgroundColor: tone.dotColor + '14', borderColor: tone.dotColor + '44' }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: tone.dotColor }]} />
                <Text style={[styles.statusLabel, { color: tone.dotColor }]}>{screening.decision || tone.label}</Text>
              </View>
              <Text style={[styles.statusSubtext, { color: roles.bodyText }]}>
                Saved {formatSavedDateTime(screening.created_at)}
              </Text>
            </View>

            {entries.length > 1 ? (
              <View style={styles.entrySwitcherWrap}>
                <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Entries</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.entrySwitcherRow}>
                  {entries.map((entry, index) => {
                    const entryKey = buildEntryKey(entry, index);
                    const isActive = entryKey === activeEntryKey;
                    return (
                      <Pressable
                        key={entryKey}
                        onPress={() => setActiveEntryKey(entryKey)}
                        style={[
                          styles.entryChip,
                          {
                            backgroundColor: isActive ? roles.iconPrimarySurface : roles.supportCardBackground,
                            borderColor: isActive ? roles.iconPrimaryColor : roles.supportCardBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryChipText,
                            { color: isActive ? roles.iconPrimaryColor : roles.bodyText },
                          ]}
                        >
                          {formatTimeLabel(entry?.screening?.created_at)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Photos</Text>
            {isLoadingUrls ? (
              <View style={styles.photoLoading}>
                <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              </View>
            ) : photoUris.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {photoUris.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.photo} resizeMode="cover" />
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyText, { color: roles.metaText }]}>No photos saved for this check.</Text>
            )}

            {hasAssessmentDetails ? (
              <>
                <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Hair assessment</Text>
                <View style={[styles.assessmentCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                  {compactSummary ? (
                    <Text style={[styles.assessmentSummary, { color: roles.bodyText }]}>
                      {compactSummary}
                    </Text>
                  ) : null}

                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaKey, { color: roles.metaText }]}>Condition</Text>
                      <Text style={[styles.metaValue, { color: roles.headingText }]}>
                        {screening.detected_condition || 'Not detected'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaKey, { color: roles.metaText }]}>Texture</Text>
                      <Text style={[styles.metaValue, { color: roles.headingText }]}>
                        {screening.detected_texture || 'Not detected'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaKey, { color: roles.metaText }]}>Density</Text>
                      <Text style={[styles.metaValue, { color: roles.headingText }]}>
                        {screening.detected_density || 'Not detected'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaKey, { color: roles.metaText }]}>Length</Text>
                      <Text style={[styles.metaValue, { color: roles.headingText }]}>
                        {formatLengthLabel(screening.estimated_length)}
                      </Text>
                    </View>
                  </View>

                  {screening.visible_damage_notes ? (
                    <Text style={[styles.damageNote, { color: roles.metaText }]}>
                      {screening.visible_damage_notes}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {(isLoadingRecommendations || recommendations.length) ? (
              <>
                <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Improvement advice</Text>
                {isLoadingRecommendations ? (
                  <ActivityIndicator
                    color={resolvedTheme?.primaryColor || theme.colors.brandPrimary}
                    style={styles.recommendationLoader}
                  />
                ) : (
                  <View style={styles.recommendationList}>
                    {recommendations.slice(0, 2).map((recommendation, index) => (
                      <View
                        key={recommendation.recommendation_id || `${recommendation.title}-${index}`}
                        style={[styles.recommendationCard, { borderColor: roles.defaultCardBorder }]}
                      >
                        {recommendation.title ? (
                          <Text style={[styles.recommendationTitle, { color: roles.headingText }]}>
                            {recommendation.title}
                          </Text>
                        ) : null}
                        {recommendation.recommendation_text ? (
                          <Text style={[styles.recommendationText, { color: roles.bodyText }]}>
                            {recommendation.recommendation_text}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>
        </AppCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '74%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
  },
  statusLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  statusSubtext: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginTop: 2,
  },
  entrySwitcherWrap: {
    gap: theme.spacing.xs,
  },
  entrySwitcherRow: {
    gap: theme.spacing.xs,
  },
  entryChip: {
    minWidth: 74,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
  },
  entryChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  photoLoading: {
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: {
    gap: theme.spacing.xs,
    paddingBottom: 2,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  assessmentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    gap: theme.spacing.xs,
  },
  assessmentSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metaItem: {
    minWidth: 76,
    gap: 2,
  },
  metaKey: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  damageNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontStyle: 'italic',
  },
  recommendationLoader: {
    marginVertical: theme.spacing.sm,
  },
  recommendationList: {
    gap: theme.spacing.xs,
  },
  recommendationCard: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 2,
  },
  recommendationTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  recommendationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
