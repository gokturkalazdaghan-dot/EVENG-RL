/**
 * ChatScreen — uçtan uca şifreli birebir sohbet.
 *
 * RAPOR DÜĞMESİ BAŞLIK ÇUBUĞUNDA, KALICI. Taciz DM'de olur; kullanıcının
 * sohbetten çıkıp profile gidip oradan rapor etmesini beklemek, çoğu
 * kullanıcının hiç rapor etmemesi demektir.
 *
 * E2EE ALTINDA RAPOR NASIL ÇALIŞIR
 * Sunucu mesajları çözemez. Bu yüzden rapor, mesaj bağlamını İSTEMCİDEN,
 * kullanıcının açık onayıyla taşır (`SecureMessaging.reportMessage`).
 * Kullanıcıya neyin gönderileceği ÖNCEDEN gösterilir — bunu atlamak, E2EE
 * vaadini sessizce delmek olurdu.
 *
 * KÖPRÜ YOKSA BESTELEYİCİ AÇILMAZ
 * `SecureMessaging.isAvailable` false ise (E2EE native köprüsü kurulu
 * değil) yazma alanı GÖSTERİLMEZ. Aksi halde kullanıcı mesajını yazar,
 * gönder'e basar, mesaj hiçbir yere gitmez ve ekranda hiçbir açıklama
 * çıkmaz — gönderdiğini sanır. Gönderilmemiş bir mesajı gönderilmiş
 * göstermek, bu ekranın yapabileceği en zararlı hatadır.
 *
 * EK GÜVENLİĞİ
 * Gönderilen medya, mesaja iliştirilmeden ÖNCE `/v1/dm/attachment` ucundan
 * geçer ve moderasyon taramasından `approved` dönmezse gönderilemez.
 * Metin gizliliği korunur, medya taranmış olur.
 */
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/components/Button';
import { createLogger } from '@/core/logging/Logger';
import { SecureMessaging, type PlainMessage } from '@/social/SecureMessaging';
import { Viewer } from '@/social/Viewer';
import { ReportAffordance } from '@/ui/components/ReportAffordance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const log = createLogger('ChatScreen');

export interface ChatScreenProps {
  readonly conversationId: string;
  readonly peerId: string;
  readonly peerHandle: string;
  readonly messages: readonly PlainMessage[];
  readonly onSent?: (message: PlainMessage) => void;
}

export function ChatScreen({
  conversationId,
  peerId,
  peerHandle,
  messages,
  onSent,
}: ChatScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [sendError, setSendError] = useState(false);

  // Köprünün varlığı çalışma anında değişmez (native modül kaydı uygulama
  // ömrü boyunca sabittir), bu yüzden state değil doğrudan okunur.
  const available = SecureMessaging.isAvailable;

  const send = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;

    setSending(true);
    setSendError(false);
    const message: PlainMessage = {
      messageId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      conversationId,
      senderId: Viewer.anonymousId,
      text,
      sentAtMs: Date.now(),
    };

    const result = await SecureMessaging.send(peerId, message);
    setSending(false);

    if (!result.ok) {
      // Taslak KORUNUR ve hata GÖRÜNÜR olur: sessizce temizlemek,
      // kullanıcının yazdığını kaybetmesi ve gönderildi sanması demek.
      log.warn('Mesaj gönderilemedi');
      setSendError(true);
      return;
    }
    setDraft('');
    onSent?.(message);
  }, [conversationId, draft, onSent, peerId, sending]);

  const revealSafetyNumber = useCallback(async () => {
    // Güvenlik numarası: karşı tarafın anahtarının değişip değişmediğini
    // kullanıcı kendi doğrulayabilsin diye. Sunucuya güvenmeden.
    setSafetyNumber(await SecureMessaging.safetyNumber(peerId));
  }, [peerId]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[typography.heading, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {peerHandle}
        </Text>

        {/*
          RAPOR DÜĞMESİ BAŞLIKTA — sohbetten çıkmadan, tek dokunuşla.
          `contentId` olarak konuşma kimliği verilir: rapor akışı, hangi
          mesajın raporlandığını kullanıcıya seçtirir.
        */}
        <ReportAffordance
          surface="chat"
          contentId={conversationId}
          authorId={peerId}
          viewerId={Viewer.anonymousId}
        />
      </View>

      <Pressable accessibilityRole="button" onPress={() => void revealSafetyNumber()}>
        <Text style={[typography.caption, styles.safety, { color: theme.colors.textSecondary }]}>
          {safetyNumber ?? t('dm.safetyNumberHint')}
        </Text>
      </Pressable>

      <FlatList
        data={messages as PlainMessage[]}
        inverted
        keyExtractor={(message) => message.messageId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === Viewer.anonymousId;
          return (
            <View
              style={[
                styles.bubble,
                {
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? theme.colors.accent : theme.colors.surfaceElevated,
                },
              ]}
            >
              <Text
                style={[
                  typography.body,
                  { color: mine ? '#FFFFFF' : theme.colors.textPrimary },
                ]}
              >
                {item.text}
              </Text>
            </View>
          );
        }}
      />

      {sendError ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, styles.notice, { color: theme.colors.danger }]}
        >
          {t('dm.sendFailed')}
        </Text>
      ) : null}

      {available ? (
      <View style={[styles.composer, { borderTopColor: theme.colors.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('dm.placeholder')}
          placeholderTextColor={theme.colors.textSecondary}
          multiline
          style={[
            styles.input,
            { color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated },
          ]}
        />
        <Button
          label={t('dm.send')}
          size="small"
          block={false}
          busy={sending}
          disabled={draft.trim().length === 0}
          onPress={() => void send()}
        />
      </View>
      ) : (
        <Text
          accessibilityRole="alert"
          style={[
            typography.caption,
            styles.notice,
            { color: theme.colors.textSecondary, borderTopColor: theme.colors.border },
          ]}
        >
          {t('dm.unavailable')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  safety: { textAlign: 'center', paddingVertical: spacing.xs },
  notice: { textAlign: 'center', padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: '78%', padding: spacing.sm, borderRadius: radius.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    ...typography.body,
  },
  sendButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
});
