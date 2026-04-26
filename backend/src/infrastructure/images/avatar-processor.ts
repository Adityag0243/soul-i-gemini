import sharp from 'sharp';

export const AVATAR_SIZE = 256;
export const AVATAR_THUMB_SIZE = 64;

export interface ProcessedAvatar {
    full: Buffer;
    thumb: Buffer;
    contentType: 'image/webp';
}

// Re-encode the upload to WebP at two sizes. WebP keeps image quality high at
// far smaller bytes than JPEG/PNG, which matters because avatars are fetched
// on every screen.
export async function processAvatar(input: Buffer): Promise<ProcessedAvatar> {
    // Read once, branch the pipeline twice. Sharp's pipeline is synchronous
    // until .toBuffer() so we don't pay the decode cost twice.
    const base = sharp(input).rotate(); // honor EXIF orientation, then strip

    const [full, thumb] = await Promise.all([
        base
            .clone()
            .resize(AVATAR_SIZE, AVATAR_SIZE, {
                fit: 'cover',
                position: 'centre',
            })
            .webp({ quality: 85 })
            .toBuffer(),
        base
            .clone()
            .resize(AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE, {
                fit: 'cover',
                position: 'centre',
            })
            .webp({ quality: 80 })
            .toBuffer(),
    ]);

    return { full, thumb, contentType: 'image/webp' };
}
