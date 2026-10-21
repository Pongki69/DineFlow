<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class AuthSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            'dashboard.view' => 'View dashboard', 'users.manage' => 'Manage staff accounts', 'roles.assign' => 'Assign roles',
            'settings.manage' => 'Manage restricted settings', 'menu.manage' => 'Manage menu', 'tables.manage' => 'Manage tables',
            'reservations.manage' => 'Manage reservations', 'orders.manage' => 'Manage orders', 'payments.manage' => 'Manage payments',
            'payments.refund' => 'Process authorized refunds', 'reports.operations' => 'View operational reports',
            'reports.financial' => 'View financial reports', 'reports.daily_transactions' => 'View daily transaction summaries', 'audit.view' => 'View audit logs', 'kitchen.orders.view' => 'View kitchen orders',
            'kitchen.orders.update' => 'Update preparation statuses', 'service.tables.view' => 'View assigned tables',
            'service.sessions.manage' => 'Manage assigned dining sessions', 'deliveries.manage' => 'Manage delivery dispatch',
            'deliveries.assigned' => 'Access assigned deliveries', 'customer.account' => 'Manage own customer account',
            'orders.create' => 'Create own customer orders', 'orders.view_own' => 'View own customer orders',
            'orders.view' => 'View restaurant orders',
            'reservations.create' => 'Create own reservations', 'reservations.view_own' => 'View own reservations',
            'floorplan.manage' => 'Edit restaurant floor plans', 'tables.occupancy.manage' => 'Update table occupancy',
        ];
        foreach ($permissions as $slug => $name) Permission::firstOrCreate(['slug' => $slug], ['name' => $name]);

        $map = [
            'administrator' => array_keys($permissions),
            'manager' => ['dashboard.view', 'menu.manage', 'tables.manage', 'service.tables.view', 'service.sessions.manage', 'reservations.manage', 'orders.manage', 'payments.refund', 'reports.operations', 'deliveries.manage', 'floorplan.manage', 'tables.occupancy.manage'],
            'cashier' => ['dashboard.view', 'payments.manage', 'reports.daily_transactions', 'orders.view'],
            'kitchen_staff' => ['kitchen.orders.view', 'kitchen.orders.update'],
            'waiter' => ['service.tables.view', 'service.sessions.manage', 'reservations.manage', 'orders.manage', 'tables.occupancy.manage'],
            'rider' => ['deliveries.assigned'],
            'customer' => ['customer.account', 'orders.create', 'orders.view_own', 'reservations.create', 'reservations.view_own'],
        ];
        $labels = ['administrator' => 'Administrator', 'manager' => 'Manager', 'cashier' => 'Cashier', 'kitchen_staff' => 'Kitchen Staff', 'waiter' => 'Waiter / Service Staff', 'rider' => 'Delivery Rider', 'customer' => 'Customer'];
        foreach ($map as $slug => $slugs) {
            $role = Role::firstOrCreate(['slug' => $slug], ['name' => $labels[$slug], 'is_system' => true]);
            $role->permissions()->sync(Permission::whereIn('slug', $slugs)->pluck('id'));
        }
    }
}
