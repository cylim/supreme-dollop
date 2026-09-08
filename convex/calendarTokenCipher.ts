import type { CalendarCipher } from './calendarConnection'

export function createCalendarCipher(encodedKey: string | undefined): CalendarCipher {
  return {
    encrypt: async (value) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: asArrayBuffer(iv) },
        await encryptionKey(encodedKey),
        asArrayBuffer(new TextEncoder().encode(value)),
      )
      return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`
    },
    decrypt: async (value) => {
      const [ivPart, encryptedPart] = value.split('.')
      if (!ivPart || !encryptedPart) {
        throw new Error('Stored calendar token is invalid.')
      }
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asArrayBuffer(base64ToBytes(ivPart)) },
        await encryptionKey(encodedKey),
        asArrayBuffer(base64ToBytes(encryptedPart)),
      )
      return new TextDecoder().decode(decrypted)
    },
  }
}

async function encryptionKey(encoded: string | undefined): Promise<CryptoKey> {
  if (!encoded) throw new Error('Calendar encryption is not configured.')
  const raw = base64ToBytes(encoded)
  if (raw.byteLength !== 32) {
    throw new Error('Calendar encryption key must contain 32 bytes.')
  }
  return await crypto.subtle.importKey(
    'raw',
    asArrayBuffer(raw),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}
