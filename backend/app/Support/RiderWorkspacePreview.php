<?php

namespace App\Support;

final class RiderWorkspacePreview
{
    public static function prefix(int $riderId): string
    {
        return "DEMO-WORKSPACE-{$riderId}-";
    }

    public static function marker(int $riderId): string
    {
        return "Temporary rider workspace preview v1; rider={$riderId}";
    }

    public static function matches(?string $number, ?string $notes, int $riderId): bool
    {
        return str_starts_with($number ?? '', self::prefix($riderId)) && $notes === self::marker($riderId);
    }
}
