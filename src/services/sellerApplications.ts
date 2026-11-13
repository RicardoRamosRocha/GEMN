export type SellerApplicationMemberType = 'empreendedor' | 'empresa';

export type SellerApplicationFormValues = {
  nomeNegocio: string;
  documento: string;
  responsavel: string;
  telefone: string;
  categoria: string;
  descricao: string;
};

export type SellerApplicationFieldErrors = Partial<Record<keyof SellerApplicationFormValues, string>>;

export function validateSellerApplication(values: SellerApplicationFormValues, memberType: SellerApplicationMemberType): SellerApplicationFieldErrors {
  const errors: SellerApplicationFieldErrors = {};
  const requiredFields: Array<[keyof SellerApplicationFormValues, string]> = [
    ['nomeNegocio', 'Informe o nome do negócio.'],
    ['documento', `Informe o ${memberType === 'empreendedor' ? 'CPF' : 'CNPJ'}.`],
    ['responsavel', 'Informe o responsável.'],
    ['telefone', 'Informe o telefone.'],
    ['categoria', 'Informe a categoria.'],
    ['descricao', 'Descreva seu negócio.'],
  ];
  for (const [field, message] of requiredFields) {
    if (!values[field].trim()) errors[field] = message;
  }
  return errors;
}

export function sellerApplicationErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '23505') return 'Você já possui uma solicitação em análise.';
  if (code === '42501') return 'Seu usuário não tem permissão para concluir esta ação.';
  if (code === '23503') return 'Seu perfil ainda não está pronto. Saia e entre novamente antes de tentar.';
  if (code === '23514') return 'Confira o tipo de vendedor e o documento informado.';
  if (code === '23502') return 'Preencha todos os campos obrigatórios.';
  if (code === '42P01' || code === 'PGRST205') return 'O fluxo de vendedores não está configurado no ambiente conectado.';
  return 'Não foi possível concluir a solicitação. Tente novamente.';
}
