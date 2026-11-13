import { sellerApplicationErrorMessage, validateSellerApplication } from './sellerApplications.ts';

const emptyValues = { nomeNegocio: '', documento: '', responsavel: '', telefone: '', categoria: '', descricao: '' };
const errors = validateSellerApplication(emptyValues, 'empreendedor');
if (Object.keys(errors).length !== 6 || errors.documento !== 'Informe o CPF.') throw new Error('required-field validation failed');

const validValues = { nomeNegocio: 'Negócio teste', documento: '12345678900', responsavel: 'Pessoa teste', telefone: '11999999999', categoria: 'Serviços', descricao: 'Descrição de teste' };
if (Object.keys(validateSellerApplication(validValues, 'empreendedor')).length !== 0) throw new Error('valid-form validation failed');
if (!sellerApplicationErrorMessage({ code: '42501' }).includes('permissão')) throw new Error('permission error mapping failed');
if (!sellerApplicationErrorMessage({ code: '23503' }).includes('perfil')) throw new Error('profile error mapping failed');
