<?php

use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->manager = User::create(['name' => 'Export Manager', 'email' => 'export-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $this->manager->roles()->attach(Role::where('slug', 'manager')->firstOrFail());
    Order::create(['order_number' => 'EXP-001', 'customer_name_snapshot' => 'Ana Reyes', 'order_type' => 'dine_in', 'status' => 'ready_to_serve', 'subtotal' => '450.00', 'total' => '450.00', 'currency' => 'PHP']);
    Order::create(['order_number' => 'EXP-002', 'customer_name_snapshot' => 'Ben Cruz', 'order_type' => 'pickup', 'status' => 'completed', 'subtotal' => '300.00', 'total' => '300.00', 'currency' => 'PHP']);
});

it('exports a styled Excel sheet with a title, real numbers and a total row', function () {
    $response = $this->actingAs($this->manager)->get('/api/v1/reports/export?dataset=orders&format=xlsx');
    $response->assertOk();
    expect($response->headers->get('content-type'))->toContain('spreadsheetml.sheet');

    $zip = new ZipArchive;
    expect($zip->open($response->baseResponse->getFile()->getPathname()))->toBeTrue();
    $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
    $styles = $zip->getFromName('xl/styles.xml');
    $zip->close();

    expect($sheet)->toContain('DineFlow · Orders')
        ->toContain('EXP-001')
        ->toContain('Ready to serve')          // statuses read as words
        ->toContain('<v>450</v>')             // money is a number, not text
        ->toContain('<f>SUM(F4:F5)</f>')      // a total row for the money column
        ->toContain('state="frozen"')         // the header stays in view
        ->toContain('<autoFilter');
    expect($styles)->toContain('&quot;₱&quot;#,##0.00');
});

it('still exports CSV by default', function () {
    $response = $this->actingAs($this->manager)->get('/api/v1/reports/export?dataset=orders');
    $response->assertOk();
    expect($response->headers->get('content-type'))->toContain('text/csv');
    expect($response->streamedContent())->toContain('EXP-002');
});
