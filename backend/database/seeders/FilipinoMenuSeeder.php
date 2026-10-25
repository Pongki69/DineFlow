<?php

namespace Database\Seeders;

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Services\MenuCatalogService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FilipinoMenuSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            ['Sabaw (Soups & Stews)', 'Good for 2–3 pax.', [
                ['Sinigang na Baboy', 380, 'Pork belly in sour tamarind broth with kangkong, radish, and taro'],
                ['Sinigang na Hipon', 420, 'Plump tiger prawns in tamarind broth with mixed vegetables'],
                ['Bulalo Special', 580, 'Slow-cooked beef shank & marrow bone with cabbage, corn, and pechay'],
                ['Tinolang Manok', 320, 'Native chicken in ginger-lemongrass broth with green papaya and sili leaves'],
            ]],
            ['Mga Ulam (Main Viands)', 'Good for 2–3 pax.', [
                ['Kare-Kareng Baka / Tuwalya', 480, 'Tender beef & tripe in rich peanut sauce, served with sauteed bagoong'],
                ['Crispy Pata (Large)', 750, 'Deep-fried pork leg with crispy skin, served with garlic-soy dip'],
                ['Chicken / Pork Adobo', 340, 'Classic braised meat in vinegar, soy sauce, garlic, and bay leaves', null, null, ['Chicken' => 0, 'Pork' => 0]],
                ['Beef Kaldereta', 450, 'Rich beef stew with potatoes, carrots, bell peppers, and melted cheese'],
                ['Bicol Express', 360, 'Spicy pork belly cooked in coconut milk, shrimp paste, and green chilies'],
            ]],
            ['Inihaw (Grill Station)', null, [
                ['Pork Barbecue Skewers', 180, 'Marinated sweet-savory pork skewers grilled over charcoal', 3],
                ['Chicken Inasal (Quarter)', 195, 'Bacolod-style grilled chicken served with chicken oil'],
                ['Inihaw na Liempo', 280, 'Charcoal-grilled marinated pork belly slice'],
                ['Inihaw na Stuffed Pusit', 350, 'Grilled whole squid filled with diced tomatoes and onions'],
            ]],
            ['Pancit & Noodles', 'Good for 2–3 pax.', [
                ['Pancit Canton / Bihon Guisado', 280, 'Stir-fried noodles with chicken, pork liver, and fresh vegetables', null, null, ['Canton' => 0, 'Bihon' => 0]],
                ['Pancit Palabok', 320, 'Rice noodles with savory shrimp sauce, chicharon, boiled egg, and tinapa flakes'],
                ['Sizzling Lomi Special', 250, 'Thick egg noodle soup topped with pork liver, kikiam, and chicharon'],
            ]],
            ['Sizzling Specials & Pulutan', null, [
                ['Sizzling Pork Sisig', 290, 'Chopped pork face & liver with onions, chili, calamansi, and raw egg'],
                ['Sizzling Gambas', 340, 'Shrimp sauteed in garlic butter, tomato sauce, and spicy chili flakes'],
                ['Sizzling Bulalo Steak', 490, 'Beef shank served on a hot plate topped with mushroom gravy and garlic chips'],
                ['Chicharon Bulaklak', 260, 'Deep-fried crispy pork mesentery with spiced vinegar dip'],
            ]],
            ['All-Day Silog Meals (Solo Meals)', 'All served with garlic fried rice (sinangag) and a fried egg (itlog).', [
                ['Tapsilog', 165, 'Beef tapa', null, 1],
                ['Tocilog', 150, 'Pork tocino', null, 1],
                ['Chicksilog', 150, 'Fried chicken', null, 1],
                ['Bangsilog', 160, 'Pan-fried milkfish', null, 1],
                ['Liemposilog', 180, 'Grilled pork belly', null, 1],
            ]],
            ['Rice & Add-Ons', null, [
                ['Plain Rice (Per cup)', 35, null, null, 1],
                ['Garlic Rice (Per cup)', 45, null, null, 1],
                ['Garlic Rice Platter (For 4 pax)', 160, null, null, 4],
                ['Bagoong Rice Platter', 190, null],
                ['Extra Egg (Fried or Poached)', 25, null, 1, null, ['Fried' => 0, 'Poached' => 0]],
            ]],
            ['Panghimagas (Desserts)', null, [
                ['Halo-Halo Special', 150, 'Shaved ice with ube halaya, leche flan, sweet beans, jackfruit, topped with ube ice cream'],
                ['Leche Flan (Whole Tile)', 160, 'Rich and creamy steamed caramel egg custard'],
                ['Turon ala Mode', 130, 'Fried banana-jackfruit rolls topped with a scoop of vanilla ice cream', 2],
                ['Mais con Yelo', 110, 'Sweet corn kernels with shaved ice, evaporated milk, and cornflakes'],
            ]],
            ['Inumin (Beverages)', null, [
                ['Sago’t Gulaman', 70, null, null, null, ['Glass' => 0, 'Pitcher' => 150]],
                ['Fresh Buko Juice (In Shell)', 90, null],
                ['Calamansi Juice / Iced Tea (Glass)', 60, null, null, null, ['Calamansi Juice' => 0, 'Iced Tea' => 0]],
                ['San Miguel Light / Pale Pilsen (330ml bottle)', 85, null, null, null, ['San Miguel Light' => 0, 'Pale Pilsen' => 0]],
                ['Red Horse Beer', 120, null, null, null, ['500ml bottle' => 0, 'Bucket of 5' => 430]],
                ['Bottled Water (500ml)', 35, null],
            ]],
        ];

        DB::transaction(function () use ($groups): void {
            $catalog = app(MenuCatalogService::class);
            foreach ($groups as $groupIndex => [$name, $note, $dishes]) {
                $category = $catalog->saveCategory(['name' => $name, 'description' => $note, 'sort_order' => $groupIndex, 'is_active' => true], MenuCategory::where('name', $name)->first());
                foreach ($dishes as $index => $dish) {
                    [$dishName, $price, $description] = $dish;
                    $variants = [];
                    foreach ($dish[5] ?? [] as $variant => $adjustment) {
                        $variants[] = ['name' => $variant, 'price_adjustment' => $adjustment, 'is_active' => true, 'sort_order' => count($variants)];
                    }
                    $catalog->saveItem([
                        'category_id' => $category->id, 'name' => $dishName,
                        'description' => trim(implode(' ', array_filter([$description, $note]))) ?: null,
                        'base_price' => $price, 'discount_percent' => 0,
                        'pieces' => $dish[3] ?? null, 'servings' => $dish[4] ?? null,
                        'is_active' => true, 'is_available' => true, 'is_sold_out' => false,
                        'sort_order' => $groupIndex * 100 + $index, 'variants' => $variants,
                    ], MenuItem::where('category_id', $category->id)->where('name', $dishName)->first());
                }
            }
        });
    }
}
