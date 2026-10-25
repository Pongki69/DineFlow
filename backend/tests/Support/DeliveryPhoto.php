<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;

class DeliveryPhoto
{
    public static function file(): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            $image = imagecreatetruecolor(4, 4);
            ob_start();
            imagepng($image);
            $bytes = ob_get_clean();
            imagedestroy($image);

            return UploadedFile::fake()->createWithContent('delivery.png', $bytes);
        }

        return UploadedFile::fake()->createWithContent('delivery.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII='));
    }
}
