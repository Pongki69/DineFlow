import { describe, expect, it } from 'vitest';
import { visibleNavigation } from './navigation';

describe('role-driven navigation', () => {
  it('shows staff administration only when the API grants that permission', () => {
    expect(visibleNavigation(['dashboard.view', 'users.manage']).map(([label]) => label)).toContain('Team & access');
    expect(visibleNavigation(['dashboard.view']).map(([label]) => label)).not.toContain('Team & access');
  });

  it('keeps rider and customer navigation limited to granted capabilities', () => {
    expect(visibleNavigation(['deliveries.assigned']).map(([label]) => label)).toEqual(['My deliveries']);
    expect(visibleNavigation(['customer.account', 'reservations.create'], ['customer']).map(([label]) => label)).toEqual(['Browse menu', 'Restaurant location', 'Reserve a table', 'My orders', 'My account']);
    expect(visibleNavigation(['customer.account'], ['administrator'])).toEqual([]);
  });
});
