<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeliveryProofService
{
    public function upload(Delivery $delivery, User $rider, UploadedFile $photo): array
    {
        abort_unless($rider->hasRole('rider') && $rider->hasPermission('deliveries.assigned') && $delivery->rider_user_id === $rider->id, 403);
        // Re-encode before taking the delivery row lock. No metadata or original bytes are stored.
        abort_unless(function_exists('imagecreatefromstring'), 503, 'Delivery photo processing is unavailable. Contact the restaurant.');
        $dimensions = @getimagesize($photo->getRealPath());
        if (! $dimensions || $dimensions[0] * $dimensions[1] > 16000000) {
            throw ValidationException::withMessages(['photo' => 'Choose a photo with no more than 16 megapixels.']);
        }
        $source = @imagecreatefromstring($photo->getContent());
        if (! $source) {
            throw ValidationException::withMessages(['photo' => 'This image could not be decoded. Choose another JPG, PNG or WebP.']);
        }
        try {
            $scale = min(1, 1600 / max(imagesx($source), imagesy($source)));
            $image = imagecreatetruecolor(max(1, (int) round(imagesx($source) * $scale)), max(1, (int) round(imagesy($source) * $scale)));
            imagefill($image, 0, 0, imagecolorallocate($image, 255, 255, 255));
            imagecopyresampled($image, $source, 0, 0, 0, 0, imagesx($image), imagesy($image), imagesx($source), imagesy($source));
            ob_start();
            try {
                imagejpeg($image, null, 80);
                $bytes = ob_get_contents();
            } finally {
                ob_end_clean();
                imagedestroy($image);
            }
        } finally {
            imagedestroy($source);
        }
        if (! $bytes || strlen($bytes) > 1024 * 1024) {
            throw ValidationException::withMessages(['photo' => 'This photo is too detailed. Choose a smaller image.']);
        }

        return DB::transaction(function () use ($delivery, $rider, $bytes) {
            // Delivery-local lock is enough: assignment and lifecycle paths lock this same row.
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($rider->hasRole('rider') && $rider->hasPermission('deliveries.assigned') && $locked->rider_user_id === $rider->id, 403);
            if ($locked->status !== 'in_transit') {
                throw ValidationException::withMessages(['photo' => 'Upload the delivery photo at the drop-off while this delivery is in transit.']);
            }
            DB::table('delivery_proofs')->updateOrInsert(['delivery_id' => $locked->id], [
                'rider_user_id' => $rider->id,
                'mime_type' => 'image/jpeg',
                'size_bytes' => strlen($bytes),
                'image_data' => base64_encode($bytes),
                'created_at' => now(), 'updated_at' => now(),
            ]);

            return ['uploaded' => true, 'uploaded_at' => now()->toIso8601String()];
        }, 3);
    }

    public function show(Delivery $delivery, User $user): array
    {
        $rider = $user->hasRole('rider') && $delivery->rider_user_id === $user->id;
        $customer = $delivery->status === 'delivered' && $delivery->order()->where('customer_id', $user->id)->exists();
        abort_unless($rider || $customer || $user->hasPermission('deliveries.manage'), 404);
        $proof = DB::table('delivery_proofs')->where('delivery_id', $delivery->id)->where('rider_user_id', $delivery->rider_user_id)->first();
        abort_unless($proof, 404);

        return ['image' => 'data:'.$proof->mime_type.';base64,'.$proof->image_data, 'uploaded_at' => $proof->updated_at];
    }
}
