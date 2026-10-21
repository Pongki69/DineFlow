<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use App\Models\AuditLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

class CreateAdministrator extends Command
{
    protected $signature = 'dineflow:admin:create';
    protected $description = 'Interactively create the first DineFlow administrator';

    public function handle(): int
    {
        if (User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->exists()) {
            $this->error('An administrator already exists; this setup command can only create the first one.');
            return self::FAILURE;
        }

        $name = trim($this->ask('Administrator name') ?? '');
        $email = strtolower(trim($this->ask('Administrator email') ?? ''));
        $password = (string) $this->secret('Strong password (12+ characters, mixed case, number, symbol)');
        $confirmation = (string) $this->secret('Confirm password');
        $validator = Validator::make(['name' => $name, 'email' => $email, 'password' => $password, 'confirmation' => $confirmation], [
            'name' => ['required', 'string', 'max:120'], 'email' => ['required', 'email', 'max:254', 'unique:users,email'],
            'password' => ['required', 'same:confirmation', Password::min(12)->mixedCase()->numbers()->symbols()],
            'confirmation' => ['required', 'string'],
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());
            return self::FAILURE;
        }

        try {
        DB::transaction(function () use ($name, $email, $password): void {
            $adminRole = Role::where('slug', 'administrator')->lockForUpdate()->firstOrFail();
            if (User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->exists()) {
                throw new RuntimeException('An administrator was created while this setup was in progress.');
            }
            $user = User::create(['name' => $name, 'email' => $email, 'password' => Hash::make($password), 'is_active' => true, 'email_verified_at' => now()]);
            $user->roles()->sync([$adminRole->id]);
            AuditLog::create(['actor_id' => null, 'event' => 'auth.initial_admin_created', 'subject_type' => $user->getMorphClass(), 'subject_id' => $user->id, 'metadata' => ['source' => 'artisan']]);
        });
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage());
            return self::FAILURE;
        }
        $this->info('Administrator account created. Store the credentials securely.');
        return self::SUCCESS;
    }
}
