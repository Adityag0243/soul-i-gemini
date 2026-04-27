import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { configS3 } from '../../config';
import { InternalError } from '../../core/api-error';
import logger from '../../core/logger';

let _client: S3Client | null = null;

function client(): S3Client {
    if (_client) return _client;
    if (!configS3.awsRegion || !configS3.bucket) {
        throw new InternalError(
            'S3 storage is not configured (set AWS_REGION + S3_BUCKET)',
        );
    }
    _client = new S3Client({
        region: configS3.awsRegion,
        credentials:
            configS3.awsAccessKeyId && configS3.awsSecretAccessKey
                ? {
                      accessKeyId: configS3.awsAccessKeyId,
                      secretAccessKey: configS3.awsSecretAccessKey,
                  }
                : undefined,
    });
    return _client;
}

// Build the public URL for a given object key. Prefers the CDN if configured,
// falls back to the direct S3 path-style URL otherwise.
export function publicUrl(key: string): string {
    if (configS3.cdnBaseUrl) {
        return `${configS3.cdnBaseUrl}/${key}`;
    }
    return `https://${configS3.bucket}.s3.${configS3.awsRegion}.amazonaws.com/${key}`;
}

export async function putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
}): Promise<string> {
    await client().send(
        new PutObjectCommand({
            Bucket: configS3.bucket,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
            CacheControl: params.cacheControl ?? 'public, max-age=31536000',
        }),
    );
    return publicUrl(params.key);
}

// Delete an object by URL or key. Best-effort — logs and swallows errors so
// callers (e.g. avatar replacement) don't fail user requests if cleanup blips.
export async function deleteByUrl(urlOrKey: string): Promise<void> {
    const key = urlToKey(urlOrKey);
    if (!key) return;
    try {
        await client().send(
            new DeleteObjectCommand({
                Bucket: configS3.bucket,
                Key: key,
            }),
        );
    } catch (error) {
        logger.warn('S3 delete failed', { key, error });
    }
}

// Recover the object key from a full URL. Returns null if the URL doesn't look
// like one we issued (e.g. external picture from an OAuth provider).
function urlToKey(urlOrKey: string): string | null {
    if (!urlOrKey) return null;
    if (configS3.cdnBaseUrl && urlOrKey.startsWith(configS3.cdnBaseUrl + '/')) {
        return urlOrKey.slice(configS3.cdnBaseUrl.length + 1);
    }
    const directPrefix = `https://${configS3.bucket}.s3.${configS3.awsRegion}.amazonaws.com/`;
    if (urlOrKey.startsWith(directPrefix)) {
        return urlOrKey.slice(directPrefix.length);
    }
    // Bare key passthrough (allows callers that already have a key).
    if (!urlOrKey.startsWith('http')) return urlOrKey;
    return null;
}

export default {
    putObject,
    deleteByUrl,
    publicUrl,
};
