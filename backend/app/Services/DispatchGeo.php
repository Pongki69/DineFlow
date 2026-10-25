<?php

namespace App\Services;

final class DispatchGeo
{
    public static function distance(float $a, float $b, float $c, float $d): float
    {
        $h = sin(deg2rad($c - $a) / 2) ** 2 + cos(deg2rad($a)) * cos(deg2rad($c)) * sin(deg2rad($d - $b) / 2) ** 2;

        return 6371 * 2 * asin(sqrt(min(1, max(0, $h))));
    }

    public static function hash(float $lat, float $lng): string
    {
        $ranges = [[-180.0, 180.0], [-90.0, 90.0]];
        $alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
        $bits = '';
        for ($i = 0; $i < 20; $i++) {
            $axis = $i % 2;
            $value = $axis === 0 ? $lng : $lat;
            $mid = array_sum($ranges[$axis]) / 2;
            $upper = $value >= $mid;
            $bits .= $upper ? '1' : '0';
            $ranges[$axis][$upper ? 0 : 1] = $mid;
        }

        return implode('', array_map(fn ($part) => $alphabet[bindec($part)], str_split($bits, 5)));
    }

    // Cover every precision-4 cell intersecting the radius bounding box, including cell borders.
    public static function cells(float $lat, float $lng, float $km): array
    {
        $dy = rad2deg($km / 6371);
        $dx = min(180, $dy / max(0.000001, cos(deg2rad($lat))));
        $ys = max(0, (int) floor((max(-90, $lat - $dy) + 90) / (180 / 1024)));
        $ye = min(1023, (int) floor((min(90, $lat + $dy) + 90) / (180 / 1024)));
        $xs = (int) floor(($lng - $dx + 180) / (360 / 1024));
        $xe = (int) floor(($lng + $dx + 180) / (360 / 1024));
        $cells = [];
        for ($y = $ys; $y <= $ye; $y++) {
            for ($x = $xs; $x <= $xe; $x++) {
                $wrapped = (($x % 1024) + 1024) % 1024;
                $cells[] = self::hash(($y + 0.5) * 180 / 1024 - 90, ($wrapped + 0.5) * 360 / 1024 - 180);
            }
        }

        return array_values(array_unique($cells));
    }

    public static function heading(float $lat, float $lng, float $toLat, float $toLng): float
    {
        $dy = deg2rad($toLng - $lng);

        return rad2deg(atan2(sin($dy) * cos(deg2rad($toLat)), cos(deg2rad($lat)) * sin(deg2rad($toLat)) - sin(deg2rad($lat)) * cos(deg2rad($toLat)) * cos($dy)));
    }

    public static function aligned(DeliveryPoint $a, DeliveryPoint $b, float $degrees): bool
    {
        $first = self::heading($a->lat, $a->lng, $a->dropLat, $a->dropLng);
        $second = self::heading($b->lat, $b->lng, $b->dropLat, $b->dropLng);

        return abs(fmod($first - $second + 540, 360) - 180) <= $degrees;
    }
}
