import React, { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useProducts, type GemnProduct, type ListingImage, type ListingStatus, type ProductType } from '../context/ProductsContext';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type FormField = 'name' | 'description' | 'category' | 'price' | 'gemnValue';
type FormErrors = Partial<Record<FormField, string>>;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function parseAmount(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export default function CreateProductScreen({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const editingProduct = route?.params?.product as GemnProduct | undefined;
  const isEditing = Boolean(editingProduct);
  const { addProduct, updateProduct, categories, categoriesLoading, categoriesError } = useProducts();
  const [type, setType] = useState<ProductType>('Produto');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [acceptsGemn, setAcceptsGemn] = useState(false);
  const [gemnValue, setGemnValue] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationStatus, setConfirmationStatus] = useState<ListingStatus>('ativo');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImagePickerAsset | null>(null);
  const [savedListingId, setSavedListingId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingProduct) return;
    setType(editingProduct.type);
    setName(editingProduct.name);
    setDescription(editingProduct.description);
    setCategory(editingProduct.categoryId);
    setPrice(String(editingProduct.price).replace('.', ','));
    setAcceptsGemn(editingProduct.acceptsGemn);
    setGemnValue(editingProduct.gemnValue === undefined ? '' : String(editingProduct.gemnValue).replace('.', ','));
  }, [editingProduct]);

  async function handlePublish(status: ListingStatus = editingProduct?.status ?? 'ativo') {
    if (isPublishing) return;
    setPublicationError(null);
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

    setIsPublishing(true);
    const payload = {
      type,
      name: name.trim(),
      description: description.trim(),
      categoryId: category,
      price: parseAmount(price),
      acceptsGemn,
      ...(acceptsGemn ? { gemnValue: parseAmount(gemnValue) } : {}),
      status,
    };
    const image: ListingImage | undefined = selectedImage ? {
      uri: selectedImage.uri,
      fileName: selectedImage.fileName,
      fileSize: selectedImage.fileSize,
      mimeType: selectedImage.mimeType,
      file: selectedImage.file,
    } : undefined;
    const result = isEditing && editingProduct
      ? await updateProduct(editingProduct.id, payload, image)
      : savedListingId
        ? await updateProduct(savedListingId, payload, image)
        : await addProduct(payload, image);
    setIsPublishing(false);
    if (result.error) {
      if (!isEditing && result.product) setSavedListingId(result.product.id);
      setPublicationError(result.error);
      return;
    }
    setConfirmationStatus(status);
    setShowConfirmation(true);
  }

  function closeConfirmation() {
    setShowConfirmation(false);
    navigation.goBack();
  }

  function clearError(field: FormField) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function chooseImage() {
    setPublicationError(null);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    } catch {
      setPublicationError('Não foi possível abrir a galeria de imagens. Tente novamente.');
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = (asset.mimeType ?? asset.file?.type)?.toLowerCase().split(';')[0] ?? '';
    const extension = asset.fileName?.toLowerCase().split('.').pop();
    const inferredMimeType = mimeType || (extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension ? `image/${extension}` : '');
    if (!ALLOWED_IMAGE_TYPES.has(inferredMimeType)) {
      setPublicationError('Escolha uma imagem JPEG, PNG ou WebP.');
      return;
    }
    if (asset.fileSize !== undefined && asset.fileSize > MAX_IMAGE_SIZE) {
      setPublicationError('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setSelectedImage({ ...asset, mimeType: inferredMimeType });
  }

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.header, wide && styles.headerWide]}>
        <Text style={styles.eyebrow}>Marketplace GEMN</Text>
        <Text style={styles.title}>{isEditing ? 'Editar anúncio' : 'Cadastrar anúncio'}</Text>
        <Text style={styles.subtitle}>{isEditing ? 'Atualize as informações do seu anúncio.' : 'Divulgue seu produto ou serviço para a comunidade.'}</Text>
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
              const selected = category === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { setCategory(option.id); clearError('category'); }}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                >
                  <Text style={[styles.categoryText, selected && styles.selectedText]}>{option.name}</Text>
                  {selected ? <MaterialCommunityIcons name="check" size={15} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {categoriesLoading ? <Text style={styles.helperText}>Carregando categorias...</Text> : null}
          {categoriesError ? <Text style={styles.errorText}>{categoriesError}</Text> : null}
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

        <View style={styles.field}>
          <Text style={styles.label}>Foto principal (opcional)</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={selectedImage || editingProduct?.imageUrl ? 'Trocar foto principal' : 'Escolher foto principal'} onPress={() => { void chooseImage(); }} style={styles.imagePicker}>
            {selectedImage ? <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} /> : editingProduct?.imageUrl ? <Image source={{ uri: editingProduct.imageUrl }} style={styles.imagePreview} /> : <View style={styles.imagePlaceholder}><MaterialCommunityIcons name="image-plus" size={34} color={colors.primary} /><Text style={styles.imagePlaceholderText}>Adicionar uma foto</Text></View>}
            <View style={styles.imagePickerAction}><MaterialCommunityIcons name="camera-outline" size={18} color={colors.primary} /><Text style={styles.imagePickerText}>{selectedImage || editingProduct?.imageUrl ? 'Trocar foto' : 'Escolher foto'}</Text></View>
          </TouchableOpacity>
          <Text style={styles.helperText}>JPEG, PNG ou WebP • até 5 MB</Text>
        </View>
      </AppCard>

      {publicationError ? <Text style={[styles.errorText, styles.formError]}>{publicationError}</Text> : null}
      <View style={[styles.actions, wide && styles.publishActionsWide]}>
        {!isEditing ? <AppButton title="Salvar rascunho" variant="outline" onPress={() => { void handlePublish('rascunho'); }} loading={isPublishing} disabled={categoriesLoading || categories.length === 0} style={styles.draftButton} /> : null}
        <AppButton title={isEditing ? 'Salvar alterações' : 'Publicar anúncio'} onPress={() => { void handlePublish(isEditing ? editingProduct?.status : 'ativo'); }} loading={isPublishing} disabled={categoriesLoading || categories.length === 0} style={styles.publishButton} />
      </View>

      <Modal visible={showConfirmation} transparent animationType="fade" onRequestClose={closeConfirmation}>
        <View style={styles.modalBackdrop}>
          <AppCard style={styles.confirmationCard}>
            <View style={styles.confirmationIcon}>
              <MaterialCommunityIcons name="check-circle-outline" size={34} color={colors.primary} />
            </View>
            <AppBadge label={confirmationStatus === 'ativo' ? 'PUBLICADO' : confirmationStatus === 'rascunho' ? 'RASCUNHO SALVO' : 'INATIVO'} variant={confirmationStatus === 'ativo' ? 'success' : 'warning'} />
            <Text style={styles.confirmationTitle}>{isEditing ? 'Anúncio atualizado' : confirmationStatus === 'ativo' ? 'Anúncio publicado' : 'Rascunho salvo'}</Text>
            <Text style={styles.confirmationMessage}>
              {confirmationStatus === 'ativo' ? 'A alteração foi confirmada pelo Supabase e o anúncio está disponível para a comunidade.' : 'A alteração foi confirmada pelo Supabase e o anúncio permanece disponível somente para você.'}
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
  helperText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  imagePicker: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  imagePreview: { width: '100%', height: 180, resizeMode: 'cover' },
  imagePlaceholder: { height: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  imagePlaceholderText: { ...typography.bodySmall, color: colors.textSecondary },
  imagePickerAction: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.surface },
  imagePickerText: { ...typography.label, color: colors.primary },
  formError: { width: '100%', maxWidth: 760, alignSelf: 'center', textAlign: 'center' },
  publishButton: { width: '100%', maxWidth: 760, alignSelf: 'center', minHeight: 54 },
  actions: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', gap: spacing.sm },
  publishActionsWide: { marginTop: spacing.xs },
  draftButton: { flex: 1, minHeight: 54 },
  publishButtonWide: { marginTop: spacing.xs },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)', padding: spacing.lg },
  confirmationCard: { width: '100%', maxWidth: 400, alignItems: 'center', padding: spacing.xl, ...shadows.floating },
  confirmationIcon: { width: 58, height: 58, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginBottom: spacing.md },
  confirmationTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.md },
  confirmationMessage: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  confirmationButton: { width: '100%', marginTop: spacing.lg },
});
