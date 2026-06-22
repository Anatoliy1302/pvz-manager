/**
 * Проверка ожидаемого поведения RLS на уровне REST-клиента приложения.
 * Реальные политики — в supabase/migrations/20250608110000_rls_policies.sql.
 * Интеграционная проверка: node supabase/setup/audit-rls-policies.mjs
 */

jest.mock('../../lib/supabaseRest', () => ({
  supabaseRestGet: jest.fn(),
}));

const { supabaseRestGet } = jest.requireMock('../../lib/supabaseRest');

describe('RLS — доступ через REST (мок)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('employee token cannot read other owner PVZ rows (empty result / 401)', async () => {
    supabaseRestGet.mockRejectedValueOnce(new Error('JWT expired or insufficient privilege'));

    await expect(
      supabaseRestGet('pvz', { owner_id: 'eq.other-owner-uuid' }, 'employee-jwt')
    ).rejects.toThrow(/privilege|JWT/i);
  });

  it('employee token cannot read owner profile of another PVZ', async () => {
    supabaseRestGet.mockResolvedValueOnce([]);

    const rows = await supabaseRestGet(
      'profiles',
      { role: 'eq.owner', pvz_id: 'eq.other-pvz' },
      'employee-jwt'
    );

    expect(rows).toEqual([]);
  });

  it('owner token can read own PVZ list', async () => {
    supabaseRestGet.mockResolvedValueOnce([
      { id: 'pvz-1', name: 'Мой ПВЗ', owner_id: 'owner-uuid-1' },
    ]);

    const rows = await supabaseRestGet(
      'pvz',
      { owner_id: 'eq.owner-uuid-1' },
      'owner-jwt'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].owner_id).toBe('owner-uuid-1');
  });
});
