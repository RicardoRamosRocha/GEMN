import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { useProducts, type ProductType } from '../context/ProductsContext';

type FormField = 'name' | 'description' | 'category' | 'price' | 'gemnValue';
type FormErrors = Partial<Record<FormField, string>>;

const categories = ['Comida', 'Serviços', 'Moda', 'Casa', 'Outros'];

function parseAmount(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export default function CreateProductScreen({ navigation }: any) {
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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Cadastro do anúncio</Text>
        <Text style={styles.subtitle}>
          Divulgue seu produto ou serviço para a comunidade.
        </Text>

        <View style={styles.formCard}>
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
                  <Text style={[styles.typeOptionText, selected && styles.selectedText]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FormLabel text="Nome" />
          <TextInput
            value={name}
            onChangeText={(value) => { setName(value); clearError('name'); }}
            placeholder={type === 'Produto' ? 'Ex.: Cesta de frutas' : 'Ex.: Manutenção elétrica'}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            maxLength={80}
            returnKeyType="next"
          />
          <FieldError message={errors.name} />

          <FormLabel text="Descrição" />
          <TextInput
            value={description}
            onChangeText={(value) => { setDescription(value); clearError('description'); }}
            placeholder="Conte os detalhes do anúncio"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
            maxLength={500}
          />
          <FieldError message={errors.description} />

          <FormLabel text="Categoria" />
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
                  <Text style={[styles.categoryText, selected && styles.selectedText]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FieldError message={errors.category} />

          <FormLabel text="Preço em reais" />
          <View style={styles.amountInputWrap}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              value={price}
              onChangeText={(value) => { setPrice(value); clearError('price'); }}
              placeholder="0,00"
              placeholderTextColor={colors.textSecondary}
              style={styles.amountInput}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
          </View>
          <FieldError message={errors.price} />

          <TouchableOpacity
            style={styles.gemnToggle}
            onPress={() => {
              setAcceptsGemn((current) => !current);
              setErrors((current) => ({ ...current, gemnValue: undefined }));
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptsGemn }}
          >
            <MaterialCommunityIcons
              name={acceptsGemn ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={23}
              color={acceptsGemn ? colors.primary : colors.textSecondary}
            />
            <Text style={styles.gemnToggleText}>Aceita moeda GEMN</Text>
          </TouchableOpacity>

          {acceptsGemn && (
            <>
              <FormLabel text="Valor em GEMN" />
              <View style={styles.amountInputWrap}>
                <TextInput
                  value={gemnValue}
                  onChangeText={(value) => { setGemnValue(value); clearError('gemnValue'); }}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.amountInput}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                />
                <Text style={styles.currencyPrefix}>GEMN</Text>
              </View>
              <FieldError message={errors.gemnValue} />
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.publishButton}
          onPress={handlePublish}
          activeOpacity={0.85}
        >
          <Text style={styles.publishButtonText}>Publicar anúncio</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={colors.white} />
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmation}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmationCard}>
            <View style={styles.confirmationIcon}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={34}
                color={colors.primary}
              />
            </View>
            <Text style={styles.confirmationTitle}>Anúncio validado</Text>
            <Text style={styles.confirmationMessage}>
              O anúncio foi validado e cadastrado neste protótipo. Ele não foi salvo em um banco de dados.
            </Text>
            <TouchableOpacity
              style={styles.confirmationButton}
              onPress={closeConfirmation}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmationButtonText}>Voltar para Meus produtos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FormLabel({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    marginBottom: 20,
  },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  typeOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOption: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  typeOptionSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  typeOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedText: {
    color: colors.primary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  multilineInput: {
    minHeight: 112,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  categoryChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  amountInputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  currencyPrefix: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    minHeight: 46,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 9,
  },
  gemnToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingVertical: 4,
    gap: 9,
  },
  gemnToggleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#B3261E',
    fontSize: 12,
    marginTop: 5,
  },
  publishButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 15,
    marginTop: 18,
    gap: 9,
  },
  publishButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 24,
  },
  confirmationCard: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
  },
  confirmationIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    marginBottom: 14,
  },
  confirmationTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  confirmationMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  confirmationButton: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 12,
  },
  confirmationButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
