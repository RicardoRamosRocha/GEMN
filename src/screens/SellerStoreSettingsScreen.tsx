import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { sellerSettingsUiFixture } from '../dev/sellerSettingsUiFixtures';
import {
  createCashbackIdempotencyKey,
  getCurrentSellerSettings,
  SellerSettingsServiceError,
  updateSellerCashback,
  updateSellerGemnAcceptance,
  validateCashbackPercentual,
} from '../services/sellerSettings';
import type { SellerSettings } from '../types/sellerSettings';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type Confirmation =
  | { kind: 'gemn'; value: boolean }
  | { kind: 'cashback'; value: number; idempotencyKey: string }
  | null;

function formatPercentual(value: number | null) {
  return value === null ? '' : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function parsePercentual(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function friendlyError(error: unknown) {
  if (error instanceof SellerSettingsServiceError) return error.message;
  return 'Não foi possível atualizar as configurações. Tente novamente.';
}

export default function SellerStoreSettingsScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const fixturesEnabled = isGemnUiFixturesEnabled();
  const [settings, setSettings] = React.useState<SellerSettings | null>(null);
  const [cashbackInput, setCashbackInput] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'gemn' | 'cashback' | null>(null);
  const [confirmation, setConfirmation] = React.useState<Confirmation>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [cashbackRetry, setCashbackRetry] = React.useState<Confirmation & { kind: 'cashback' } | null>(null);

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = fixturesEnabled ? { ...sellerSettingsUiFixture } : await getCurrentSellerSettings();
      setSettings(next);
      setCashbackInput(formatPercentual(next.cashbackPercentual));
      return next;
    } catch (error) {
      setErrorMessage(friendlyError(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [fixturesEnabled]);

  useFocusEffect(React.useCallback(() => {
    void loadSettings();
  }, [loadSettings]));

  function requestGemnChange(value: boolean) {
    if (!settings || saving || (settings.status === 'suspenso' && value)) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setConfirmation({ kind: 'gemn', value });
  }

  function requestCashbackChange() {
    if (!settings || saving || settings.status === 'suspenso') return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const value = validateCashbackPercentual(parsePercentual(cashbackInput));
      setConfirmation({ kind: 'cashback', value, idempotencyKey: cashbackRetry?.idempotencyKey ?? createCashbackIdempotencyKey() });
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  }

  async function confirmChange() {
    if (!confirmation || !settings || saving) return;
    setSaving(confirmation.kind);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (confirmation.kind === 'gemn') {
        if (fixturesEnabled) {
          setSettings((current) => current ? { ...current, aceitaGemn: confirmation.value } : current);
        } else {
          const result = await updateSellerGemnAcceptance(confirmation.value);
          setSettings((current) => current ? { ...current, aceitaGemn: result.aceitaGemn } : current);
        }
        setSuccessMessage('Aceitação de GEMN atualizada com sucesso.');
      } else {
        if (fixturesEnabled) {
          setSettings((current) => current ? { ...current, cashbackPercentual: confirmation.value } : current);
        } else {
          const result = await updateSellerCashback({ percentual: confirmation.value, idempotencyKey: confirmation.idempotencyKey });
          setSettings((current) => current ? { ...current, cashbackPercentual: result.percentual } : current);
        }
        setCashbackInput(formatPercentual(confirmation.value));
        setCashbackRetry(null);
        setSuccessMessage('Cashback atualizado com sucesso.');
      }
      setConfirmation(null);
    } catch (error) {
      if (confirmation.kind === 'cashback' && error instanceof SellerSettingsServiceError && error.retryable) {
        setCashbackRetry(confirmation);
      }
      setErrorMessage(friendlyError(error));
      setConfirmation(null);
    } finally {
      setSaving(null);
    }
  }

  async function reconcileCashback() {
    if (!cashbackRetry || saving) return;
    const next = await loadSettings();
    if (!next) return;
    if (next.cashbackPercentual === cashbackRetry.value) {
      setCashbackRetry(null);
      setSuccessMessage('A alteração de cashback já foi confirmada pelo servidor.');
      setErrorMessage(null);
      return;
    }
    setConfirmation(cashbackRetry);
  }

  if (loading && !settings) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><Text style={styles.feedbackText}>Carregando configurações...</Text></AppScreen>;
  }

  if (!settings) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><MaterialCommunityIcons name="store-off-outline" size={44} color={colors.textMuted} /><Text style={styles.feedbackTitle}>Configurações indisponíveis</Text><Text accessibilityRole="alert" style={styles.feedbackText}>{errorMessage}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadSettings(); }} /></AppScreen>;
  }

  const suspended = settings.status === 'suspenso';

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.header, wide && styles.headerWide]}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>Minha Loja</Text><Text style={styles.title}>Configurações da Loja</Text><Text style={styles.subtitle}>Controle as condições comerciais exibidas aos seus clientes.</Text></View>
        <AppBadge label={suspended ? 'Suspensa' : 'Ativa'} variant={suspended ? 'warning' : 'success'} />
      </View>

      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoText}>Modo de demonstração — alterações locais simuladas</Text></View> : null}
      {errorMessage ? <AppCard style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>{cashbackRetry ? <AppButton title="Reconciliar e tentar novamente" variant="outline" onPress={() => { void reconcileCashback(); }} loading={loading} style={styles.errorAction} /> : null}</AppCard> : null}
      {successMessage ? <AppCard style={styles.successCard}><MaterialCommunityIcons name="check-circle-outline" size={21} color={colors.success} /><Text style={styles.successText}>{successMessage}</Text></AppCard> : null}

      <AppCard elevated={wide} style={styles.storeCard}>
        <View style={styles.storeIcon}><MaterialCommunityIcons name="storefront-outline" size={30} color={colors.primary} /></View>
        <View style={styles.storeCopy}><Text style={styles.storeName}>{settings.storeName}</Text><Text style={styles.storeId}>Vendedor {suspended ? 'suspenso' : 'ativo'} no GEMN</Text></View>
      </AppCard>

      <AppCard elevated={wide} style={styles.sectionCard}>
        <View style={styles.sectionHeader}><View style={styles.sectionIcon}><MaterialCommunityIcons name="currency-usd" size={21} color={colors.primary} /></View><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>Aceitar GEMN</Text><Text style={styles.sectionSubtitle}>Defina se sua loja aceita GEMN como parte do pagamento.</Text></View></View>
        <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>Aceitação global</Text><Text style={styles.settingValue}>{settings.aceitaGemn ? 'Ativada' : 'Desativada'}</Text></View><TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: settings.aceitaGemn, disabled: suspended && !settings.aceitaGemn }} onPress={() => { requestGemnChange(!settings.aceitaGemn); }} disabled={suspended && !settings.aceitaGemn || saving !== null} style={[styles.switch, settings.aceitaGemn && styles.switchActive, suspended && !settings.aceitaGemn && styles.switchDisabled]}><View style={[styles.switchThumb, settings.aceitaGemn && styles.switchThumbActive]} /></TouchableOpacity></View>
        <View style={styles.infoRow}><MaterialCommunityIcons name="information-outline" size={19} color={colors.primary} /><Text style={styles.helperText}>Cada anúncio também precisa estar habilitado para aceitar GEMN. Desativar aqui bloqueia pagamentos GEMN para toda a loja.</Text></View>
        {suspended ? <Text style={styles.warningText}>Vendedores suspensos não podem ativar GEMN, mas podem desativar a aceitação existente.</Text> : null}
      </AppCard>

      <AppCard elevated={wide} style={styles.sectionCard}>
        <View style={styles.sectionHeader}><View style={styles.sectionIcon}><MaterialCommunityIcons name="cash-plus" size={21} color={colors.primary} /></View><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>Cashback</Text><Text style={styles.sectionSubtitle}>Configure o percentual oferecido em compras elegíveis.</Text></View></View>
        <AppInput label="Percentual vigente" value={cashbackInput} onChangeText={setCashbackInput} placeholder="Ex.: 2,50" keyboardType="decimal-pad" inputMode="decimal" helperText="Informe um valor entre 0% e 20%, com até duas casas decimais." editable={!suspended && saving === null && cashbackRetry === null} />
        <AppButton title="Salvar cashback" onPress={requestCashbackChange} loading={saving === 'cashback'} disabled={suspended || saving !== null || cashbackRetry !== null} style={styles.saveButton} />
        {suspended ? <Text style={styles.warningText}>A configuração de cashback fica bloqueada enquanto a loja estiver suspensa.</Text> : null}
        <View style={styles.infoRow}><MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.primary} /><Text style={styles.helperText}>O cashback incide somente sobre a parcela paga em dinheiro real. Alterações não modificam pedidos anteriores.</Text></View>
      </AppCard>

      <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => { if (!saving) setConfirmation(null); }}>
        <View style={styles.modalBackdrop}><AppCard style={styles.confirmationCard}><View style={styles.confirmationIcon}><MaterialCommunityIcons name="shield-check-outline" size={32} color={colors.primary} /></View><Text style={styles.confirmationTitle}>Confirmar alteração?</Text><Text style={styles.confirmationText}>{confirmation?.kind === 'gemn' ? `Sua loja ficará ${confirmation.value ? 'habilitada' : 'desabilitada'} para aceitar GEMN.` : `O cashback será definido em ${confirmation?.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%.`}</Text><View style={styles.confirmationActions}><AppButton title="Cancelar" variant="outline" onPress={() => { setConfirmation(null); }} disabled={saving !== null} style={styles.confirmationButton} /><AppButton title="Confirmar" onPress={() => { void confirmChange(); }} loading={saving !== null} style={styles.confirmationButton} /></View></AppCard></View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { gap: spacing.sm },
  headerWide: { maxWidth: 920, alignSelf: 'center', width: '100%' },
  headerCopy: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoText: { ...typography.caption, color: colors.warning, flex: 1 },
  storeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, maxWidth: 920, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  storeIcon: { width: 58, height: 58, borderRadius: radius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  storeCopy: { flex: 1, gap: spacing.xs },
  storeName: { ...typography.heading2, color: colors.text },
  storeId: { ...typography.bodySmall, color: colors.textSecondary },
  sectionCard: { gap: spacing.md, maxWidth: 920, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, gap: spacing.xs },
  sectionTitle: { ...typography.heading3, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  settingCopy: { flex: 1, gap: spacing.xs },
  settingLabel: { ...typography.caption, color: colors.textSecondary },
  settingValue: { ...typography.heading4, color: colors.text },
  switch: { width: 58, height: 32, borderRadius: radius.full, padding: 4, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  switchActive: { backgroundColor: colors.primary },
  switchDisabled: { opacity: 0.55 },
  switchThumb: { width: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.white },
  switchThumbActive: { alignSelf: 'flex-end' },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  helperText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  warningText: { ...typography.caption, color: colors.warning },
  saveButton: { alignSelf: 'stretch' },
  errorCard: { maxWidth: 920, width: '100%', alignSelf: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error },
  errorText: { ...typography.bodySmall, color: colors.error },
  errorAction: { alignSelf: 'flex-start' },
  successCard: { maxWidth: 920, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primaryLight },
  successText: { ...typography.bodySmall, color: colors.success, flex: 1 },
  feedbackState: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)', padding: spacing.lg },
  confirmationCard: { width: '100%', maxWidth: 430, alignItems: 'center', gap: spacing.md },
  confirmationIcon: { width: 58, height: 58, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  confirmationTitle: { ...typography.heading3, color: colors.text },
  confirmationText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  confirmationActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  confirmationButton: { flex: 1 },
});
