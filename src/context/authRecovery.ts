export type RecoveryParams = {
  isRecovery: boolean;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

export function getRecoveryParams(url: string): RecoveryParams {
  const [urlWithoutHash, hash = ''] = url.split('#', 2);
  const query = new URLSearchParams(urlWithoutHash.split('?')[1] ?? '');
  const fragment = new URLSearchParams(hash);
  const get = (key: string) => fragment.get(key) ?? query.get(key);
  const type = get('type');
  const code = get('code');
  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');

  return {
    isRecovery: type === 'recovery' || Boolean(code) || Boolean(accessToken && refreshToken),
    code,
    accessToken,
    refreshToken,
  };
}

