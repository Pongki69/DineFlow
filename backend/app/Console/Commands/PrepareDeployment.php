<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\RestaurantSetting;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class PrepareDeployment extends Command
{
    protected $signature = 'dineflow:deploy';
    protected $description = 'Prepare roles, initial settings, and an optional first deployment administrator';

    public function handle(): int
    {
        $this->call('db:seed', ['--class' => AuthSeeder::class, '--force' => true]);
        foreach (['service_charge_percent', 'tax_percent'] as $key) {
            RestaurantSetting::firstOrCreate(['key' => $key], ['value' => ['rate' => 0]]);
        }
        RestaurantSetting::firstOrCreate(['key' => 'delivery_fee'], ['value' => ['amount' => 0]]);

        if (User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->exists()) {
            $this->info('Existing administrator preserved.');
            return self::SUCCESS;
        }

        $email = strtolower(trim((string) config('hosting.admin_email')));
        $password = (string) config('hosting.admin_password');
        if ($email === '' && $password === '') {
            $this->info('Roles and settings ready. No initial administrator credentials supplied.');
            return self::SUCCESS;
        }

        $name = trim((string) config('hosting.admin_name'));
        $validator = Validator::make(compact('name', 'email', 'password'), [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:254', 'unique:users,email'],
            'password' => ['required', Password::min(12)->mixedCase()->numbers()->symbols()],
        ]);
        if ($validator->fails()) {
            $this->error('Initial administrator settings are invalid. Use an unused email and a password with 12+ characters, mixed case, a number, and a symbol.');
            return self::FAILURE;
        }

        DB::transaction(function () use ($name, $email, $password): void {
            $role = Role::where('slug', 'administrator')->lockForUpdate()->firstOrFail();
            if (User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->exists()) return;
            $user = User::create(['name' => $name, 'email' => $email, 'password' => $password, 'is_active' => true]);
            $user->roles()->attach($role);
            AuditLog::create([
                'event' => 'auth.initial_admin_created', 'subject_type' => $user->getMorphClass(),
                'subject_id' => $user->id, 'metadata' => ['source' => 'deployment'],
            ]);
        });
        $this->info('Initial administrator is ready. Credentials were not logged.');
        return self::SUCCESS;
    }
}
