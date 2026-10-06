import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useProducts, type ProductType } from '../context/ProductsContext';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type FormField = 'name' | 'description' | 'category' | 'price' | 'gemnValue';
type FormErrors = Partial<Record<FormField, string>>;

const categories = ['Comida', 'Serviços', 'Moda', 'Casa', 'Outros'];

function parseAmount(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export default function CreateProductScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { addProduct } = useProducts();
  const [type, setType] = useState<ProductType>('Produto');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [acceptsGemn, setAcceptsGemn] = useState(false);
  const [gemnValue, setGemnValue] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirmation, setShowConfirmation] = useState(false);

  function handlePublish() {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = 'Informe o nome do anúncio.';
    if (!description.trim()) nextErrors.description = 'Informe a descrição.';
    if (!category) nextErrors.category = 'Escolha uma categoria.';
    if (!price.trim() || !Number.isFinite(parseAmount(price)) || parseAmount(price) <= 0) {
      nextErrors.price = 'Informe um preço válido em reais.';
    }
    if (
      acceptsGemn &&
      (!gemnValue.trim() || !Number.isFinite(parseAmount(gemnValue)) || parseAmount(gemnValue) <= 0)
    ) {
      nextErrors.gemnValue = 'Informe um valor GEMN válido.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    addProduct({
      type,
      name: name.trim(),
      description: description.trim(),
      category,
      price: parseAmount(price),
      acceptsGemn,
      ...(acceptsGemn ? { gemnValue: parseAmount(gemnValue) } : {}),
      icon: type === 'Produto' ? 'package-variant-closed' : 'tools',
    });
    setShowConfirmation(true);
  }

  function closeConfirmation() {
    setShowConfirmation(false);
    navigation.goBack();
  }

  function clearError(field: FormField) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.header, wide && styles.headerWide]}>
        <Text style={styles.eyebrow}>Marketplace GEMN</Text>
        <Text style={styles.title}>Cadastrar anúncio</Text>
        <Text style={styles.subtitle}>Divulgue seu produto ou serviço para a comunidade.</Text>
      </View>

      <AppCard elevated={wide} style={[styles.formCard, wide && styles.formCardWide]}>
        <View style={styles.formHeader}>
          <View style={styles.formHeaderIcon}>
            <MaterialCommunityIcons name="store-plus-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Detalhes do anúncio</Text>
            <Text style={styles.formSubtitle}>Preencha as informações principais</Text>
          </View>
        </View>

        <Text style={styles.label}>Tipo do anúncio</Text>
        <View style={styles.typeOptions}>
          {(['Produto', 'Serviço'] as ProductType[]).map((option) => {
            const selected = type === option;
            return (
              <TouchableOpacity
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setType(option)}
                style={[styles.typeOption, selected && styles.typeOptionSelected]}
              >
                <MaterialCommunityIcons
                  name={option === 'Produto' ? 'package-variant-closed' : 'tools'}
                  size={20}
                  color={selected ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.typeOptionText, selected && styles.selectedText]}>{option}</Text>
                {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <AppInput
          label="Nome"
          value={name}
          onChangeText={(value) => { setName(value); clearError('name'); }}
          placeholder={type === 'Produto' ? 'Ex.: Cesta de frutas' : 'Ex.: Manutenção elétrica'}
          error={errors.name}
          maxLength={80}
          returnKeyType="next"
          containerStyle={styles.field}
        />

        <AppInput
          label="Descrição"
          value={description}
          onChangeText={(value) => { setDescription(value); clearError('description'); }}
          placeholder="Conte os detalhes do anúncio"
          error={errors.description}
          multiline
          maxLength={500}
          containerStyle={styles.field}
        />

        <View style={styles.field}>
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categories}>
            {categories.map((option) => {
              const selected = category === option;
              return (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { setCategory(option); clearError('category'); }}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                >
                  <Text style={[styles.categoryText, selected && styles.selectedText]}>{option}</Text>
                  {selected ? <MaterialCommunityIcons name="check" size={15} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <FieldError message={errors.category} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Preço em reais</Text>
          <View style={[styles.amountInputWrap, errors.price && styles.inputError]}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <AppInput
              value={price}
              onChangeText={(value) => { setPrice(value); clearError('price'); }}
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              containerStyle={styles.amountField}
              inputStyle={styles.amountInput}
            />
          </View>
          <FieldError message={errors.price} />
        </View>

        <TouchableOpacity
          style={[styles.gemnToggle, acceptsGemn && styles.gemnToggleActive]}
          onPress={() => {
            setAcceptsGemn((current) => !current);
            setErrors((current) => ({ ...current, gemnValue: undefined }));
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptsGemn }}
        >
          <View style={[styles.checkbox, acceptsGemn && styles.checkboxActive]}>
            {acceptsGemn ? <MaterialCommunityIcons name="check" size={16} color={colors.white} /> : null}
          </View>
          <View style={styles.gemnCopy}>
            <Text style={styles.gemnToggleText}>Aceita moeda GEMN</Text>
            <Text style={styles.gemnHelper}>Permita pagamento com a moeda da comunidade</Text>
          </View>
        </TouchableOpacity>

        {acceptsGemn && (
          <View style={styles.field}>
            <Text style={styles.label}>Valor em GEMN</Text>
            <View style={[styles.amountInputWrap, errors.gemnValue && styles.inputError]}>
              <AppInput
                value={gemnValue}
                onChangeText={(value) => { setGemnValue(value); clearError('gemnValue'); }}
                placeholder="0"
                keyboardType="decimal-pad"
                inputMode="decimal"
                containerStyle={styles.amountField}
                inputStyle={styles.amountInput}
              />
              <Text style={styles.currencyPrefix}>GEMN</Text>
            </View>
            <FieldError message={errors.gemnValue} />
          </View>
        )}
      </AppCard>

      <AppButton title="Publicar anúncio" onPress={handlePublish} style={[styles.publishButton, wide && styles.publishButtonWide]} />

      <Modal visible={showConfirmation} transparent animationType="fade" onRequestClose={closeConfirmation}>
        <View style={styles.modalBackdrop}>
          <AppCard style={styles.confirmationCard}>
            <View style={styles.confirmationIcon}>
              <MaterialCommunityIcons name="check-circle-outline" size={34} color={colors.primary} />
            </View>
            <AppBadge label="PUBLICADO" variant="success" />
            <Text style={styles.confirmationTitle}>Anúncio validado</Text>
            <Text style={styles.confirmationMessage}>
              O anúncio foi validado e cadastrado neste protótipo. Ele não foi salvo em um banco de dados.
            </Text>
            <AppButton title="Voltar para Meus produtos" onPress={closeConfirmation} style={styles.confirmationButton} />
          </AppCard>
        </View>
      </Modal>
    </AppScreen>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.xs },
  headerWide: { paddingHorizontal: spacing.lg },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  formCard: { width: '100%', maxWidth: 760, alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  formCardWide: { padding: spacing.xl },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  formHeaderIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  formHeaderCopy: { flex: 1, gap: spacing.xs },
  formTitle: { ...typography.heading3, color: colors.text },
  formSubtitle: { ...typography.caption, color: colors.textSecondary },
  field: { marginTop: spacing.md },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  typeOptions: { flexDirection: 'row', gap: spacing.sm },
  typeOption: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  typeOptionSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  typeOptionText: { ...typography.label, color: colors.textSecondary },
  selectedText: { color: colors.primary },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  categoryChipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  categoryText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  amountInputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  inputError: { borderColor: colors.error },
  amountField: { flex: 1 },
  amountInput: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 46, paddingHorizontal: spacing.sm },
  currencyPrefix: { ...typography.label, color: colors.textSecondary },
  gemnToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  gemnToggleActive: { borderColor: colors.secondary, backgroundColor: colors.secondaryLight },
  checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  gemnCopy: { flex: 1, marginLeft: spacing.md, gap: 2 },
  gemnToggleText: { ...typography.label, color: colors.text },
  gemnHelper: { ...typography.caption, color: colors.textSecondary },
  errorText: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  publishButton: { width: '100%', maxWidth: 760, alignSelf: 'center', minHeight: 54 },
  publishButtonWide: { marginTop: spacing.xs },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)', padding: spacing.lg },
  confirmationCard: { width: '100%', maxWidth: 400, alignItems: 'center', padding: spacing.xl, ...shadows.floating },
  confirmationIcon: { width: 58, height: 58, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginBottom: spacing.md },
  confirmationTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.md },
  confirmationMessage: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  confirmationButton: { width: '100%', marginTop: spacing.lg },
});
