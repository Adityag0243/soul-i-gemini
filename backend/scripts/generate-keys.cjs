const { generateKeyPairSync } = require('crypto');
const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const keysDir = join(__dirname, '../keys');

// Create keys directory if it doesn't exist
mkdirSync(keysDir, { recursive: true });

// Generate RSA key pair
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Save to files
writeFileSync(join(keysDir, 'private.pem'), privateKey);
writeFileSync(join(keysDir, 'public.pem'), publicKey);

console.log('✓ JWT keys generated successfully in keys/ directory');
console.log('\n⚠️  IMPORTANT: Never commit these keys to git!');
console.log('\nFor production, add them to your secrets manager:');
console.log('JWT_PRIVATE_KEY=' + privateKey.replace(/\n/g, '\\n'));
console.log('\nJWT_PUBLIC_KEY=' + publicKey.replace(/\n/g, '\\n'));